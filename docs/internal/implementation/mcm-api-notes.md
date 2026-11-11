# MCM API — Notes for `shared/mcm-client`

What a local MCM actually does, established by running one. Everything here was executed against
**`mojaloop/connection-manager-api` v3.8.0** on 2026-09-02, not read from swagger.

Design rationale is in [`hub-facing-leg.md`](../design/hub-facing-leg.md) Part C. This file is the
mechanics, and it records where reality differs from the design docs.

---

## Running one locally

`connection-manager-api` ships a compose stack. The `full` profile uses the **published** image, so
no build is needed:

```bash
cd connection-manager-api
DATABASE_PORT=3307 docker compose --profile full up -d
```

`DATABASE_PORT` must be overridden: MCM's MySQL defaults to **3306**, which `ml-core-test-harness`
already holds. Nothing else collides — traefik takes 80 and 8090.

Routing is by `Host` header through traefik: the API is `http://mcm.localhost/api`, Keycloak is
`http://keycloak.mcm.localhost`. Costs roughly 1.4 GiB.

---

## Authentication — the part that will cost you a day

Machine access is Keycloak **client credentials** against realm `dfsps`. A token needs **two** things,
and missing either returns a bare `401 Authentication required` that says nothing useful:

| Requirement | Symptom when absent |
| --- | --- |
| `aud` contains `connection-manager-api` | 401, no server-side log |
| `groups` claim, full path | 401 **and** `TypeError: roles is not iterable` in the API log |

The second is an upstream defect worth knowing rather than diagnosing twice.
`extractRoles` (`src/utils/authUtils.js:194`) does `claims.groups?.map(...)` and then spreads the
result — so a token with **no** `groups` claim yields `undefined` and throws on the spread, instead of
producing an empty role set. A machine client with no groups therefore fails with a type error, not
an authorization message.

Neither claim is present by default. The stock `connection-manager-api-service` client has **no
protocol mappers at all**; only `connection-manager-auth-client` (the browser client) has a `groups`
mapper. So a machine credential needs both mappers added, plus group membership.

### Group names are the authorization model

`authUtils.js:186` maps group paths to roles:

| Group path | Role |
| --- | --- |
| `/Application/PTA` | `pta` — hub operator |
| `/Application/MTA` | `mta` — DFSP admin |
| `/Application/DFSP:<fspId>` | per-tenant; sets `isDfsp` |

`/Application/MTA` and `/Application/PTA` exist in the shipped realm. Per-DFSP groups do not — they
follow the `dfsp_id`-to-security-group convention in `dfsp-model.md`.

**Use per-DFSP groups in production, not `pta`.** `hub-facing-leg.md` Part C explains why: `pta`
short-circuits authorization on every `/dfsps/{dfspId}` path, so it would let Pivotal modify
registrations of DFSPs it does not front. `pta` is appropriate only for a local harness, or where you
also operate the Hub.

---

## The endpoints `shared/mcm-client` needs

All verified working.

| Call | Result |
| --- | --- |
| `POST /dfsps` | creates a tenant. **`email` is required** — omit it and you get `ValidationError: email is required`. Not mentioned in the design docs |
| `POST /dfsps/{id}/ca` | registers Pivotal's root. Body `{"rootCertificate": "<pem>"}` |
| `POST /dfsps/{id}/jwscerts` | publishes a tenant's public key. Body `{"publicKey": "<pem>"}` — note the field is `publicKey`, though the endpoint is named `jwscerts` |
| `GET /dfsps/{id}/jwscerts` | read-back for the compare step |
| `GET /dfsps/jwscerts` | **aggregate** — every tenant in one call, outside the `/dfsps/{id}/` pattern, so one credential and one token |
| `GET /hub/ca` | the Hub CA, as `{"rootCertificate": ...}` |

### Confirmed empirically, not just argued

**The same CA registers under N tenants.** Pivotal's `pki_hub_client` root was posted to both
`wallet1` and `wallet2`; both returned `validationState: VALID`. MCM applies no uniqueness constraint
and no cross-DFSP comparison, which is what settled decision 6 (*register the CA, not the leaf*)
depends on.

**RSA keys register `VALID`.** Both tenants' RS256 public keys came back `VALID`, as settled decision
3 predicted. The `INVALID`-for-EC behaviour documented in `hub-facing-leg.md` §A1 does not arise, and
MCM's validation signal stays usable.

**Byte-identical read-back works.** `POST` then `GET` returned exactly the PEM sent, for both
tenants. That is the check §A1 specifies to replace MCM's parse-only validator, and it is now known
to be implementable rather than assumed.

**MCM auto-creates a Keycloak client per `dfspId`.** Creating `wallet1` and `wallet2` produced
Keycloak clients named `wallet1` and `wallet2` (log: *"Successfully created all Keycloak resources
for DFSP wallet2"*). This is the native per-DFSP credential model Part C recommends.

---

## Open items

- **`GET /dfsps/{id}/credentials` returns 404** in v3.8.0, for tenants whose Keycloak clients demonstrably
  exist. Part C treats this as the bootstrap path — *"Bootstrap with `GET`, never `POST`"*, because
  `POST` calls Keycloak's `generateNewClientSecret` and invalidates the existing secret with no grace
  period. That warning still stands, but the `GET` path needs investigating before it can be relied
  on. Reading the secret from the Keycloak admin API is the workaround.
- **Inbound enrollment** (`POST /dfsps/{id}/enrollments/inbound`, then `/sign`) — the path that
  yields web-inbound's server certificate — is **not yet exercised**. Different issuance path from
  every other certificate in the programme.
