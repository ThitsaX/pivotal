# Vault

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

Everything Pivotal keeps in Vault: mounts, PKI roles, KV paths, the access each workload needs,
and the Kubernetes auth roles. Placeholders: `<KV_MOUNT>` is your KV v2 mount (for example
`pivotal-kv`), and `<FSP_ID>` is a participant ID.

---

## Mounts

Sources: `docs/operations/kms/setup/scripts/ceremony-kms.js`;
`docs/operations/hsm/setup/scripts/ceremony-hsm.sh`;
`packages/shared/vault/component/vault-client.ts`.

| Mount | Type | Created by | Holds | Profile |
|---|---|---|---|---|
| `pki_hub_client` | PKI | CA ceremony | Pivotal Hub-client CA intermediate. Its key is generated inside Vault; the root that signed it stays in KMS or the HSM. | both |
| `pki_dfsp` | PKI | CA ceremony | DFSP CA intermediate. Same arrangement. | both |
| `<KV_MOUNT>` | KV **version 2** | You, once | Hub JWS signing keys (`vault-kv`); key references and crypto-user credentials (`pkcs11`) | both |

The ceremony disables and re-creates both PKI mounts, with a maximum lease TTL of `43800h`. Every
role on them is re-created by the ceremony script.

Pivotal's Node services check that `<KV_MOUNT>` is version 2 before reading or writing. A version 1
mount makes them refuse to start. Without read access to `sys/internal/ui/mounts/<KV_MOUNT>`, the
check is skipped with a warning and the mount is treated as version 2.

---

## PKI roles

Sources: `ceremony-kms.js` (`DOMAINS`); `ceremony-hsm.sh` (`ceremony` calls and the two
`web-inbound` roles). `<PIVOTAL_CALLBACK_HOST>` is the value given to `WEB_INBOUND_HOST` when the ceremony
runs.

| Mount / role | Signs | Used by | Key settings |
|---|---|---|---|
| `pki_dfsp/roles/dfsp-client` | DFSP client certificates | web-pivotal (`DFSP_CERT_PKI_ROLE`) | `client_flag=true`, `server_flag=false`, `ttl=max_ttl=8760h`, `require_cn=true`, `use_csr_common_name=false`, `use_csr_sans=false`, `ou=DFSP` |
| `pki_hub_client/roles/pivotal-client` | Client certificates from Pivotal's own CA | cert-manager, only in deployments that issue workload client certificates from Pivotal's CA | `client_flag=true`, `server_flag=false`, `ttl=max_ttl=2160h`, `require_cn=false`. The `pkcs11` ceremony also sets `use_csr_common_name=false`, `use_csr_sans=false`; the `vault-kv` ceremony leaves Vault's defaults (`true`). |
| `pki_hub_client/roles/web-inbound-server` | The web-inbound server certificate | cert-manager | `allowed_domains=<PIVOTAL_CALLBACK_HOST>`, `allow_bare_domains=true`, `allow_subdomains=false`, `server_flag=true`, `client_flag=false`, `ttl=max_ttl=2160h`, `use_csr_common_name=false`, `use_csr_sans=false` |
| `pki_hub_client/roles/hub-callback-client` | The Hub callback certificate | trust-manager (`HUB_CALLBACK_CERT_PKI_ROLE`) | `allowed_domains=<PIVOTAL_CALLBACK_HOST>`, `allow_bare_domains=true`, `allow_subdomains=false`, `server_flag=false`, `client_flag=true`, `ttl=max_ttl=8760h`, `organization=Mojaloop`, `key_type=rsa`, `use_csr_common_name=false`, `use_csr_sans=false` |

All roles sign a submitted request (`sign`). None is used with `issue`, so Vault never generates a
leaf private key.

`use_csr_common_name=false` and `use_csr_sans=false` make the name on the certificate come from
the caller's request, never from the CSR. On `dfsp-client` this stops a DFSP from requesting a
certificate that names another participant. Check it after every ceremony:

| Command | Expected |
|---|---|
| `vault read pki_dfsp/roles/dfsp-client` | `use_csr_common_name false` and `use_csr_sans false` |

---

## KV paths

Sources: `packages/core/participant/domain/component/store/jws-private-key-source.ts`;
`jws-key-ref-source.ts`; `jws-key-provisioner.ts`; `packages/shared/pkcs11/component/pkcs11-bootstrap.ts`;
`pivotal-connector/…/key/CloudHsmJwsKeyProvider.java`; `…/key/VaultJwsKeyProvider.java`.

Paths below are relative to `<KV_MOUNT>`. The API path inserts `data/`, for example
`<KV_MOUNT>/data/pivotal/jwskey/<FSP_ID>`. The prefixes are the defaults and can be changed with
the variables in the last column.

