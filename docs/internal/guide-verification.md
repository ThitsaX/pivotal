# mTLS and JWS Guide: Verification Register

**Internal. Never published.** Phase 0 of `docs/plans/mtls_jws_documentation_plan.md`.

**Checked against:**

| Repo | Version |
|---|---|
| `pivotal` | tag `v1.0.1` |
| `pivotal-connector` | tag `v0.0.36` |
| `pivotal-thitsawallet-connector` | tag `v0.0.17` (the version staging runs) |

Staging gitops (`stg-liberia-gitops`) was used only as an example of a real deployment, never as the truth.

**Date:** 2026-10-13

**Result values:**

- **Verified:** the statement matches the code.
- **Corrected:** the plan's assumption was wrong; the row gives the real behaviour.
- **Unresolved:** cannot be confirmed from code; it needs a test, or a decision.

Paths are relative to the repo root. `connector:` means `pivotal-connector/implementation/…`, and `wallet:` means `pivotal-thitsawallet-connector/`.

---

## 1. Version scope

| Check | Result |
|---|---|
| v1.0.1 → v1.0.2 | 3 files changed, dashboard only. No mTLS/JWS change. |
| v1.0.1 → v1.1.0, v1.2.0, `main` | Only `helm/values.yaml` (suspicious-transaction and session-timeout settings) and FSPIOP error-code additions. **No mTLS/JWS change.** |
| v1.3.0 | **Unresolved.** Staging gitops pins `v1.3.0`, but that tag is not in the local repo (the fetch failed without access). |

---

## 2. Register

### Model and responsibilities

| ID | Statement | Result | Evidence |
|---|---|---|---|
| A1 | Leg 2: web-outbound signs as the payer DFSP on `POST /quotes` and `POST /transfers`. `GET /parties` is never signed: there is no body, so the interceptor returns early. | Verified | `packages/shared/fspiop/component/axios/interceptor/fspiop-signing.interceptor.ts:39-49` |
| A1 | Leg 3: the Java connector signs `PUT` callbacks (parties, quotes, transfers, and their error variants) as `CONNECTOR_ID`. | Verified | `connector: …/listeners/FspiopCallbackService.java:78-80,165-180` |
| A1 | Leg 4: web-inbound verifies, using public keys in `participant_key`. Own tenants (`role='self'`) are verified the same way as peers. | Verified | `packages/shared/fspiop/component/nest/guard/fsp-inbound.guard.ts:64-247` |
| A1 | JWS format: RS256 only, detached. Protected header is `alg`, `FSPIOP-URI`, `FSPIOP-HTTP-Method`, `FSPIOP-Source`, then optional `FSPIOP-Destination` and `Date`. There is **no `kid`**. `fspiop-signature` is JSON `{signature, protectedHeader}`. | Verified | `packages/shared/fspiop/component/fspiop-protected-header.ts:22,38-51`; `fspiop-signature.ts:32-34,147-161` |
| A1 | The Java connector **verifies nothing.** | Verified | `connector: …/fspiop/jws/FspiopSignature.java:130`: no caller |
| A5 | web-inbound ignores `KEY_PROVIDER` (it is hard-coded to `database`), never signs, and needs no Vault role or HSM. | Verified | `packages/apps/web-inbound/required.settings.ts:162-177` |

### Key providers and profiles

