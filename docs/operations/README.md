# Operations — Certificate Authorities, Keys and Signing

Everything needed to bring up and run Pivotal's cryptographic identity: the CA ceremony, key
custody, certificate issuance, and the per-DFSP procedures that follow.

Written for whoever is standing the environment up. No prior context is assumed.

---

## Pick your profile first

The choice is **where each DFSP's JWS signing private key lives**, and therefore where signing
happens. It is set by one variable, `KEY_PROVIDER`, and it is not a fork — everything else is the
same.

| | `KEY_PROVIDER` | Keys live in | Signing happens | Choose it when |
| --- | --- | --- | --- | --- |
| **[`kms/`](./kms/)** | `vault-kv` | Vault, read into process memory at startup | in the service | **Default.** No dedicated-hardware requirement |
| **[`hsm/`](./hsm/)** | `pkcs11` | A CloudHSM cluster, non-exportable | inside the hardware | A dedicated HSM is required for private-key storage |
| **[`local/`](./local/)** | — | SoftHSM2 on your laptop | in the module | Development and CI only. Never a deployed environment |

Start at that profile's `README.md`. Each one is self-contained: its own `setup/`, its own
`runbooks/`, and every script in a `scripts/` folder beside the guide that runs it.

**If you are unsure, it is `kms/`.** Isolation there rests on per-tenant Vault path policy rather
than a hardware boundary — a real difference, but one to accept knowingly, not to avoid by picking
hardware you do not need and cannot easily run.

---

## How each profile folder is laid out

```
<profile>/
├── README.md     what this profile is, and what to know before you start
├── setup/        ONE-TIME, per environment. Numbered — run in order
│   └── scripts/
└── runbooks/     REPEATED. Named by what triggers them
    └── scripts/
```

Setup runs once when an environment is created. Runbooks run again every time their trigger
happens — a DFSP joins, a key rotates, a DFSP leaves.

## Shared

[`shared/`](./shared/) holds [`ceremony.py`](./shared/ceremony.py), which builds the X.509
certificates for a CA ceremony and hands each one to an external signer. Neither AWS KMS nor
CloudHSM is a certificate authority — both only sign a digest, so something has to construct the
certificate around it.

The KMS ceremony calls it. The HSM and local ceremonies build their certificates with OpenSSL
through the PKCS#11 engine instead. See [`shared/README.md`](./shared/README.md).

---

## Before you run anything

**A CA root cannot be recovered.** Root keys are created inside AWS KMS or CloudHSM with no export
API. Nothing to back up, nothing to restore, and everything issued under a root stops verifying if
that key is lost. Keep root creation out of Terraform, Argo CD and every other reconcile loop.

**Publish a new public key before anything signs with the new private key.** Peers verify against
what the Hub's registry holds, and one key is registered per FSP at a time. Getting this backwards
takes that DFSP offline — not degraded, offline. Every rotation runbook states the rule again.

**Certificate renewal for DFSPs is manual, and nothing warns you.** Client certificates last a year,
there is no expiry alerting and no contact record. Track the dates yourself.

**`DFSP_FACING_MTLS_MANDATORY=false` leaves the DFSP-facing endpoint open to callers presenting no
certificate.** It also only behaves as documented when the gateway TLS mode and the sidecar's
`x-forwarded-client-cert` handling agree with it. See
[`dfsp-facing-mtls.md`](./dfsp-facing-mtls.md).
