# Environment Variables

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

Only the variables that affect mutual TLS, JWS, key custody, Vault, the HSM and MCM are listed.
Database, Redis, NATS and business settings are not.

**How to read the tables**

- **Required** means the service refuses to start without it.
- **Profile** says which key profile needs the variable: `vault-kv`, `pkcs11`, or `both`.
- Boolean variables accept `true`, `1`, `yes`, `false`, `0`, `no` (any case), unless a row says
  otherwise.
- Names and terms are defined in the [glossary](./glossary.md).

---

## web-outbound

### Key profile and Vault

Source: `packages/apps/web-outbound/required.settings.ts` (`keyProvider`, `vaultSettings`,
`pkcs11Settings`); `packages/shared/vault/component/vault-settings.ts`.

| Variable | Default | Accepted values | Profile | Notes |
|---|---|---|---|---|
| `KEY_PROVIDER` | `database` | `vault-kv`, `pkcs11`, `database` | both | **Always set it.** Unset means `database`, which keeps private keys in plaintext in MySQL. An unknown value refuses startup. |
| `VAULT_ADDRESS` | empty | URL | both | For example `http://vault.vault.svc.cluster.local:8200`. |
| `VAULT_AUTH_METHOD` | `kubernetes` | `kubernetes`, `token` | both | `token` is for local development only. Any other value refuses startup. |
| `VAULT_ROLE` | empty | Vault Kubernetes auth role name | both | The role bound to the web-outbound ServiceAccount. See [vault.md](./vault.md#kubernetes-auth-roles). |
| `VAULT_KUBERNETES_AUTH_PATH` | `kubernetes` | auth mount path | both | |
| `VAULT_KV_MOUNT` | `secret` | KV v2 mount name | both | Must be the mount that holds the keys, for example `pivotal-kv`. A wrong mount reads nothing and the tenant signs nothing. |
| `VAULT_JWS_KEY_PATH_PREFIX` | `pivotal/jwskey` | KV path | `vault-kv` | A tenant's key is read from `<prefix>/<fspId>`. |
| `VAULT_SERVICE_ACCOUNT_TOKEN_PATH` | `/var/run/secrets/kubernetes.io/serviceaccount/token` | file path | both | Change only if the token is projected elsewhere. |
| `VAULT_TOKEN` | empty | Vault token | both | Used only with `VAULT_AUTH_METHOD=token`. |
| `PARTICIPANT_KEY_STORE_REFRESH_INTERVAL_SECONDS` | `5` | positive integer | both | How often keys, key references and per-tenant JWS settings are re-read. An invalid value falls back to `5`. Source: `core/participant/domain/component/store/participant-signing-keys-cache.ts`. |

### HSM (`pkcs11` only)

Source: `packages/apps/web-outbound/required.settings.ts` (`pkcs11Settings`);
`packages/shared/pkcs11/component/pkcs11-settings.ts`; `docker/pkcs11-entrypoint.sh`.

| Variable | Default | Accepted values | Notes |
|---|---|---|---|
| `PKCS11_MODULE_PATH` | empty | file path | The CloudHSM PKCS#11 library: `/opt/cloudhsm/lib/libcloudhsm_pkcs11.so`. The image must be built with `PKCS11_BACKEND=cloudhsm`. |
| `PKCS11_TOKEN_LABEL` | empty | token label | Leave unset for CloudHSM, which has a single token. |
| `HSM_CRED_PATH` | empty | KV path | Path of the `cu_web_outbound` crypto-user credential, for example `pivotal/hsmcred/web-outbound`. |
| `KEY_REF_PATH` | `pivotal/keyref` | KV path prefix | A tenant's key reference is read from `<prefix>/<fspId>`. |
| `PKCS11_SESSION_POOL_SIZE` | `4` | positive integer | Raise only with a measurement. More sessions were measured to be slower. |
| `CLOUDHSM_IP` | unset | IP address of one HSM | Read by the image entrypoint, which runs `configure-pkcs11 -a <ip>`. Unset skips HSM configuration. |
| `CLOUDHSM_DISABLE_KEY_AVAILABILITY_CHECK` | `false` | `true`, `false` | `true` lets keys exist on a single HSM. Use only with a one-HSM cluster. |

The image also needs the cluster's CA certificate mounted at `/opt/cloudhsm/etc/customerCA.crt`.
Without it the entrypoint stops the container.

### JWS signing and mutual TLS towards the Hub

Source: `packages/apps/web-outbound/required.settings.ts` (`outboundSettings`);
`packages/shared/fspiop/component/security/fspiop-mtls-ca-store.ts`;
`packages/shared/fspiop/component/security/fspiop-mtls-client-cert-store.ts`;
`packages/shared/fspiop/component/security/mutual-tls-agent.ts`.

| Variable | Default | Accepted values | Required | Notes |
|---|---|---|---|---|
| `FSPIOP_USE_JWS` | — | boolean | Yes | `true` signs Hub-facing requests. Each tenant must also be switched on (`jws_sign_enabled`). |
| `FSPIOP_USE_MUTUAL_TLS` | — | boolean | Yes | `true` presents the Hub client certificate to the Hub. Set the client certificate and key paths with it: with only the CA set, web-outbound starts but presents no client certificate. |
| `FSPIOP_TLS_VERIFY_SERVER_CERT` | — | boolean | Yes | `true` checks the Hub's server certificate against the CA bundle. |
| `FSPIOP_TLS_VERIFY_DOMAIN` | — | boolean | Yes | `true` checks the Hub's host name. |
| `FSPIOP_MTLS_CLIENT_CERT_PATH` | unset | file path | With mTLS | For example `/etc/pivotal/hub-client-tls/tls.crt`. Set together with the key path, or web-outbound refuses to start. |
| `FSPIOP_MTLS_CLIENT_KEY_PATH` | unset | file path | With mTLS | For example `/etc/pivotal/hub-client-tls/tls.key`. |
| `FSPIOP_MTLS_CA_PATH` | unset | file path | No | The Hub CA bundle, for example `/etc/pivotal/hub-ca/hub-ca.pem`. A path that cannot be read stops the service. |
| `FSPIOP_MTLS_CLIENT_CERT`, `FSPIOP_MTLS_CLIENT_KEY`, `FSPIOP_MTLS_CA` | unset | inline PEM | No | Local development only. A path, when set, wins over the inline value. |

The certificate files are re-read every 60 seconds. A renewed certificate is used without a
restart. The interval is fixed.

### DFSP-facing leg

Source: `packages/apps/web-outbound/required.settings.ts` (`jwtPolicy`,
`dfspFacingMutualTlsMandatory`).

| Variable | Default | Accepted values | Notes |
|---|---|---|---|
| `ACCESS_JWT_ENABLED` | `true` | boolean | `true` requires the DFSP's JWS in the `authorization` header. **An unrecognised value is treated as unset (`true`).** |
| `DFSP_FACING_MTLS_MANDATORY` | `false` | boolean | `true` refuses a DFSP that presents no client certificate. A presented certificate is always checked. **An unrecognised value silently becomes `false`.** |

---

## web-inbound

Source: `packages/apps/web-inbound/required.settings.ts`;
`packages/shared/fspiop/component/security/mutual-tls-server.ts`;
`packages/shared/fspiop/component/security/fspiop-mtls-server-cert-store.ts`.

web-inbound verifies signatures and never signs. It ignores `KEY_PROVIDER` and needs no Vault role
or HSM access in either profile.

| Variable | Default | Accepted values | Required | Notes |
|---|---|---|---|---|
| `FSPIOP_USE_JWS` | — | boolean | Yes | `true` turns on JWS verification. |
| `FSPIOP_JWS_VERIFY_MODE` | `off` | `off`, `verify-if-present`, `require` | No | **Fallback only.** Used for a sender that has no `participant_key` row. A row's own `jws_verify_mode` always wins, and trust-manager creates a row with `off` for every participant in MCM, so this value never applies to them. Set each sender's mode on **Participant → JWS Policy**. An unknown value refuses startup. |
| `FSPIOP_USE_MUTUAL_TLS` | — | boolean | Yes | Here it means "serve TLS and require a client certificate". Set `false` when the Pivotal callback gateway terminates TLS. |
| `FSPIOP_MTLS_SERVER_CERT_PATH` | unset | file path | When `FSPIOP_USE_MUTUAL_TLS=true` | The service refuses to start without it. |
| `FSPIOP_MTLS_SERVER_KEY_PATH` | unset | file path | When `FSPIOP_USE_MUTUAL_TLS=true` | |
| `FSPIOP_MTLS_CA_PATH` | unset | file path | When `FSPIOP_USE_MUTUAL_TLS=true` | The CA that client certificates are checked against. |

When web-inbound serves TLS itself, its certificate files are re-read every 60 seconds.

---

## web-pivotal

Source: `packages/apps/web-pivotal/required.settings.ts` (`keyProvider`, `vaultSettings`,
`dfspCertIssuerSettings`).

web-pivotal issues DFSP client certificates and creates each tenant's Hub JWS signing key at
onboarding.

| Variable | Default | Accepted values | Profile | Notes |
|---|---|---|---|---|
| `KEY_PROVIDER` | `database` | `vault-kv`, `pkcs11`, `database` | both | Set it to match web-outbound. Unset means `database`, which stores new keys in plaintext. |
| `VAULT_ADDRESS`, `VAULT_AUTH_METHOD`, `VAULT_ROLE`, `VAULT_KUBERNETES_AUTH_PATH`, `VAULT_KV_MOUNT`, `VAULT_JWS_KEY_PATH_PREFIX`, `VAULT_SERVICE_ACCOUNT_TOKEN_PATH`, `VAULT_TOKEN` | as for web-outbound | as for web-outbound | both | `VAULT_ROLE` is web-pivotal's own role. |
| `DFSP_CERT_PKI_MOUNT` | empty | Vault PKI mount | both | `pki_dfsp`. Empty turns DFSP certificate issuance off. |
| `DFSP_CERT_PKI_ROLE` | `dfsp-client` | Vault PKI role | both | |
| `DFSP_CERT_TTL` | unset | Vault duration, for example `8760h` | both | Unset uses the role's own TTL. |

**`pkcs11` settings for web-pivotal are not listed in this version.** The HSM onboarding flow
changes in the next release; this table is completed then.

---

## trust-manager

Source: `packages/apps/trust-manager/required.settings.ts`;
`packages/core/trust/domain/component/signing-tenant.consumer.ts`.

trust-manager ignores `KEY_PROVIDER`. It never reads a private JWS key in either profile.

### MCM

| Variable | Default | Required | Notes |
|---|---|---|---|
| `MCM_BASE_URL` | — | Yes | MCM API base URL, including `/api`. |
| `MCM_TOKEN_URL` | — | Yes | Keycloak token endpoint. The token is requested with the `client_credentials` grant. |
| `MCM_CLIENT_ID` | — | Yes | |
| `MCM_CLIENT_SECRET` | — | Yes | Supply it from a Secret. |
| `PIVOTAL_DFSP_ID` | — | Yes | Pivotal's own participant ID in MCM, for example `pivotal`. |
| `MCM_AUTO_REGISTER_DFSPS` | `false` | No | Only `true` or `false`; any other value refuses startup. `true` creates missing DFSPs in MCM. |
| `MCM_DFSP_CONTACT_EMAIL` | unset | No | Sent when a DFSP is created in MCM. |
| `MCM_DFSP_MONETARY_ZONE` | unset | No | Sent when a DFSP is created in MCM. |

### Certificates

| Variable | Default | Required | Notes |
|---|---|---|---|
| `PIVOTAL_CA_PATH` | — | Yes | File path of the Pivotal Hub-client CA root PEM, for example `/etc/pivotal/hub-client-ca/ca.pem`, mounted from Secret `pivotal-hub-client-ca`. |
| `HUB_SERVER_CERT_COMMON_NAME` | — | Yes | Common name on the **Hub client certificate**. The variable says "server" but the certificate is a client certificate. |
| `HUB_SERVER_CERT_SECRET_NAME` | `hub-server-cert` | No | Secret the Hub client certificate is written to (keys `tls.crt`, `tls.key`). |
| `HUB_SERVER_CERT_CHECK_INTERVAL_SECONDS` | `86400` | No | Positive integer. |
| `HUB_CA_SECRET_NAME` | `hub-ca-bundle` | No | Secret the Hub CA bundle is written to (key `hub-ca.pem`). |
| `HUB_CA_SYNC_INTERVAL_SECONDS` | `3600` | No | Positive integer. |
| `HUB_CALLBACK_CERT_COMMON_NAME` | unset | No | web-inbound's public host name. Setting it turns on the Hub callback certificate job, which then requires `VAULT_ADDRESS`. |
| `HUB_CALLBACK_CERT_PKI_ROLE` | `hub-callback-client` | No | |
| `HUB_CALLBACK_CERT_CHECK_INTERVAL_SECONDS` | `86400` | No | Positive integer. |
| `HUB_CLIENT_PKI_MOUNT` | `pki_hub_client` when `VAULT_ADDRESS` is set, otherwise empty | No | Its intermediate chain is registered with MCM next to the root. |
| `MCM_CA_RECONCILE_INTERVAL_SECONDS` | `3600` | No | Positive integer. |

### JWS public keys

| Variable | Default | Notes |
|---|---|---|
| `PEER_JWS_SYNC_INTERVAL_SECONDS` | `300` | Positive integer. |
| `JWS_KEY_PUBLISH_INTERVAL_SECONDS` | `3600` | Positive integer. |
| `NATS_URL` | empty | Optional. Needed on both web-pivotal and trust-manager for new tenants to be published within seconds; otherwise the hourly job publishes them. |
| `PIVOTAL_TRUST_STREAM_NAME` | `PIVOTAL_TRUST` | NATS stream for new-tenant announcements. |
| `PIVOTAL_TRUST_STREAM_MAX_AGE_MS` | 7 days | |

### DFSP CA publishing

| Variable | Default | Notes |
|---|---|---|
| `DFSP_CA_PKI_MOUNT` | `pki_dfsp` | The intermediate is read from here. |
| `DFSP_CA_ROOT_PKI_MOUNT` | empty | The mount holding the DFSP CA root, appended after the intermediate. Leave it unset: no ceremony puts the root in Vault, so the intermediate alone is the anchor. A mount that does not exist makes the job fail and leaves the anchor unchanged. |
| `DFSP_CA_GATEWAY_NAMESPACE` | empty | Namespace of the DFSP-facing gateway. Empty turns the job off. |
| `DFSP_CA_GATEWAY_SECRET_NAME` | empty | Existing `<credentialName>-cacert` Secret in that namespace (key `cacert`). Empty turns the job off. |
| `DFSP_CA_PUBLISH_INTERVAL_SECONDS` | `3600` | Positive integer. |

### Vault

| Variable | Default | Notes |
|---|---|---|
| `VAULT_ADDRESS` | empty | Needed for the Hub callback certificate and for reading CA chains. |
| `VAULT_AUTH_METHOD`, `VAULT_ROLE`, `VAULT_KUBERNETES_AUTH_PATH`, `VAULT_SERVICE_ACCOUNT_TOKEN_PATH`, `VAULT_TOKEN` | as for web-outbound | `VAULT_ROLE` is trust-manager's own role. |

---

## Java connector

Source: `pivotal-thitsawallet-connector/docker-entrypoint.sh`;
`pivotal-connector/implementation/mod_pivotal_connector_api/src/main/java/com/thitsaworks/mojaloop/coreconnector/CoreConnectorConfiguration.java`;
`…/coreconnector/jws/FspiopJwsSigner.java`.

The Java connector reads **different names** for some settings. Use these names, not the
web-outbound ones.

| Variable | Default | Accepted values | Profile | Notes |
|---|---|---|---|---|
| `CONNECTOR_ID` | — | participant ID | both | The tenant this connector signs as. |
| `KEY_PROVIDER` | `vault-kv` | `vault-kv`, `pkcs11` | both | Any other value stops the connector when signing is on. `database` is not accepted. |
| `FSPIOP_USE_JWS` | `false` | `true` or `1` only | both | Any other value, including `yes`, means `false`. `true` signs callbacks. With `true`, `VAULT_URL` and `VAULT_ROLE` are required. |
| `VAULT_URL` | empty | URL | both | **Not `VAULT_ADDRESS`.** |
| `VAULT_ROLE` | empty | Vault Kubernetes auth role | both | The connector's own role. |
| `VAULT_KUBERNETES_AUTH_PATH` | `kubernetes` | auth mount path | both | |
| `VAULT_KV_MOUNT` | `secret` | KV v2 mount name | both | |
| `VAULT_JWS_KEY_PATH_PREFIX` | `pivotal/jwskey` | KV path | `vault-kv` | Key read from `<prefix>/<CONNECTOR_ID>`. |
| `VAULT_SERVICE_ACCOUNT_TOKEN_PATH` | `/var/run/secrets/kubernetes.io/serviceaccount/token` | file path | both | |
| `HSM_CRED_PATH` | empty | KV path | `pkcs11` | The tenant's own crypto-user credential, for example `pivotal/hsmcred/<fspId>`. Required under `pkcs11`. |
| `KEY_REF_PATH` | `pivotal/keyref` | KV path prefix | `pkcs11` | Key reference read from `<prefix>/<CONNECTOR_ID>`. |
| `CLOUDHSM_IP` | unset | IP address of one HSM | `pkcs11` | The entrypoint runs `configure-jce -a <ip>`. The image must be built with `PKCS11_BACKEND=cloudhsm`. |
| `CLOUDHSM_DISABLE_KEY_AVAILABILITY_CHECK` | `false` | `true`, `false` | `pkcs11` | As for web-outbound. |
| `FSPIOP_USE_MUTUAL_TLS` | `false` | `true` or `1` only | both | Any other value, including `yes`, means `false`. `true` presents the Hub client certificate. |
| `FSPIOP_MTLS_CA_PATH` | empty | file path | both | |
| `FSPIOP_MTLS_CLIENT_CERT_PATH` | empty | file path | both | |
| `FSPIOP_MTLS_CLIENT_KEY_PATH` | empty | file path | both | |
| `FSPIOP_MTLS_RELOAD_INTERVAL_MS` | `60000` | milliseconds | both | How often the certificate files are re-read. |

The connector does **not** read `FSPIOP_TLS_VERIFY_SERVER_CERT` or `FSPIOP_TLS_VERIFY_DOMAIN`. It
always checks the Hub's server certificate.

The connector reads its signing key **once, at startup**. Restart it after its key changes.