| ID | Statement | Result | Evidence |
|---|---|---|---|
| A2 | The profile changes only two things: (1) where the hub-facing JWS signing keys live, and (2) where the CA root keys live. | Verified | `jws-key-provisioner.ts:60-177`; `ceremony-kms.js`; `ceremony-hsm.sh` |
| A2 | No mTLS private key is in KMS or the HSM, in either profile. | Verified | See the private-key table in section 4. |
| A2 | Intermediate CA keys are generated inside Vault PKI in **both** profiles. | Verified | `ceremony-kms.js:191-196`; `ceremony-hsm.sh:199` |
| A3 | `KEY_PROVIDER`: | Corrected | `apps/web-outbound/required.settings.ts:264-308`; `apps/web-pivotal/required.settings.ts:239-290`; `apps/trust-manager/required.settings.ts:270-277`; `wallet: docker-entrypoint.sh:78` |
| | • Read **only by web-outbound and web-pivotal** (Node). Default `database`. Accepts `vault-kv`, `pkcs11`, `database`. | | |
| | • web-inbound and trust-manager are hard-coded to `database`. | | |
| | • The Java connector reads it with default `vault-kv`, and accepts only `vault-kv` or `pkcs11`. | | |
| A3 | Under `pkcs11`, **web-pivotal is expected to fail at startup.** Its `JwsSigner` factory requires `HSM_CRED_PATH`, but web-pivotal always passes an empty credential path. Staging leaves web-pivotal unset (`database`), deliberately. | **Unresolved: test needed** | `core/participant/domain/domain.module.ts:134-146,370-375`; `apps/web-pivotal/required.settings.ts:283-290` |
| A3 | **Consequence:** under `pkcs11`, onboarding a DFSP in the portal provisions a **plaintext database key** (web-pivotal runs `database`). The correct HSM path is the manual `provision-hsm-tenant.sh`. Which is the supported HSM onboarding path? | **Unresolved: decision needed** | `onboard-fsp.handler.ts:82-92`; `docs/operations/hsm/runbooks/scripts/provision-hsm-tenant.sh` |
| A4 | Java connector under `pkcs11`: | Verified | `connector: …/key/CloudHsmJwsKeyProvider.java:142-190`; `wallet: docker-entrypoint.sh:10-29,61-80`; `wallet: Dockerfile:42-64` |
| | • Uses the **AWS CloudHSM JCE provider**, not PKCS#11. | | |
| | • Needs `CLOUDHSM_IP`, `HSM_CRED_PATH`, and `KEY_REF_PATH`/`<CONNECTOR_ID>`. | | |
| | • The image must be built with `PKCS11_BACKEND=cloudhsm`. | | |
| A4 | The Java connector reads its signing key **once, at startup**. It must be restarted after a key change. | Verified | `connector: FspiopJwsSigner.java:142-148`: `refresh()` has no caller |
| A4 | A Java connector with no key **sends unsigned** and logs a WARN. It does not fail. | Verified | `connector: VaultJwsKeyProvider.java:85`; `CloudHsmJwsKeyProvider.java:162` |
| — | web-outbound **re-reads the Vault key or keyRef every `PARTICIPANT_KEY_STORE_REFRESH_INTERVAL_SECONDS`** (default 5), not only at startup. | Verified | `participant-signing-keys-cache.ts:12-14,100-109,208-218` |
| A6 | The `vault-kv` ceremony uses **AWS KMS only** (`aws kms` CLI), and only at ceremony time. No service calls KMS at runtime. | Verified | `docs/operations/kms/setup/scripts/ceremony-kms.js:4-82` |
| A7 | Each ceremony, for each of `pki_hub_client` and `pki_dfsp`: | Verified | `ceremony-kms.js:42-47,185-224`; `ceremony-hsm.sh:29,168,197-278` |
| | • Disables and re-enables the mount. | | |
| | • Generates the intermediate in Vault and has the root sign it. Root lifetime is 10 years; intermediate is 5. | | |
| | • Restores one role per mount: `pivotal-client` and `dfsp-client`. | | |
| A7 | The ceremony **destroys the `web-inbound-server` and `hub-callback-client` roles** (it disables `pki_hub_client`) and does not recreate them. | Verified: **defect, fixed on branch `CVE-130/pivotal-security-documentation`**: both scripts now require `WEB_INBOUND_HOST` and restore both roles. Tested against a dev Vault. | Same |
| A7 | The KMS `dfsp-client` role is missing `use_csr_common_name=false use_csr_sans=false`; the HSM role has it. | Verified: **defect, fixed on branch**: tested; a CSR naming another participant now gets the DFSP id. | `ceremony-kms.js:46-47` vs `ceremony-hsm.sh:278` |
| A7 | The KMS script writes Secret `pivotal-ca-bundle`; the setup docs and staging use `pivotal-hub-client-ca`. | Verified: **conflict** | `ceremony-kms.js:218-224` |
| A24 | KMS root keys cannot be exported. HSM roots are `extractable=false`, **but can be restored from a CloudHSM cluster backup.** | Corrected | `docs/operations/hsm/setup/1-cloudhsm-cluster.md:209-211` |
| A24 | Vault backup/snapshot and KMS pending-deletion recovery are outside Pivotal code. | Unresolved: operator procedure | — |

