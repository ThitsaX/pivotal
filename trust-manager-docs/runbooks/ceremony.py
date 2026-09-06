#!/usr/bin/env python3
"""Builds the X.509 certificates for the PKI ceremony, with an external signer.

The root private key lives in AWS KMS and cannot be exported, so nothing here ever holds
it. KMS signs a **digest**; this script builds everything around that signature. That is
the only difference between the KMS-backed and HSM-backed ceremonies -- swap the one call
in KmsSigner.sign for a PKCS#11 C_Sign and the rest is identical.

Two subcommands:

  self-sign-root      builds a self-signed root certificate over a KMS public key
  sign-intermediate   signs a CSR from Vault, producing an intermediate CA certificate

A local signer exists for testing the certificate construction without touching KMS. It
is deliberately not reachable from the command line: a root built from a local key would
be a root whose private key is on a laptop, which is the one thing this design exists to
prevent.

Dependencies: asn1crypto, cryptography, boto3.
"""

import argparse
import hashlib
import secrets
import sys
from datetime import datetime, timedelta, timezone

from asn1crypto import algos, core, csr as asn1csr, keys, pem, x509

# RSA PKCS#1 v1.5 over SHA-256. Fixed rather than configurable: the signature algorithm
# is recorded inside the certificate and must match what the signer actually did, so a
# mismatch here produces a certificate that verifies nowhere and explains itself nowhere.
SIGNATURE_ALGORITHM = "sha256_rsa"
KMS_SIGNING_ALGORITHM = "RSASSA_PKCS1_V1_5_SHA_256"


class KmsSigner:
    """Signs with a non-exportable KMS key. The only component that talks to AWS."""

    def __init__(self, key_id: str):
        import boto3

        self._kms = boto3.client("kms")
        self._key_id = key_id

    def public_key_der(self) -> bytes:
        return self._kms.get_public_key(KeyId=self._key_id)["PublicKey"]

    def sign(self, tbs_der: bytes) -> bytes:
        # MessageType='DIGEST' -- KMS signs the hash we computed, not the document. The
        # certificate can be any size; the digest is always 32 bytes.
        digest = hashlib.sha256(tbs_der).digest()

        return self._kms.sign(
            KeyId=self._key_id,
            Message=digest,
            MessageType="DIGEST",
            SigningAlgorithm=KMS_SIGNING_ALGORITHM,
        )["Signature"]


class LocalSigner:
    """A local RSA key, for testing certificate construction only. Never for a real root."""

    def __init__(self, private_key):
        self._key = private_key

    def public_key_der(self) -> bytes:
        from cryptography.hazmat.primitives import serialization

        return self._key.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    def sign(self, tbs_der: bytes) -> bytes:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        return self._key.sign(tbs_der, padding.PKCS1v15(), hashes.SHA256())


def key_identifier(public_key_info: keys.PublicKeyInfo) -> bytes:
    """SHA-1 over the public key bitstring, which is what RFC 5280 method 1 specifies.

    SHA-1 is not a security property here. The identifier only helps a verifier pick which
    certificate to try next when building a path; a collision costs a wasted attempt.
    """
    return hashlib.sha1(public_key_info["public_key"].contents).digest()


def validity(days: int) -> x509.Validity:
    # Backdated five minutes. Clock skew between the ceremony host and whatever first
    # verifies the certificate is otherwise enough to make a fresh certificate "not yet
    # valid", which reads as a broken ceremony rather than as a wrong clock.
    now = datetime.now(timezone.utc) - timedelta(minutes=5)

    return x509.Validity(
        {
            "not_before": x509.Time({"utc_time": now}),
            "not_after": x509.Time({"utc_time": now + timedelta(days=days)}),
        }
    )


def ca_extensions(
    subject_key: keys.PublicKeyInfo,
    authority_key: keys.PublicKeyInfo,
    path_len: int | None,
) -> x509.Extensions:
    """The extensions every CA certificate in this design carries.

    basic_constraints and key_usage are critical: a verifier that does not understand them
    must refuse the certificate rather than treat it as an ordinary leaf. Without that, a
    CA certificate could be accepted as an end-entity certificate.
    """
    basic_constraints = {"ca": True}

    if path_len is not None:
        # pathlen:0 on the intermediate means it may issue leaves and nothing that can
        # itself issue. It is what stops a compromised intermediate minting its own CA.
        basic_constraints["path_len_constraint"] = path_len

    return x509.Extensions(
        [
            x509.Extension(
                {
                    "extn_id": "basic_constraints",
                    "critical": True,
                    "extn_value": x509.BasicConstraints(basic_constraints),
                }
            ),
            x509.Extension(
                {
                    "extn_id": "key_usage",
                    "critical": True,
                    "extn_value": x509.KeyUsage({"key_cert_sign", "crl_sign"}),
                }
            ),
            x509.Extension(
                {
                    "extn_id": "key_identifier",
                    "critical": False,
                    "extn_value": core.OctetString(key_identifier(subject_key)),
                }
            ),
            x509.Extension(
                {
                    "extn_id": "authority_key_identifier",
                    "critical": False,
                    "extn_value": x509.AuthorityKeyIdentifier(
                        {"key_identifier": key_identifier(authority_key)}
                    ),
                }
            ),
        ]
    )


