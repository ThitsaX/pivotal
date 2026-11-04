# Local PKI Ceremony Test: Vault OSS + SoftHSM2

## Goal

Locally test the same PKI ceremony used in production without AWS KMS or
CloudHSM.

  Production                    Local testing
  ----------------------------- ----------------------
  AWS KMS / CloudHSM Root key   SoftHSM2
  KMS `Sign` / HSM signing      PKCS#11 signing
  Vault OSS on Kubernetes       Vault OSS in Docker
  AWS KMS auto-unseal           Shamir/manual unseal
  EC2 ceremony environment      Local Docker / Mac

## Architecture

``` mermaid
flowchart TD
    A["SoftHSM2<br/>Root CA Private Key 🔐"] -->|"PKCS#11 signing"| B["Root CA Ceremony Script"]
    B --> C["root-ca.crt"]

    D["Vault OSS PKI"] --> E["Generate Intermediate Key Pair"]
    E --> F["Intermediate Private Key 🔐<br/>Stays inside Vault"]
    E --> G["intermediate.csr"]

    G --> H["Intermediate CA Ceremony Script"]
    C --> H
    A -->|"PKCS#11 signing"| H
    H --> I["intermediate.crt"]

    I --> J["Vault PKI<br/>intermediate/set-signed"]
    J --> K["Vault ready to issue<br/>DFSP certificates"]
```

## Steps

1.  Start **Vault OSS** using Docker Compose.
2.  Initialize and manually unseal Vault using **Shamir**.
3.  Start **SoftHSM2** locally/in Docker.
4.  Initialize a SoftHSM token.
5.  Generate the **Root CA RSA private key inside SoftHSM2**.
6.  Run the ceremony script to create `root-ca.crt`; the Root private
    key stays in SoftHSM.
7.  Enable/configure the Vault PKI secrets engine.
8.  Generate the Intermediate key and CSR inside Vault:

``` bash
vault write -format=json \
  pki_dfsp/intermediate/generate/internal \
  common_name="Pivotal DFSP Intermediate CA" \
  issuer_name="pivotal-dfsp-intermediate" \
  | jq -r '.data.csr' > intermediate.csr
```

9.  Run the ceremony script to sign `intermediate.csr` using the SoftHSM
    Root key.
10. The script produces `intermediate.crt`.
11. Import it back into Vault:

``` bash
vault write \
  pki_dfsp/intermediate/set-signed \
  certificate=@intermediate.crt
```

12. Configure a Vault PKI role and issue a test DFSP certificate.

## Conceptual Ceremony Script

The production and local workflows are conceptually the same:

``` text
intermediate.csr
       │
       ▼
Parse and validate CSR
       │
       ▼
Build X.509 Intermediate CA TBS
       │
       ▼
SHA-256(TBS)
       │
       ▼
Root Signer
       │
       ├── Production: AWS KMS Sign / CloudHSM
       │
       └── Local: SoftHSM2 via PKCS#11
       │
       ▼
Root CA Signature
       │
       ▼
Assemble TBS + Signature
       │
       ▼
intermediate.crt
       │
       ▼
Vault PKI intermediate/set-signed
```

Pseudo-code:

``` python
csr = load_csr("intermediate.csr")

tbs = build_intermediate_certificate_tbs(
    csr=csr,
    issuer=root_ca_subject,
    ca=True,
    key_usage=["keyCertSign", "cRLSign"]
)

digest = sha256(tbs)

# Backend differs by environment.
signature = root_signer.sign(digest)

certificate = assemble_x509_certificate(
    tbs=tbs,
    signature=signature
)

write_file("intermediate.crt", certificate)
```

## Suggested Signer Abstraction

``` text
RootSigner
   ├── KmsSigner       → AWS KMS
   ├── Pkcs11Signer    → CloudHSM
   └── Pkcs11Signer    → SoftHSM2 (local)
```

SoftHSM2 is a **development substitute**, not a security-equivalent
replacement for a production HSM.