### Leg 1: DFSP-facing

| ID | Statement | Result | Evidence |
|---|---|---|---|
| A8 | DFSP JWS: | Verified | `apps/web-outbound/component/access.guard.ts:16-245`; `shared/security/component/jwt/jwt.ts:98` |
| | • A compact JWS goes in the **`authorization`** header, with no `Bearer` prefix. RS256 only. | | |
| | • The payload must equal the request body (canonical JSON). | | |
| | • `/secured/transferStatus` also requires `uri`, `method`, `date` (±5 min) and `nonce` (replay-protected in Redis for 10 min). | | |
| A8 | The DFSP's public key is `participant.access_public_key`. | Verified | `update-access-key.controller.ts:29-30`; `update-access-key.handler.ts:42-44` |
| | • Set at `POST /participant/onboard`, replaced with `PUT /participant/access-key`. | | |
| | • **Replaced in place, with no overlap window.** | | |
| | • Cached for up to 5 s. | | |
| A8 | Guard order: `DfspCertificateGuard`, then `AccessGuard`. `ACCESS_JWT_ENABLED` defaults to `true`. | Verified | `apps/web-outbound/main.ts:83-89`; `required.settings.ts:116-120` |
| A9 | DFSP certificate issuance is **CSR-based**: | Verified | `dfsp-certificate-issuer.ts:15-173`; `dfsp-certificate.controller.ts:39-94` |
| | • The DFSP keeps its own key. | | |
| | • web-pivotal calls Vault `<DFSP_CERT_PKI_MOUNT>/sign/<DFSP_CERT_PKI_ROLE>`. | | |
| | • API: `POST /participant/certificates {fspId, csrPem, note?}`. Portal: Participant → Certificates. | | |
| | • Permission: `participant.certificate.enroll`. | | |
| A9 | A new certificate moves the DFSP's existing `active` certificates to `retiring`. Those stay accepted until they expire. | Verified | `dfsp-certificate-issuer.ts:57-77,181-199` |
| A10 | Revoke: | Verified | `dfsp-certificate.controller.ts:96-107`; `revoke-dfsp-certificate.handler.ts:29-61`; `dfsp-certificate.guard.ts:94-98` |
| | • `POST /participant/certificates/:id/revoke`, permission `participant.certificate.revoke`. | | |
| | • A database status change only: no Vault revoke, CRL or OCSP. | | |
| | • Checked on every request, read from the **read replica**. | | |
| A10 | **Revocation does not cut a DFSP off while `DFSP_FACING_MTLS_MANDATORY=false`.** The DFSP can stop presenting the certificate and is still admitted. | Verified: guide must state it | `dfsp-certificate.guard.ts:76-82` |
| A10 | No row is ever set to `expired` (`findLapsed` has no caller). The guard checks the dates itself, so enforcement still works. | Verified | `participant-cert.repository.ts:68-76` |
| A11 | `DFSP_FACING_MTLS_MANDATORY`: | Verified | `apps/web-outbound/required.settings.ts:131-133,220-229` |
| | • Default `false`. Accepts `true/1/yes` and `false/0/no`. | | |
| | • **Any other value silently becomes `false`.** | | |

### Legs 2–4: Hub-facing