| Path | Fields | Written by | Read by | Profile | Prefix variable |
|---|---|---|---|---|---|
| `pivotal/jwskey/<FSP_ID>` | `privateKey` (PEM) | web-pivotal, at onboarding | web-outbound; that tenant's connector | `vault-kv` | `VAULT_JWS_KEY_PATH_PREFIX` |
| `pivotal/keyref/<FSP_ID>` | `keyRef` (the key's label in the HSM), `publicKey` (PEM) | the custodian, with `provision-hsm-tenant.sh`, before onboarding | web-outbound and that tenant's connector (`keyRef`); web-pivotal at onboarding (both) | `pkcs11` | `KEY_REF_PATH` |
| `pivotal/hsmcred/<FSP_ID>` | `username`, `password` (the tenant's crypto user) | the custodian, with `provision-hsm-tenant.sh` | that tenant's connector | `pkcs11` | `HSM_CRED_PATH` (full path) |
| `pivotal/hsmcred/web-outbound` | `username`, `password` (`cu_web_outbound`) | the custodian, once | web-outbound | `pkcs11` | `HSM_CRED_PATH` (full path) |

A write keeps the other fields already at the path: the service reads the path first and writes
the merged result. So a policy that allows a write must also allow `read` on that path.

Under `pkcs11` no service writes to `hsmcred` or `keyref`: custodians do, with a token carrying the
`pivotal-hsm-provisioning` policy below.

---

## Access each workload needs

Sources: the services' Vault calls in `packages/shared/vault/component/vault-client.ts`
(`readKvField`, `writeKvField`, `signCertificate`, `readPkiCaChain`); the Java connector's key
providers.

Write one policy per workload. Grant each connector **only its own paths**: a shared wildcard
means that one compromised connector can read every tenant's key.

| Workload | Path | Capabilities | Profile |
|---|---|---|---|
| web-outbound | `<KV_MOUNT>/data/pivotal/jwskey/*` | `read` | `vault-kv` |
| web-outbound | `<KV_MOUNT>/data/pivotal/hsmcred/web-outbound` | `read` | `pkcs11` |
| web-outbound | `<KV_MOUNT>/data/pivotal/keyref/*` | `read` | `pkcs11` |
| web-outbound | `sys/internal/ui/mounts/<KV_MOUNT>` | `read` | both |
| connector for `<FSP_ID>` | `<KV_MOUNT>/data/pivotal/jwskey/<FSP_ID>` | `read` | `vault-kv` |
| connector for `<FSP_ID>` | `<KV_MOUNT>/data/pivotal/hsmcred/<FSP_ID>` | `read` | `pkcs11` |
| connector for `<FSP_ID>` | `<KV_MOUNT>/data/pivotal/keyref/<FSP_ID>` | `read` | `pkcs11` |
| connector for `<FSP_ID>` | `sys/internal/ui/mounts/<KV_MOUNT>` | `read` | both (optional: the Java connector does not read it) |
| web-pivotal | `pki_dfsp/sign/dfsp-client` | `create`, `update` | both |
| web-pivotal | `<KV_MOUNT>/data/pivotal/jwskey/*` | `create`, `read`, `update` | `vault-kv` |
| web-pivotal | `<KV_MOUNT>/data/pivotal/keyref/*` | `read` | `pkcs11` |
| web-pivotal | `sys/internal/ui/mounts/<KV_MOUNT>` | `read` | both |
| trust-manager | `pki_hub_client/sign/hub-callback-client` | `create`, `update` | both, when `HUB_CALLBACK_CERT_COMMON_NAME` is set |
| cert-manager | `pki_hub_client/sign/web-inbound-server` | `create`, `update` | both |
| cert-manager | `pki_hub_client/sign/pivotal-client` | `create`, `update` | only where workload client certificates come from Pivotal's CA |
| web-inbound | none | — | both |
| custodian token (`pivotal-hsm-provisioning`) | `<KV_MOUNT>/data/pivotal/hsmcred/*` and `<KV_MOUNT>/data/pivotal/keyref/*` | `create`, `read`, `update` | `pkcs11` |
| custodian token (`pivotal-hsm-provisioning`) | `<KV_MOUNT>/data/pivotal/hsmcred/web-outbound` | `deny` | `pkcs11` |

web-pivotal never reads `hsmcred`: under `pkcs11` it holds no crypto-user credential.

trust-manager also reads `pki_hub_client/ca_chain`, `pki_dfsp/ca_chain`, and the DFSP root mount's
`ca_chain` only when `DFSP_CA_ROOT_PKI_MOUNT` is set. Vault serves `ca_chain` without a token, so these reads need no policy.

---

## Kubernetes auth roles

Source: `VAULT_ROLE` and `VAULT_KUBERNETES_AUTH_PATH` in each service; the chart's ServiceAccount
names (`helm/templates/serviceaccounts.yaml`).

Each workload logs in with its own ServiceAccount token. A role binds a ServiceAccount name and
namespace to that workload's policy. Set the role's name in the workload's `VAULT_ROLE`.

| Workload | ServiceAccount (chart default) | Namespace | Policy |
|---|---|---|---|
| web-outbound | `web-outbound` | release namespace | web-outbound policy above |
| web-pivotal | `web-pivotal` | release namespace | web-pivotal policy above |
| trust-manager | `trust-manager` | release namespace | trust-manager policy above |
| connector for `<FSP_ID>` | `connectors[].serviceAccount.name` | release namespace | that connector's policy |
| cert-manager | the ServiceAccount named in the ClusterIssuer's `serviceAccountRef` | cert-manager's namespace | cert-manager policy above |

Never bind a role to the `default` ServiceAccount. Every pod in the namespace that has no account
of its own runs as `default`, so the role would be open to all of them.
