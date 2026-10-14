# MCM Endpoints

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

Every Mojaloop Connection Manager (MCM) call Pivotal makes. Only trust-manager calls MCM. The calls
are the same in both key profiles.

**MCM version:** tested against MCM **v3.7.4**. Check any other version against this list before
you use it.

---

## Authentication

Sources: `packages/shared/mcm-client/component/mcm-token-provider.ts`;
`packages/shared/mcm-client/component/mcm-axios.ts` (`toException`).

| Item | Value |
|---|---|
| Token request | `POST <MCM_TOKEN_URL>` with `grant_type=client_credentials`, `MCM_CLIENT_ID`, `MCM_CLIENT_SECRET` |
| Token use | `Authorization: Bearer <token>` on every MCM call |
| Token must carry | audience `connection-manager-api` and a `groups` claim. Both come from Keycloak client mappers, not from Pivotal settings. |
| Token issuer | Must match the issuer MCM discovered. Request the token from the same host name MCM uses for Keycloak. |
| Rejected token | Error code `MCM_UNAUTHORIZED` (HTTP 401) in trust-manager's log |
| Any other failure | Error code `MCM_REQUEST_FAILED`, with the method, path and status |

Do not give trust-manager's MCM client the Hub-operator (`pta`) role. It does not need it.

---

## Endpoints

Source: `packages/shared/mcm-client/component/mcm-axios.ts`; callers in
`packages/core/trust/domain/component/`. Paths are relative to `MCM_BASE_URL`. `{dfspId}` is a
tenant ID or `PIVOTAL_DFSP_ID`.

| Method and path | Purpose | Called by | When |
|---|---|---|---|
| `GET /dfsps` | List DFSPs known to MCM | DFSP auto-registration | `MCM_AUTO_REGISTER_DFSPS=true` |
| `POST /dfsps` | Create a missing DFSP | DFSP auto-registration | `MCM_AUTO_REGISTER_DFSPS=true` |
| `GET /dfsps/{dfspId}/ca` | Read the CA MCM holds for a DFSP | MCM CA registration; Hub callback certificate | Hourly; daily |
| `POST /dfsps/{dfspId}/ca` | Register the Pivotal Hub-client CA (root and intermediates) | MCM CA registration | Hourly, for each tenant and for `PIVOTAL_DFSP_ID`, when MCM's copy differs |
| `GET /hub/ca` | Read the Hub CA | Hub CA sync | Hourly |
| `GET /dfsps/jwscerts` | Every participant's JWS public key, in one call | Peer JWS sync | Every 5 minutes |
| `GET /dfsps/{dfspId}/jwscerts` | Read a tenant's JWS public key | JWS key publish | Hourly, and on a new-tenant announcement |
| `POST /dfsps/{dfspId}/jwscerts` | Publish a tenant's JWS public key | JWS key publish | Only when MCM holds no key for the tenant. Never replaces an existing key. |
| `POST /dfsps/{dfspId}/enrollments/inbound` | Submit a CSR for the Hub client certificate | Hub client certificate | When no certificate exists, or it expires within 30 days |
| `POST /dfsps/{dfspId}/enrollments/inbound/{id}/sign` | Ask the Hub CA to sign it | Hub client certificate | Right after the submit |
| `GET /dfsps/{dfspId}/enrollments/outbound` | List Hub callback certificate enrollments | Hub callback certificate | Daily |
| `POST /dfsps/{dfspId}/enrollments/outbound/csr` | Have MCM create a key and CSR for the Hub callback certificate | Hub callback certificate | When renewing and no unsigned CSR is waiting |
| `POST /dfsps/{dfspId}/enrollments/outbound/{id}/certificate` | Upload the certificate Pivotal's CA signed | Hub callback certificate | When renewing |
| `POST /dfsps/{dfspId}/onboard` | Publish the newest callback certificate and the registered CA to the Hub's egress | Hub callback certificate | After an upload, retried until it succeeds |

`{dfspId}` for the two enrollment groups and `onboard` is always `PIVOTAL_DFSP_ID`.

---

## Behaviour to know

Source: `mcm-axios.ts`; `jws-key-publish.scheduler.ts`.

| Behaviour | Effect |
|---|---|
| A published JWS key is read back and compared with what was sent | A difference fails with `MCM_JWS_KEY_MISMATCH` |
| Pivotal makes **no `DELETE`** call | Nothing Pivotal registers in MCM is removed by Pivotal |
| `POST /dfsps/{dfspId}/onboard` also rewrites the Hub's IP allowlist from every DFSP's registered egress addresses | It is called only when the callback certificate has changed |
| An inbound enrollment needs a 4096-bit key | trust-manager generates RSA 4096. A shorter key is signed but recorded `INVALID`. |
| `GET /dfsps/{dfspId}/credentials` exists in the client but has no caller | Not used |