| ID | Statement | Result | Evidence |
|---|---|---|---|
| A13 | Signing needs **both**: | Verified | `core/outbound/domain/domain.module.ts:150-152`; `jws-private-key-source.ts:171-176`; `jws-key-publish.scheduler.ts:149-163` |
| | • env `FSPIOP_USE_JWS=true` (web-outbound; Java `FSPIOP_USE_JWS`); | | |
| | • per tenant, `participant_key.jws_sign_enabled=1` on a `self` row that has a key. | | |
| | trust-manager turns the tenant flag on after MCM confirms the public key. | | |
| A13 | Operator API: `PUT /participant/jws-policy {fspId, jwsSignEnabled?, jwsVerifyMode?}`, permission `participant.signing-keys.update`. Portal page: "Signing Policy". | Verified | `update-jws-policy.controller.ts:45-46` |
| A13 | **Portal defect:** the Signing Policy page always sends `jwsSignEnabled` with the checkbox unticked by default. Changing only Verify Mode **turns signing off.** | Verified: **defect, fixed on branch**: the page (renamed **JWS Policy**) loads the current settings through a new `GET /participant/jws-policy?fspId=` and sends only what changed. Menus renamed **Hub JWS Public Key** and **JWS Policy** (migration `V14__rename_jws_menus.sql`). | `packages/portal/src/pages/participant/ParticipantUpdateSigningKeysPage.vue:24-42` |
| A14 | `FSPIOP_JWS_VERIFY_MODE` (web-inbound) is `off` (default), `verify-if-present` or `require`. | Corrected | `participant-jws-policy-store.ts:34-35`; `peer-jws-sync.scheduler.ts:94`; `onboard-fsp.handler.ts:100` |
| | • **It is only the fallback for a source with no `participant_key` row.** | | |
| | • Peer rows (trust-manager) and own-tenant rows (onboarding) are created with `jws_verify_mode='off'`, so the per-row setting is what turns verification on. | | |
| A14 | web-inbound **logs nothing when it rejects a signature.** Rejections are visible only in the response (3105 → HTTP 401; 3101/3102 → HTTP 400). | Verified | `fspiop-exception.filter.ts:37-47` |
| A17 | A new peer key takes effect at web-inbound within about `PEER_JWS_SYNC_INTERVAL_SECONDS` (300) + 5 s. | Verified | `peer-jws-sync.scheduler.ts`; `participant-signing-keys-cache.ts` |
| A18 | web-outbound mTLS: | Verified | `apps/web-outbound/required.settings.ts:48-75`; `mutual-tls-agent.ts:31,79,91-126`; `outbound/domain/domain.module.ts:160-176` |
| | • `FSPIOP_USE_MUTUAL_TLS`, `FSPIOP_MTLS_CLIENT_CERT_PATH`, `FSPIOP_MTLS_CLIENT_KEY_PATH`, `FSPIOP_MTLS_CA_PATH`. | | |
| | • `FSPIOP_TLS_VERIFY_SERVER_CERT` and `FSPIOP_TLS_VERIFY_DOMAIN` are required. | | |
| | • Certificate files are reloaded every 60 s (fixed), with no restart. | | |
| A18 | Java connector mTLS: | Corrected | `connector: …/mtls/FspiopMutualTls.java:63-85`; `ReloadableMutualTls.java:86-155` |
| | • Same `FSPIOP_MTLS_*_PATH` vars, plus `FSPIOP_MTLS_RELOAD_INTERVAL_MS` (60000). Reloads automatically. | | |
| | • **It does not read `FSPIOP_TLS_VERIFY_*`**: it always verifies the server certificate. | | |

### trust-manager, MCM and Kubernetes resources

