# Scheduled Jobs

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

trust-manager's jobs. Each timer job runs once at startup and then on its interval.

With more than one trust-manager replica, every replica's timer fires, and a Redis lock lets only
one of them run the job. The lock expires after the job's interval plus a short buffer, so a replica
that dies mid-run holds it for at most about one interval. A failed run is retried on the next
tick.

---

## Timer jobs

Sources: `packages/apps/trust-manager/required.settings.ts`;
`packages/core/trust/domain/domain.module.ts` (lock keys);
`packages/core/trust/domain/component/*.scheduler.ts`, `*.enroller.ts`.

| Job | Interval variable | Default | Redis lock key | What it does |
|---|---|---|---|---|
| Peer JWS sync | `PEER_JWS_SYNC_INTERVAL_SECONDS` | 300 s | `pivotal:trust:peer-jws-sync` | Reads every participant's JWS public key from MCM and updates the peer rows in `participant_key`. New peer rows are created with verify mode `off`. Skips Pivotal's own tenants. web-inbound uses these keys to verify. |
| Hub CA sync | `HUB_CA_SYNC_INTERVAL_SECONDS` | 3600 s | `pivotal:trust:hub-ca-sync` | Reads the Hub CA from MCM and writes it to the Hub CA bundle Secret. Writes only when it changed. |
| DFSP CA publish | `DFSP_CA_PUBLISH_INTERVAL_SECONDS` | 3600 s | `pivotal:trust:dfsp-ca-publish` | Reads the DFSP CA intermediate from Vault (and the root, only if `DFSP_CA_ROOT_PKI_MOUNT` is set) and writes it to the DFSP-facing gateway's `-cacert` Secret. Off unless `DFSP_CA_GATEWAY_NAMESPACE` and `DFSP_CA_GATEWAY_SECRET_NAME` are set. |
| MCM CA registration | `MCM_CA_RECONCILE_INTERVAL_SECONDS` | 3600 s | `pivotal:trust:mcm-ca-registration` | Registers the Pivotal Hub-client CA (root from `PIVOTAL_CA_PATH`, plus the intermediates) in MCM under every own tenant and under `PIVOTAL_DFSP_ID`. Skips entries that already match. |
| JWS key publish | `JWS_KEY_PUBLISH_INTERVAL_SECONDS` | 3600 s | `pivotal:trust:jws-key-publish` | For each own tenant: publishes its public key if MCM has none, then turns signing on once, for a tenant that was never switched on before. A tenant an operator switched off stays off. **Never replaces** a different key MCM already holds; it logs a warning and does not change the tenant's signing setting. |
| Hub client certificate | `HUB_SERVER_CERT_CHECK_INTERVAL_SECONDS` | 86400 s | `pivotal:trust:hub-server-cert` | Enrolls a new Hub client certificate through MCM when none exists or it expires within **30 days** (fixed). Writes `tls.crt` and `tls.key` to the Hub client certificate Secret. |
| Hub callback certificate | `HUB_CALLBACK_CERT_CHECK_INTERVAL_SECONDS` | 86400 s | `pivotal:trust:hub-callback-cert` | Signs the Hub callback certificate with Vault and publishes it to the Hub through MCM, when none exists or it expires within **30 days** (fixed). Waits until the Pivotal CA is registered in MCM. Off unless `HUB_CALLBACK_CERT_COMMON_NAME` is set. |

---

## Event consumer

Source: `packages/core/trust/domain/component/signing-tenant.consumer.ts`.

| Consumer | Source | Settings | What it does |
|---|---|---|---|
| Signing-tenant consumer | NATS subject `trust.signing-tenant.provisioned` on stream `PIVOTAL_TRUST` | `NATS_URL`; `PIVOTAL_TRUST_STREAM_NAME` (default `PIVOTAL_TRUST`); `PIVOTAL_TRUST_STREAM_MAX_AGE_MS` (default 7 days) | Publishes a newly onboarded tenant's key to MCM within seconds and turns its signing on. Without NATS, the hourly JWS key publish does the same job. |

When `MCM_AUTO_REGISTER_DFSPS=true`, MCM CA registration, JWS key publish and the consumer first
create the tenant in MCM if it is missing.

---

## Log lines

Sources: the same files. Use these to confirm a job is running and what it did. `<n>` is a number.

| Job | At startup | When it acts | When it fails |
|---|---|---|---|
| Peer JWS sync | `Peer JWS sync scheduled every <n>s.` | `Peer JWS sync: <n> added, <n> updated, <n> unchanged, <n> own tenants skipped.` (only when something changed) | `Peer JWS sync failed; retrying next tick: <message>` |
| Hub CA sync | `Hub CA sync scheduled every <n>m.` | `Hub CA changed and Secret '<name>' was rewritten. …` (warning) | `Hub CA sync failed; retrying next tick: <message>` |
| DFSP CA publish | `DFSP CA publish scheduled every <n>m to <namespace>/<secret>.` or `No DFSP-facing gateway configured; the DFSP CA will not be published.` | `Updated Secret <namespace>/<name>.` | `DFSP CA publish failed: <message>` |
| MCM CA registration | `MCM CA registration reconcile scheduled every <n>m.` | `Registered the Pivotal CA with MCM for '<dfspId>'.` and `MCM CA reconcile: <n> registered, …` | `Could not register the Pivotal CA for '<dfspId>': <message>`; `MCM CA reconcile failed; retrying next tick: <message>` |
| JWS key publish | `JWS key publish scheduled every <n>m.` | `Published and verified the JWS public key for '<fspId>'.`; `'<fspId>' is published to MCM and signing is now enabled.` | `MCM holds a different signing key for '<fspId>' than Pivotal does. …` (warning); `Could not publish the signing key for '<fspId>': <message>` |
| Hub client certificate | `Hub server certificate check scheduled every <n>h, renewing 30 days before expiry.` | `Hub server certificate expires in <n> days; renewing.`; `Enrolled a Hub-signed server certificate for '<commonName>' into Secret '<name>'.` | `Hub server certificate enrollment failed; retrying next tick: <message>` |
| Hub callback certificate | `Hub callback certificate for '<commonName>' checked every <n>h, renewed 30 days before expiry.` | `The Hub's callback certificate expires in <n> days; renewing.`; `Signed and published the Hub's callback certificate for '<commonName>' (enrollment <id>).` | `Waiting for Pivotal's CA to be registered under '<dfspId>' …` (warning); `Hub callback certificate renewal failed; retrying next tick: <message>` |
| Signing-tenant consumer | `Listening for signing tenants on 'trust.signing-tenant.provisioned'.` or `No NATS connection; signing tenants will be published by the periodic reconcile rather than on announcement.` | `'<fspId>' is published to MCM and signing is now enabled.` | — |

The Hub client certificate job's log lines say "server certificate". It is the Hub client
certificate; see the [glossary](./glossary.md).
