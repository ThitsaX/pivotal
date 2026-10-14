# Document History

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## How changes are recorded

Every change to this documentation is recorded here, newest first, with one of three labels:

| Label | Meaning |
|---|---|
| **Added** | New content: a new page, procedure or section |
| **Changed** | Existing content updated, for example because Pivotal's behaviour changed |
| **Corrected** | A mistake fixed. If the mistake could leave a setup broken or insecure, the affected page also carries a note at the top for one document version. |

Document versions:

- **1.x → 1.(x+1):** a correction or an addition.
- **2.0:** a Pivotal release that changes behaviour described here.

## History

### 1.0 (draft)

- **Added:** Security section: mutual TLS and JWS on the DFSP-facing and Hub-facing sides, for the
  `vault-kv` and `pkcs11` key profiles. Concepts, setup, runbooks, reference, troubleshooting and
  known limitations.
- **Changed:** `pkcs11` DFSP onboarding. A custodian provisions each DFSP's key with
  `provision-hsm-tenant.sh` in the HSM admin pod, and portal onboarding records its public key,
  refusing a DFSP that was not provisioned. The HSM admin pod is now the `hsm-tools` Deployment from
  the `pivotal-hsm-tools` image. Unset `KEY_PROVIDER` now means no Hub JWS keys. The `vault-kv` CA
  ceremony now writes `pivotal-hub-client-ca` itself.
