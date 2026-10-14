# Troubleshooting

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

## Summary

This page lists failures in Pivotal's mTLS and JWS setup: the symptom you see, its cause, and the
fix. Start with [Find the failing leg](#find-the-failing-leg), then go to the section for that leg.

Every message on this page is quoted from Pivotal's code. Parts in `<ANGLE_CAPS>` vary. To read a
service's log:

```bash
kubectl -n <PIVOTAL_NAMESPACE> logs deploy/<SERVICE> --since=1h
```

`<SERVICE>` is `web-outbound`, `web-inbound`, `web-pivotal`, `trust-manager`, or the name of a
connector.

FSPIOP error responses carry a code in `errorInformation.errorCode`:

| Code | Meaning | HTTP status |
|---|---|---|
| `3105` | Invalid signature (also used for certificate failures) | 401 |
| `3101` | Malformed syntax | 417 |
| `3102` | Missing mandatory element | 417 |

## Find the failing leg

| What fails | Leg | Go to |
|---|---|---|
| A DFSP's request to Pivotal is refused, or the TLS handshake with the DFSP-facing gateway fails | 1. DFSP → web-outbound | [Leg 1](#leg-1-dfsp-facing) |
| Pivotal's requests to the Hub fail, or the Hub rejects their signatures | 2. web-outbound → Hub | [Legs 2 and 3](#legs-2-and-3-hub-facing-outbound) |
| A connector's callbacks to the Hub fail, or the Hub rejects their signatures | 3. connector → Hub | [Legs 2 and 3](#legs-2-and-3-hub-facing-outbound) |
| The Hub cannot reach web-inbound, or web-inbound rejects the Hub's messages | 4. Hub → web-inbound | [Leg 4](#leg-4-hub-facing-inbound) |
| A certificate, CA or public key is not where it should be (Secret, MCM) | — | [trust-manager and MCM](#trust-manager-and-mcm) |
| A service cannot read or write Vault | — | [Vault](#vault) |
| A service on the `pkcs11` profile fails to start or to sign | — | [HSM](#hsm) |
| A pod does not start, or a setting has no effect | — | [Helm and deployment](#helm-and-deployment) |

A quick way to tell transport (mTLS) failures from signature (JWS) failures:

- **No HTTP response at all** (connection reset, handshake failure, `certificate unknown`): mTLS. Check
  certificates and CA bundles.
- **An HTTP response with code `3105`, `3101` or `3102`**: the connection worked. Check the
  certificate binding or the JWS signature.

## Leg 1: DFSP-facing

These responses come from web-outbound. Certificate failures are also logged by web-outbound, with
the first 16 characters of the certificate's SHA-256 fingerprint.

| Symptom | Cause | Fix |
|---|---|---|
| `3105` `No verified client certificate accompanied this request.` | `DFSP_FACING_MTLS_MANDATORY` is `true` and the request reached web-outbound without a verified client certificate. Either the DFSP sent none, or the DFSP-facing gateway did not forward the certificate details. | Check the DFSP sends its certificate. Check the DFSP-facing gateway is in mutual TLS mode and forwards client certificate details. See [Enable the DFSP-facing side](setup/common/enable-dfsp-facing.md). |
| `3105` `The client certificate presented is not recognised.` Log: `Rejected '<FSP_ID>': certificate <FINGERPRINT> is not one this deployment issued.` | The certificate was not issued by this Pivotal deployment, or its record is missing from the database. | Issue a certificate for the DFSP through Pivotal. See [Issue a client certificate](setup/common/enable-dfsp-facing.md#step-5-issue-a-client-certificate-to-each-test-dfsp). |
| `3105` `The client certificate presented has been revoked.` | The certificate was revoked. | Issue a new certificate. A revoked certificate cannot be reinstated. |
| `3105` `The client certificate presented is not currently valid.` | The certificate has expired, or its start date is in the future. | Issue a new certificate. If it is not yet valid, check the clocks. |
| `3105` `The client certificate does not belong to the participant named in fspiop-source.` Log (error): `Rejected: certificate belongs to '<FSP_ID_A>' but the request claims fspiop-source '<FSP_ID_B>'.` | A DFSP is using another DFSP's certificate, or sends the wrong `FSPIOP-Source`. This can be an attack. | Confirm with the DFSP which participant it is. Investigate if the DFSP did not cause it. |
| `3105` `No trusted access public key registered for fspiop-source: '<FSP_ID>'.` | Pivotal has no access public key for this DFSP, or the `FSPIOP-Source` value is wrong. FSP IDs are case-sensitive. | Check the FSP ID. Set the access key with `PUT /participant/access-key`. |
| `3105` `Authorization signature verification failed.` | The `authorization` JWS was not signed with the private key that matches the registered access public key. | Check the DFSP signs with the right key. If the DFSP changed its key, update the access public key. |
| `3105` `Authorization payload does not match request body.` | The JWS payload is not the request body. The comparison ignores key order and whitespace, so a value differs. | The DFSP must sign exactly the body it sends. |
| `3102` `Missing mandatory header: authorization.` | No `authorization` header. | The DFSP must send the compact JWS in `authorization`, without a `Bearer` prefix. |
| `3101` `Header authorization must be a valid compact JWS token.` | The header is not three dot-separated parts. | As above. |
| `3105` `Header date is outside the allowed clock window.` (`/secured/transferStatus` only) | The `date` header is more than 5 minutes before or after Pivotal's clock. | Fix the DFSP's clock, or its use of the `date` header. |
| `3105` `Authorization nonce has already been used.` (`/secured/transferStatus` only) | The same nonce was sent twice within 10 minutes. | The DFSP must use a new nonce for every request. |
| TLS handshake fails at the DFSP-facing gateway | The DFSP's certificate does not chain to the DFSP CA, or the gateway's trust anchor Secret is missing or out of date. | Check trust-manager's DFSP CA publish job in [trust-manager and MCM](#trust-manager-and-mcm). |
| A revoked DFSP can still transact | `DFSP_FACING_MTLS_MANDATORY` is `false`, so a DFSP that sends no certificate is admitted. | See [Known limitations](known-limitations.md#revocation-does-not-cut-off-a-dfsp-while-mtls-is-optional). |

## Legs 2 and 3: Hub-facing outbound

| Symptom | Cause | Fix |
|---|---|---|
| web-outbound does not start: `Mutual TLS is enabled but no certificate or trust anchor is configured.` | `FSPIOP_USE_MUTUAL_TLS=true` but neither the client certificate nor the CA is configured, or the files are not mounted. If only one of them is missing, web-outbound starts and the TLS handshake with the Hub fails instead (see the handshake row below). | Set `FSPIOP_MTLS_CLIENT_CERT_PATH`, `FSPIOP_MTLS_CLIENT_KEY_PATH` and `FSPIOP_MTLS_CA_PATH`, and mount the Hub client certificate and Hub CA bundle Secrets. See [Environment variables](reference/environment-variables.md). |
| A connector does not start: `Mutual TLS is enabled but no client certificate is configured. Set fspiopMtlsClientCertPath and fspiopMtlsClientKeyPath.` or `… no certificate authority is configured, so the peer could not be verified. Set fspiopMtlsCaPath.` | The connector's `FSPIOP_MTLS_*_PATH` settings are missing, or the files are not mounted. | As above, for the connector. |
| web-outbound log: `Could not reload mutual TLS material; keeping the current one: <REASON>` | The mounted certificate files changed but could not be read, for example the certificate and key do not match. | Check the Hub client certificate Secret has both `tls.crt` and `tls.key` from the same enrollment. |
| The TLS handshake with the Hub API gateway fails | The Hub client certificate is missing, expired, or signed by a Hub CA the Hub no longer trusts. Or the Hub CA bundle is out of date. | Check the certificate's dates and issuer (see [Check certificate renewals](runbooks/common/check-certificate-renewals.md)). After a Hub CA change, see [Hub CA re-root](runbooks/common/hub-ca-reroot.md). |
| web-outbound log: `Tenant '<FSP_ID>' has jws_sign_enabled but no key at Vault path '<PATH>' field 'privateKey'. It will not sign.` | `vault-kv`: signing is on for the tenant, but its key is not in Vault at that path. | Check the tenant was onboarded on this profile, and that `VAULT_KV_MOUNT` and `VAULT_JWS_KEY_PATH_PREFIX` match where the key was written. |
| web-outbound log: `Failed to read the JWS key for '<FSP_ID>' from Vault path '<PATH>': <REASON>. No previously loaded key to fall back on; this tenant will not sign.` | `vault-kv`: web-outbound cannot read the key from Vault. | See [Vault](#vault). |
| Connector log: `No JWS signing key at Vault path '<PATH>'. Outbound FSPIOP callbacks will be sent unsigned.` | The connector found no key when it started. | Check the path and the connector's Vault policy, then restart the connector. It reads the key only at startup. |
| Connector log ends with `Outbound FSPIOP callbacks will be sent unsigned.` (`pkcs11`) | The connector could not load its key from the HSM. The first part of the line gives the reason. | See [HSM](#hsm). Restart the connector after fixing it. |
| The Hub rejects Pivotal's messages because the signature is invalid | The Hub verifies with the public key MCM holds for the tenant. Either MCM holds a different key, or the message was not signed. | Check trust-manager published the tenant's key (see [trust-manager and MCM](#trust-manager-and-mcm)). Check signing is on: `FSPIOP_USE_JWS=true`, and the tenant's JWS Policy has signing enabled. |
| A tenant never signs, although its key is in MCM | Signing was turned off by an operator after trust-manager had turned it on. trust-manager turns signing on only once and never undoes an operator's change. | Turn signing on in the portal: **Participant → JWS Policy**. |

## Leg 4: Hub-facing inbound

web-inbound **does not log** these rejections. You see them only in the response returned to the Hub,
so check the Hub's logs. See [Known limitations](known-limitations.md#web-inbound-does-not-log-rejected-signatures).

| Symptom | Cause | Fix |
|---|---|---|
| The Hub cannot complete the TLS handshake with the Pivotal callback gateway | The Hub callback certificate does not chain to the CA in the gateway's `-cacert` Secret, or has expired. Or the Hub does not trust the web-inbound server certificate's CA. | Check the Hub callback certificate status in trust-manager's log (see [trust-manager and MCM](#trust-manager-and-mcm)). Check the `-cacert` Secret holds the Pivotal Hub-client CA. See [Enable the Hub-facing side: inbound](setup/common/enable-hub-facing-inbound.md). |
| `3105` `No trusted public key registered for fspiop-source: '<FSP_ID>'.` | web-inbound has no JWS public key for the sender. A peer's key arrives from MCM within about 5 minutes of being registered there. | Check MCM holds the sender's key. Check trust-manager's peer sync is running. |
| `3102` `Missing mandatory header: fspiop-signature.` | The sender's verify mode is `require` and the message is unsigned. | Make the sender sign, or set its verify mode to `verify-if-present` while it gets ready. |
| `3105` `JWS signature verification failed.` | The signature does not match the sender's public key. The sender may have changed its key. | Check the key MCM holds for the sender. A peer's new key reaches web-inbound within about 5 minutes. |
| `3105` `Signed FSPIOP-Source does not match the fspiop-source header.` (also `FSPIOP-HTTP-Method`, `FSPIOP-URI`, `FSPIOP-Destination`) | The signed header and the actual header differ. A proxy may have changed the request. | Find what changed the header between the sender and web-inbound. |
| `3105` `A bodyless request cannot carry a verifiable JWS signature.` | A request without a body carried a signature. | The sender must not sign bodyless requests. |
| `3101` `Header fspiop-signature must be a valid JSON object.` | The `fspiop-signature` header is not JSON. | Fix the sender. |
| web-inbound log: `Accepting unsigned FSPIOP requests from '<FSP_ID>' under verify-if-present. This source is not ready for require.` | The sender's verify mode is `verify-if-present` and it sent an unsigned message with a body. web-inbound logs this once per sender after it starts. | Expected during rollout. Do not move this sender to `require` while this warning still appears after a restart of web-inbound. |
| Signatures are never checked | `FSPIOP_USE_JWS` is not `true` on web-inbound, or the sender's verify mode is `off`. Per-sender settings override `FSPIOP_JWS_VERIFY_MODE`. | Set `FSPIOP_USE_JWS=true` and set the sender's verify mode in **Participant → JWS Policy**. |
| web-inbound does not start: `Mutual TLS is enabled but no server certificate is configured. Set FSPIOP_MTLS_SERVER_CERT_PATH and FSPIOP_MTLS_SERVER_KEY_PATH.` | `FSPIOP_USE_MUTUAL_TLS=true` reached web-inbound, usually from `global.commonFspiopEnv`. The Pivotal callback gateway terminates TLS, so web-inbound does not. | Set `FSPIOP_USE_MUTUAL_TLS: "false"` in web-inbound's own `env`. |

## trust-manager and MCM

trust-manager retries every failed job on its next run. The schedule of each job is in
[Scheduled jobs](reference/scheduled-jobs.md). Restarting trust-manager runs every job straight away.

| Symptom (trust-manager log) | Cause | Fix |
|---|---|---|
| `Hub server certificate enrollment failed; retrying next tick: <REASON>` | trust-manager could not get the Hub client certificate from MCM. `<REASON>` gives the MCM or Kubernetes error. | Check MCM is reachable and the MCM client credentials work. Check `PIVOTAL_DFSP_ID` exists in MCM. On a new MCM, the CA registration job creates it when `MCM_AUTO_REGISTER_DFSPS=true`; restart trust-manager once it has. |
| `MCM did not sign enrollment <ID> for '<DFSP_ID>' (state <STATE>).` | MCM accepted the request but did not sign it. | Ask the Hub operator to check MCM. |
| `MCM signed the certificate but recorded it '<STATE>'. The certificate is usable; the registry entry is not clean.` | MCM signed the certificate but flagged it. | No action needed for traffic. Report it to the Hub operator. |
| `Hub CA sync failed; retrying next tick: <REASON>` or `MCM returned no usable Hub CA certificate.` | trust-manager could not read the Hub CA from MCM. The existing Hub CA bundle stays in place. | Check MCM. Ask the Hub operator whether the Hub CA is set in MCM. |
| `Hub CA changed and Secret '<NAME>' was rewritten. Services that do not reload the bundle need a restart to pick it up.` | The Hub's CA changed. | web-outbound and the connectors reload the bundle on their own, within a few minutes. If the Hub re-rooted its CA, also follow [Hub CA re-root](runbooks/common/hub-ca-reroot.md). |
| `Could not register the Pivotal CA for '<FSP_ID>': <REASON>` | MCM refused the CA registration for one tenant. A `404` usually means the DFSP does not exist in MCM. | Set `MCM_AUTO_REGISTER_DFSPS=true`, or ask the Hub operator to create the DFSP in MCM. |
| `MCM CA reconcile failed; retrying next tick: No usable certificate at <PATH>.` (or a file-not-found error for that path) | The Pivotal Hub-client CA root is not mounted at `PIVOTAL_CA_PATH`, or the file holds no certificate. | Mount the `pivotal-hub-client-ca` Secret and set `PIVOTAL_CA_PATH` to the file. |
| `Waiting for Pivotal's CA to be registered under '<DFSP_ID>' before signing or publishing the Hub's callback certificate.` | The Hub callback certificate job waits for the CA registration job. | Normal on a new installation. If it persists, fix the CA registration errors above. |
| `Hub callback certificate renewal failed; retrying next tick: <REASON>` | Signing the Hub callback certificate failed. `Vault has no PKI role 'hub-callback-client' on mount 'pki_hub_client'.` means the role is missing; a refusal from Vault means trust-manager's policy does not allow signing. | Create the role or the policy. See [Vault](#vault). |
| `… The certificate is uploaded but onboarding '<DFSP_ID>' failed, so the Hub still presents the previous one. Retrying next tick, also after a restart; …` | MCM accepted the new callback certificate, but publishing it to the Hub failed. trust-manager tries again at its next daily check, also after a restart. | Check MCM. If it keeps failing, ask the Hub operator to run `POST /dfsps/<DFSP_ID>/onboard` in MCM. The Hub keeps presenting the previous certificate until then. |
| `Could not publish the signing key for '<FSP_ID>': <REASON>` | MCM refused the tenant's public key. A `404` usually means the DFSP does not exist in MCM. | As for CA registration above. |
| `MCM holds a different signing key for '<FSP_ID>' than Pivotal does. Not overwriting: …` | MCM already holds another public key for this tenant. trust-manager does not overwrite it, and leaves signing off. | No supported fix in this version. Do not change keys by hand. See [Known limitations](known-limitations.md#no-jws-signing-key-rotation). |
| `No NATS connection; signing tenants will be published by the periodic reconcile rather than on announcement.` | NATS is not configured for trust-manager. | Not an error. New tenants are published within an hour instead of within seconds. Set `NATS_URL` for faster publication. |
| `No DFSP-facing gateway configured; the DFSP CA will not be published.` | `DFSP_CA_GATEWAY_NAMESPACE` or `DFSP_CA_GATEWAY_SECRET_NAME` is not set. | Set both if Pivotal fronts DFSPs over mTLS. |
| `DFSP CA publish failed: <REASON>` with a Kubernetes `403` or `404` | The DFSP-facing gateway's trust anchor Secret does not exist. trust-manager may update that Secret but, by design, may not create it. | Create the Secret once, by hand, in the gateway's namespace. See [Enable the DFSP-facing side](setup/common/enable-dfsp-facing.md). |
| `Vault returned no certificate for mount '<MOUNT>'; leaving the published bundle untouched.` | The DFSP CA mount has no CA yet. | Run the CA ceremony for your profile. |
| `No root certificate read from '<MOUNT>'. Publishing the intermediate alone, …` | `DFSP_CA_ROOT_PKI_MOUNT` is set to a mount that holds no CA. | Leave `DFSP_CA_ROOT_PKI_MOUNT` unset; the intermediate alone is the intended anchor. |
| `DFSP CA publish failed: Vault answered 403 reading the CA chain of mount '<MOUNT>'. Check the mount exists.` | `DFSP_CA_ROOT_PKI_MOUNT` (or `DFSP_CA_PKI_MOUNT`) names a mount that does not exist. The published anchor is left unchanged. | Leave `DFSP_CA_ROOT_PKI_MOUNT` unset: no ceremony puts the root in Vault. |
| `DFSP CA changed and Secret '<NAMESPACE>/<NAME>' was rewritten. …` | The DFSP CA changed. | If you did not re-key the DFSP CA, investigate. See [Pivotal CA re-key](runbooks/common/pivotal-ca-rekey.md). |
| `MCM_UNAUTHORIZED`: `<METHOD> <PATH> was rejected. Three things make MCM answer this way: …` | The MCM token is missing the audience `connection-manager-api`, or the `groups` claim, or its issuer does not match the one MCM expects. | Ask the Hub operator to check the Keycloak client's mappers. Request the token from the same host name MCM uses for its issuer. |

## Vault

| Symptom | Cause | Fix |
|---|---|---|
| `<ACTION> was refused by Vault with status 403 using a freshly issued token. This is the role's policy, not an expired credential — check that '<ROLE>' grants the path.` (or status `401`) | The service logged in, but its Vault role's policy does not allow this path. | Add the path to the policy bound to `<ROLE>`. See [Vault reference](reference/vault.md). |
| `Vault mount '<MOUNT>' is KV version 1; this client speaks version 2. …` | The KV mount is version 1. | Mount a KV version 2 engine and set `VAULT_KV_MOUNT` to it. |
| `Vault has no PKI role '<ROLE>' on mount '<MOUNT>'.` | The PKI role was not created, or was removed. | Re-create the role. The CA ceremony creates the roles; see your profile's CA ceremony page. |
| `Vault login returned no client_token.` | Vault's Kubernetes auth did not issue a token for the role. | Check the Vault role exists and is bound to the service's ServiceAccount and namespace. |
| `Cannot read the Kubernetes ServiceAccount token at <PATH>. …` | The pod has no ServiceAccount token mounted. | Do not disable the token mount for this service. |
| Service does not start: `KEY_PROVIDER is 'vault-kv' but Vault is not configured. Set VAULT_ADDRESS, plus VAULT_ROLE for Kubernetes auth or VAULT_TOKEN when VAULT_AUTH_METHOD=token.` | `KEY_PROVIDER=vault-kv` without Vault settings. | Set the Vault settings. See [Environment variables](reference/environment-variables.md). |
| Service does not start: `Invalid KEY_PROVIDER: '<VALUE>'. Expected one of …` | `KEY_PROVIDER` has a value that is not accepted. | Use `vault-kv` or `pkcs11`. |
| Connector does not start: `fspiopUseJws is enabled but Vault is not configured. Set vaultUrl and vaultRole.` | The Java connector reads `VAULT_URL`, not `VAULT_ADDRESS`. | Set `VAULT_URL` and `VAULT_ROLE` on the connector. See [Environment variables](reference/environment-variables.md). |

## HSM

These apply to the `pkcs11` profile.

| Symptom | Cause | Fix |
|---|---|---|
| Service does not start: `KEY_PROVIDER is 'pkcs11' but the device is not configured. Set PKCS11_MODULE_PATH. …` | The PKCS#11 library path is not set. | Set `PKCS11_MODULE_PATH`. See [Environment variables](reference/environment-variables.md). |
| Service does not start: `KEY_PROVIDER is 'pkcs11' and this workload signs, so it needs its own crypto user. Set HSM_CRED_PATH to the Vault path holding that credential.` | A signing service has no crypto user credential configured. | Set `HSM_CRED_PATH`. |
| Service does not start: `KEY_PROVIDER is 'pkcs11' but Vault is not configured. …` | The crypto user credential and key references are read from Vault, but Vault is not configured. | Set the Vault settings. |
| web-outbound's requests for one tenant fail with `No private key labelled '<KEY_REF>' on this token. Either the key reference is stale, or this crypto user cannot see the key.`, while the tenant's own connector signs correctly | The tenant's key is not shared with the crypto user web-outbound signs as. | Contact Pivotal support. The `pkcs11` onboarding procedure, which shares the key, arrives with the next release. |
| `More than one private key is labelled '<KEY_REF>'. …` | Two keys in the HSM carry the same label. | Contact Pivotal support. Do not delete keys by hand. |
| Service does not start: `No crypto-user password at Vault path '<PATH>' field 'password'. This workload cannot sign without it.` | The credential is missing at that path, `VAULT_KV_MOUNT` points at the wrong mount, or the service's Vault policy cannot read it. | Check the path with `vault kv get`, then the mount and the policy. See [Vault reference](reference/vault.md). |
| Service does not start: `<N> PKCS#11 tokens are present in <MODULE> and no token label is configured. …` | `PKCS11_MODULE_PATH` points at a library that exposes more than one token. CloudHSM exposes one. | Check `PKCS11_MODULE_PATH`. Set `PKCS11_TOKEN_LABEL` only if the library really has several tokens. |
| Connector does not start: `Failed to open the CloudHSM key for '<FSP_ID>'.`, caused by `The CloudHSM JCE provider is not on the classpath. …` | The connector image was not built for CloudHSM. | Rebuild the image with `PKCS11_BACKEND=cloudhsm`. |
| Connector does not start: `Failed to open the CloudHSM key for '<FSP_ID>'.`, caused by `No key labelled '<KEY_REF>' is visible to this crypto user. Either the reference is stale, or the key was never shared with it.` | The key reference in Vault names a key this tenant's crypto user cannot see. | Check the key reference against the keys the tenant's crypto user owns. Contact Pivotal support before changing either. |
| Connector logs a warning `No key reference at Vault path '<PATH>'. The crypto user exists but no key has been provisioned.` and sends callbacks unsigned | The tenant's key has not been provisioned yet. | The `pkcs11` onboarding procedure, which provisions the key, arrives with the next release; contact Pivotal support. After the key exists, restart the connector: it reads its key only at startup. |

## Helm and deployment

| Symptom | Cause | Fix |
|---|---|---|
| A value set in `global.commonFspiopEnv` has no effect on one service | A value set in the service's own `env` wins over the shared block. | Remove the value from the service's `env`, or set it there. |
| trust-manager is not deployed | `trustManager.enabled` is `false` by default. | Set it to `true` after creating the Secrets it needs. See [Helm values](reference/helm-values.md). |
| trust-manager log shows a Kubernetes `403` when writing a Secret | The chart grants trust-manager write access only to the Secrets named in its settings. A different name is not covered. | Use the Secret names from your values file, and deploy with the chart so the RBAC rules match them. |
| Vault login fails after moving to chart 0.2.0 | Every service now runs as its own ServiceAccount. Vault roles bound to `default` no longer match. | Bind each Vault role to the service's own ServiceAccount. |

## References

- [Known limitations](known-limitations.md)
- [Environment variables](reference/environment-variables.md)
- [Scheduled jobs](reference/scheduled-jobs.md)
- [Vault reference](reference/vault.md)