| ID | Statement | Result | Evidence |
|---|---|---|---|
| A12 | **The v1.0.1 Helm chart (`pivotal/helm/`) has no trust-manager Deployment**, no Istio Gateway / VirtualService / EnvoyFilter / AuthorizationPolicy, and no cert-manager Certificate or ClusterIssuer. It renders only trust-manager's ServiceAccount and RBAC. `cert-manager-issuers.yaml` sits outside `templates/` and is never rendered. Staging uses its **own copy** of the chart, which does template these. | Verified: **blocker, fixed on branch**: `pivotal/helm` rebuilt on the staging chart design (chart 0.2.0). It deploys trust-manager and renders optional Istio and cert-manager resources. Staging's own values render the same resources with it. | `helm/templates/apps.yaml`; `helm/templates/trust-manager-rbac.yaml`; `stg-liberia-gitops/apps/pivotal/templates/` |
| A12 | The two charts merge env in a different order. In the v1.0.1 chart the component env wins over `commonFspiopEnv`; in the staging chart the shared block wins. | Verified: conflict, **resolved on branch**: the new chart merges, so the component wins. | `helm/templates/apps.yaml:31-34` vs staging `templates/apps.yaml:96,101` |
| A15 | trust-manager runs **6 timer jobs plus 1 NATS consumer**. Each job is Redis-locked; intervals and log lines are in section 5. The 30-day renewal window is hard-coded for both enrollers. | Verified | `apps/trust-manager/required.settings.ts`; `core/trust/domain/domain.module.ts` |
| A16 | MCM calls: 14 endpoints plus the Keycloak token call (section 5). **No DELETE.** The token must carry audience `connection-manager-api` and a `groups` claim; these come from Keycloak mappers, not from env. | Verified | `shared/mcm-client/component/mcm-axios.ts:56-290` |
| A19 | The web-inbound server certificate is defined **only in gitops**. The `-cacert` Secret is hard-coded PEM. | Verified | staging `vault-pki-setup/pivotal-web-inbound-hub-tls.yaml` |
| A20 | Hub client certificate (`HubServerCertEnroller`): | Verified | `hub-server-cert.enroller.ts:34-154` |
| | • Always on. Generates an RSA 4096 key and CSR; MCM inbound enrollment. | | |
| | • Writes Secret `HUB_SERVER_CERT_SECRET_NAME` (default `hub-server-cert`) with `tls.crt` and `tls.key`. **No `ca.crt`.** | | |
| A20 | Hub callback certificate: | Verified | `hub-callback-cert.enroller.ts:76-189`; `required.settings.ts:199-225` |
| | • Turned on by `HUB_CALLBACK_CERT_COMMON_NAME`, and needs `VAULT_ADDRESS`. | | |
| | • Signs on `pki_hub_client/sign/hub-callback-client`; the Vault policy needs `create` and `update` on that path. | | |
| A21 | **No hub-facing certificate can be revoked** by Pivotal: no Vault revoke, no MCM revoke. | Verified | `vault-client.ts`; `mcm-axios.ts` |
| A22 | **No JWS key rotation command exists.** | Verified: **blocker for the rotation runbook** | `jws-key-publish.scheduler.ts:73-83,196-211` |
| | • The hourly reconcile never replaces a key that MCM already holds; it only warns. | | |
| | • The replace path `publish()` has no caller. | | |
| | Rotation is therefore not possible without manual MCM calls. | | |
| A23 | **No DFSP offboarding exists.** There is no offboard or deactivate command, no key delete, and no MCM delete. | Verified | `core/participant/domain/command/`; `participant-key.repository.ts:21-29` |
| A25 | `MCM_AUTO_REGISTER_DFSPS` (default `false`; only `true`/`false`, anything else refuses startup), `MCM_DFSP_CONTACT_EMAIL`, `MCM_DFSP_MONETARY_ZONE`. Runs inside CA registration, JWS publish and the NATS consumer. | Verified | `required.settings.ts:182-197`; `mcm-dfsp.registrar.ts:35-90` |
| — | `HubServerCertEnroller` does not register `PIVOTAL_DFSP_ID` in MCM itself. On a fresh MCM it depends on the CA-registration job running first; if it fails, the next attempt is 24 h later. | Verified | `domain.module.ts:183-198` |

---

## 3. Existing docs that conflict with the code

The guide follows the code. These files in `docs/operations/` and `docs/internal/design/` are wrong for v1.0.1:

| Doc | Says | Code |
|---|---|---|
| `hsm/README.md:107-110`, `hsm/setup/4-…:13-21`, `hsm/runbooks/onboard-dfsp.md:135-138` | pkcs11 is not implemented | Implemented in Node and Java |
| `hsm/runbooks/onboard-dfsp.md:106-107` | The key is shared with `cu_web_outbound` during onboarding | Not shared; only a WARN telling the operator to do it |
| `hsm/runbooks/*` | Crypto user `cu-<fsp>` | The script uses `cu_<fsp>` |
| `kms/README.md:11` | `vault-kv` is the default | Node default is `database` |
| `kms/README.md:58` | Vault is read once at startup | web-outbound re-reads it every 5 s |
| `kms/setup/3-…`, `hsm/setup/4-…` | `KEY_PROVIDER` applies to all services | Only web-outbound, web-pivotal and the Java connector |
| `kms/setup/3-…`, `hsm/setup/4-…` | Move `FSPIOP_JWS_VERIFY_MODE` through its values | The per-row mode overrides it |
| `kms/setup/3-…`, `hsm/setup/4-…` | `FSPIOP_TLS_VERIFY_*` on connectors | Ignored by the Java connector |
| `kms/runbooks/rotate-signing-key.md` | The hourly reconcile publishes the new key; write Vault first | Reconcile never replaces; writing Vault first makes web-outbound sign with an unpublished key within 5 s |
| `kms/README.md`, `kms/setup/1-…` | The ceremony uses `shared/ceremony.py` | `ceremony-kms.js` is self-contained |
| `kms/runbooks/offboard-dfsp.md`, `hsm/runbooks/offboard-dfsp.md` | Revoking stops the DFSP; "Portal → Participant → deactivate" | Not while mandatory=false; no deactivate exists |
| `hsm/setup/by-hand/7-…:166-210`, `8-…:153-154` | Callback-certificate automation is planned | Shipped in v1.0.1 |
| `design/architecture.md:601` and others | `FSPIOP_VERIFY_INBOUND` | `FSPIOP_JWS_VERIFY_MODE` |
| `design/dfsp-facing-leg.md` | trust-manager `register-access-key`, accessKey overlap, `pki/issue`, cached certificate lookup | None of it was built |
| `ParticipantCertificatesPage.vue:187` (portal text) | "The DFSP cannot connect with it again." | The handshake still succeeds; the application rejects the request |