def assemble(tbs: x509.TbsCertificate, signer) -> bytes:
    """DER-encode the TBS, have the signer sign it, and wrap the result as a certificate."""
    signature = signer.sign(tbs.dump())

    certificate = x509.Certificate(
        {
            "tbs_certificate": tbs,
            "signature_algorithm": algos.SignedDigestAlgorithm(
                {"algorithm": SIGNATURE_ALGORITHM}
            ),
            "signature_value": core.OctetBitString(signature),
        }
    )

    return pem.armor("CERTIFICATE", certificate.dump())


def build_root(signer, common_name: str, organization: str, days: int) -> bytes:
    public_key = keys.PublicKeyInfo.load(signer.public_key_der())

    name = x509.Name.build(
        {"common_name": common_name, "organization_name": organization}
    )

    tbs = x509.TbsCertificate(
        {
            "version": "v3",
            # 20 bytes of randomness. A predictable serial lets an attacker who can
            # influence certificate content aim a hash collision at a specific one.
            "serial_number": int.from_bytes(secrets.token_bytes(20), "big") >> 1,
            "signature": algos.SignedDigestAlgorithm({"algorithm": SIGNATURE_ALGORITHM}),
            # Self-signed: issuer and subject are the same name, signed by its own key.
            "issuer": name,
            "validity": validity(days),
            "subject": name,
            "subject_public_key_info": public_key,
            "extensions": ca_extensions(public_key, public_key, path_len=None),
        }
    )

    return assemble(tbs, signer)


def build_intermediate(signer, root_pem: bytes, csr_pem: bytes, days: int) -> bytes:
    root = x509.Certificate.load(strip_pem(root_pem))
    request = asn1csr.CertificationRequest.load(strip_pem(csr_pem))

    verify_csr_signature(csr_pem)
    verify_signer_matches_root(signer, root)

    info = request["certification_request_info"]
    subject_key = info["subject_pk_info"]

    tbs = x509.TbsCertificate(
        {
            "version": "v3",
            "serial_number": int.from_bytes(secrets.token_bytes(20), "big") >> 1,
            "signature": algos.SignedDigestAlgorithm({"algorithm": SIGNATURE_ALGORITHM}),
            # Issuer is the root's SUBJECT, not its issuer. This is the field a verifier
            # follows to find the next certificate in the path.
            "issuer": root["tbs_certificate"]["subject"],
            "validity": validity(days),
            # Subject and key come from the CSR. Vault generated that key inside itself
            # and it has never left; only the public half is here.
            "subject": info["subject"],
            "subject_public_key_info": subject_key,
            "extensions": ca_extensions(
                subject_key,
                root["tbs_certificate"]["subject_public_key_info"],
                path_len=0,
            ),
        }
    )

    return assemble(tbs, signer)


def verify_signer_matches_root(signer, root: x509.Certificate) -> None:
    """Refuses to sign when the signing key is not the one the root certificate carries.

    Passing a root certificate from one domain while signing with the other key produces a
    certificate that is structurally perfect and verifies nowhere. The failure surfaces much
    later as an opaque padding error from whatever first tries to check the chain, so it is
    caught here where the two inputs are both in hand.
    """
    signing_key = keys.PublicKeyInfo.load(signer.public_key_der())
    root_key = root["tbs_certificate"]["subject_public_key_info"]

    if signing_key.dump() != root_key.dump():
        raise SystemExit(
            "The signing key does not match the public key in the root certificate.\n"
            "  --kms-key and --root-cert name different authorities.\n"
            "  Either pass the matching root, or build one with self-sign-root first."
        )


def verify_csr_signature(csr_pem: bytes) -> None:
    """Rejects a CSR whose self-signature does not check out.

    The signature proves the requester holds the private key for the public key inside.
    Skipping it would let anyone submit someone else's public key and have the root
    certify a subject they cannot actually speak for.
    """
    from cryptography import x509 as crypto_x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    request = crypto_x509.load_pem_x509_csr(csr_pem)

    if not request.is_signature_valid:
        raise SystemExit("The CSR signature does not verify; refusing to sign it.")

    del hashes, padding  # imported for clarity about what is being checked


def strip_pem(data: bytes) -> bytes:
    _, _, der = pem.unarmor(data)

    return der


def read(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def write(path: str, data: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(data)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    root = subcommands.add_parser("self-sign-root")
    root.add_argument("--kms-key", required=True, help="key id or alias/...")
    root.add_argument("--common-name", required=True)
    root.add_argument("--organization", default="ThitsaWorks")
    root.add_argument("--days", type=int, default=7300)
    root.add_argument("--out", required=True)

    intermediate = subcommands.add_parser("sign-intermediate")
    intermediate.add_argument("--kms-key", required=True)
    intermediate.add_argument("--root-cert", required=True)
    intermediate.add_argument("--csr", required=True)
    intermediate.add_argument("--days", type=int, default=3650)
    intermediate.add_argument("--out", required=True)

    args = parser.parse_args(argv)
    signer = KmsSigner(args.kms_key)

    if args.command == "self-sign-root":
        certificate = build_root(
            signer, args.common_name, args.organization, args.days
        )
    else:
        certificate = build_intermediate(
            signer, read(args.root_cert), read(args.csr), args.days
        )

    write(args.out, certificate)
    print(f"Wrote {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
