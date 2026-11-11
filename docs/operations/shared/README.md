# shared/

One file, used by every ceremony.

## `ceremony.py`

**What it does:** builds the X.509 certificates for a CA ceremony — the root, the intermediate, and
the root CRL — and asks an external signer to sign each one.

**Why it exists:** neither AWS KMS nor CloudHSM is a certificate authority. Both will sign a digest
and nothing more. Something has to construct the certificate around that signature, and this is it.
That is also why Vault needs no KMS or HSM integration of any kind: it hands out a certificate
request and receives a signed certificate back, which is an ordinary externally-signed-intermediate
arrangement.

**Why it is shared:** the signer is swappable. Only the call that produces the signature differs
between profiles — everything about the certificate itself is identical, so duplicating the file per
profile would mean two copies of certificate-building code drifting apart.

```
  self-sign-root       the root certificate, over the signer's own public key
  sign-intermediate    signs a certificate request from Vault
  sign-crl             a root-signed CRL — needed to revoke an intermediate
```

## Who uses it

| Profile | Uses it | Signs with |
| --- | --- | --- |
| [`../kms/`](../kms/) | **Yes** — [`setup/1-ca-ceremony.md`](../kms/setup/1-ca-ceremony.md) calls all three subcommands | `kms:Sign` against a non-exportable AWS KMS key |
| [`../hsm/`](../hsm/) | **Not directly today.** [`setup/scripts/ceremony-hsm.sh`](../hsm/setup/scripts/ceremony-hsm.sh) builds its certificates with OpenSSL through the PKCS#11 engine instead | PKCS#11 `C_Sign` inside CloudHSM |
| [`../local/`](../local/) | **No.** [`setup/scripts/ceremony-local.sh`](../local/setup/scripts/ceremony-local.sh) also uses OpenSSL with the PKCS#11 engine, against SoftHSM2 | PKCS#11 `C_Sign` inside SoftHSM2 |

So in practice this is the **KMS profile's** certificate builder, kept here rather than inside
`kms/` because it is written to be signer-agnostic and the HSM profile could adopt it by swapping one
call. If the HSM ceremony is ever moved off OpenSSL, this is what it would move to.

## Dependencies

`python3` with `asn1crypto`, `cryptography` and `boto3`.

## Status

`self-sign-root` and `sign-intermediate` have been run against real AWS KMS keys, producing both
trust domains. No production root has been created with them yet.

`sign-crl` is newer. It has been tested locally — both an empty CRL and one with a revoked entry
parse under `openssl crl` and verify against their root — but it has not been run against a live KMS
key. Produce a CRL during the ceremony while the tooling is open, rather than finding out during an
incident that you cannot revoke an intermediate.