Wrong code comments (no behaviour impact):

- `mcm-axios.ts` "registry, not a distributor": `/onboard` does distribute.
- `mcm-axios.ts` and `HubServerCertEnroller` call the Hub client certificate a "server certificate".
- trust-manager `required.settings.ts:279-290` says Vault is "never signed with": it signs the callback certificate.
- `fsp-inbound.guard.ts:23` mentions the "date header for GET".

---

## 4. Private keys: where generated, where stored

| Key | Generated by | Stored in | Profile-dependent |
|---|---|---|---|
| CA roots (`pki_hub_client`, `pki_dfsp`) | Ceremony | AWS KMS (`vault-kv`) / CloudHSM (`pkcs11`) | Yes |
| CA intermediates | Vault PKI | Vault | No |
| Hub-facing JWS signing key (per DFSP) | web-pivotal at onboarding (see A3) / `provision-hsm-tenant.sh` | Vault KV `privateKey` (`vault-kv`) / CloudHSM, keyRef in Vault KV (`pkcs11`) / database (`database`) | Yes |
| DFSP access key (DFSP JWS) | DFSP | DFSP; Pivotal holds the public key only | No |
| DFSP client certificate key | DFSP (CSR) | DFSP | No |
| Hub client certificate key | trust-manager (RSA 4096) | Kubernetes Secret | No |
| web-inbound server certificate key | cert-manager | Kubernetes Secret (`istio-ingress-ext`) | No |
| Hub callback certificate key | MCM | MCM | No |

---

## 5. Facts for the reference pages

The four verification reports this register was built from also hold the full lists:

- every env var with its default and accepted values, per service (web-outbound, web-inbound, web-pivotal, trust-manager, Java connector);
- trust-manager jobs, intervals, Redis lock keys and log lines;
- MCM endpoints;
- Kubernetes resources and their owners;
- error responses and log lines.

They are transcribed into `reference/` in phase 4, each table re-checked against the file and line it cites.

---

## 6. Decisions needed before writing

| # | Decision | Options |
|---|---|---|
| D1 | Supported version | **v1.0.1–v1.2.0** (verified, no difference), or also v1.3.0 (staging runs it; the tag has to be fetched and checked) |
| D2 | **The chart does not deploy trust-manager or any gateway/certificate resources** | (a) Fix the chart first (add trust-manager Deployment plus optional gateway and certificate templates), release, then document `helm install`. (b) Document the resources as YAML for the operator to apply, taken from the staging chart. |
| D3 | **HSM onboarding path:** web-pivotal is expected to fail on `pkcs11`, and portal onboarding makes a database key | Test it, then either fix the code or document `provision-hsm-tenant.sh` as the only HSM onboarding path. **The `pkcs11` setup is not published until this is settled.** |
| D4 | Defects found: | Fix before publishing, or document as-is with workarounds and known limitations |
| | • ceremony scripts destroy two Vault roles; | |
| | • KMS `dfsp-client` role is missing CSR settings; | |
| | • portal Signing Policy turns signing off; | |
| | • no JWS rotation command; | |
| | • no offboarding; | |
| | • web-inbound does not log signature rejections. | |
| D5 | `docs/operations/` conflicts (section 3) | Correct them as well, or retire them once the guide exists |
