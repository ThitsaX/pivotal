# Environment Setup and DFSP Onboarding

What an operator has to do by hand, in order. Everything else is automatic.

Written from what dev2 actually needed on 2026-09-05/07. Where a step exists only because
something is not yet automated, that is said.

---

## Part 1 — Once per environment

### 1. Root the two certificate authorities

Follow [`ceremony-kms.md`](./ceremony-kms.md). For an environment after the first, run **steps 3–6
only** — the roots already exist, and section 9 covers reusing them.

Produces the Vault mounts `pki_hub_client` and `pki_dfsp`.

### 2. Sync `vault-pki-app`, then `pivotal`

**This order matters everywhere in this document.** `vault-pki-app` carries the Vault roles and
policies; a workload that starts before its role exists fails to authenticate.

Then verify in **Vault**, not in ArgoCD — the operator applies the custom resources asynchronously,
so a Synced application does not mean Vault has them:

```bash
vault read pki_dfsp/roles/dfsp-client | grep use_csr
```

Both `use_csr_common_name` and `use_csr_sans` must read **false**. If either is `true`, the CRD
silently dropped the field and any DFSP can put any name on its own certificate — which makes the
binding check worthless. Nothing else in this document matters if this is wrong.

### 3. Publish the DFSP trust anchor to the gateway

Istio reads a gateway's trust anchor from a Secret named after its credential with `-cacert`
appended, in the gateway's own namespace:

```bash
kubectl -n istio-ingress-ext create secret generic lets-enc-external-tls-cacert \
  --from-file=cacert=dfsp-intermediate-<env>.pem
```

The **intermediate**, not the root. Publishing the root would make certificates from other
environments verify here too.

trust-manager keeps this in step once running; it is created by hand because the gateway needs it
before trust-manager can start.

### 4. Set the gateway to `MUTUAL`

In the gitops chart, on the host DFSPs call. From this moment every caller must present a
certificate this deployment issued.

```bash
curl -sv https://<host>/health 2>&1 | tail -5
```

A TLS alert about a required certificate is success. Under TLS 1.3 it appears as a failed *read*,
not a failed connect — the handshake completes first.

### 5. Give trust-manager its credentials

**Keycloak** — create a confidential client (`pivotal-trust-manager`) in the realm MCM validates
against. Client authentication **on**, Service accounts roles **on**, every other flow off.

```bash
kubectl -n pivotal create secret generic trust-manager-mcm \
  --from-literal=MCM_CLIENT_SECRET='<from Keycloak>'
```

**The hub-client CA it registers with MCM**, written by the ceremony:

```bash
kubectl -n pivotal create secret generic pivotal-hub-client-ca \
  --from-file=ca.pem=hub-client-root-ca.pem
```

Confirm the client works before depending on it:

```bash
curl -s -X POST https://<keycloak>/realms/<realm>/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=pivotal-trust-manager -d client_secret=<secret> \
  | jq 'if .access_token then "OK" else . end'
```

### 6. Register Pivotal itself in MCM

```bash
curl -s -X POST http://<mcm>/api/dfsps -H 'Content-Type: application/json' \
  -d '{"dfspId":"pivotal","name":"pivotal","monetaryZoneId":"USD"}'
```

Note the `/api` prefix. Call MCM in-cluster: the ingress host delegates `/api/*` to Ory, which
expects a browser session.

### 7. Enable trust-manager

Set `trustManager.enabled: true` and sync. Watch all five jobs start:

```bash
kubectl -n pivotal logs deploy/trust-manager --tail=40
```

`Hub CA sync`, `Peer JWS sync`, `Hub server certificate`, `MCM CA registration`, `DFSP CA publish`.
A 403 within a second of startup is the Istio sidecar not yet ready; it clears on the next tick.

---

## Part 2 — Per DFSP

### 1. Register the DFSP in MCM — **before onboarding**

```bash
curl -s -X POST http://<mcm>/api/dfsps -H 'Content-Type: application/json' \
  -d '{"dfspId":"DemoDFSP3","name":"DemoDFSP3","monetaryZoneId":"USD"}'
```

Onboarding does **not** do this, and skipping it fails silently: onboarding reports success, the key
is provisioned, and the omission only appears up to an hour later as a `404 DFSP with id … not
found` in a scheduler log.

Ids are case-sensitive throughout — database collation, the guard's comparison, and the Vault path.

### 2. The DFSP's access key

The DFSP generates this and sends the **public** half. For testing, generate both:

```bash
openssl genrsa -out <fspId>-access.key 2048
openssl rsa -in <fspId>-access.key -pubout -out <fspId>-access.pub
```

This authenticates their `/secured/sendmoney` calls. It is not the FSPIOP signing key, and not the
TLS client certificate.

### 3. Onboard

Portal → **Participant → Onboard FSP**: name, currencies, endpoint, and the access public key.

No signing key is asked for. It is generated during onboarding into whatever custody the deployment
uses and never leaves it.

Confirm the whole chain, which should complete in about a second:

```bash
kubectl -n pivotal logs deploy/web-pivotal   --tail=30 | grep -iE 'Provisioned|Announced'
kubectl -n pivotal logs deploy/trust-manager --tail=30 | grep -iE 'published|enabled'
```

Expect: provisioned into Vault → announced → published to MCM → `signing is now enabled`. If the
announcement is missing, the hourly reconcile both publishes and switches signing on instead — later,
but not broken. It logs `was published to MCM but never switched on`, which names the tenant and says
the announcement was the part that failed.

```bash
vault kv get secret/pivotal/jwskey/<fspId>
```

### 4. The DFSP's TLS client certificate

The DFSP generates a key and CSR, and sends **only the CSR**:

```bash
openssl req -new -newkey rsa:2048 -nodes \
  -keyout <fspId>-client.key -out <fspId>-client.csr \
  -subj "/CN=anything/O=anything"
```

The subject is ignored — Vault forces `CN=<fspId>`. Use a deliberately wrong one on the first
enrolment of an environment, so the override is proved rather than assumed.

Enrol through Portal → **Participant → Certificates**, then check what came back:

```bash
openssl x509 -in <downloaded>.pem -noout -subject -issuer
```

`CN=<fspId>` means the override is live. Anything else means step 2 of Part 1 regressed.

### 5. A connector, if the DFSP needs one

In the gitops chart, copy an existing connector block and change:

- `name`, `serviceAccount.name`, `CONNECTOR_ID` (matching the fspId exactly)
- `SNOWFLAKE_NODE_ID` — **must be unique across every workload**; a collision surfaces much later as
  duplicate identifiers
- `VAULT_ROLE`, and add the matching Vault policy and role so it reads **only its own** key path
- `BACKEND_ENDPOINT`, `CONNECTOR_ILP_SECRET`

The connectors read `VAULT_URL`; the TypeScript services read `VAULT_ADDRESS`. Same idea, different
name, and nothing reconciles them.

Sync `vault-pki-app` before `pivotal`.

---

## Part 3 — Before end-to-end testing

### Flags

| | Turn on when |
| --- | --- |
| `FSPIOP_USE_JWS` | every tenant that will transact has a key in Vault and is published to MCM. A tenant without one logs a warning and sends unsigned — it does not fail |
| `DFSP_FACING_MTLS` | every caller on that host holds an enrolled certificate **and has been seen using it**. It rejects any request without one. Leaving it off does not leave the leg unprotected: a caller that presents a certificate is verified either way, so enrolled participants are bound to theirs from their first request and this flag only closes the door behind the last one |
| `FSPIOP_USE_MUTUAL_TLS` | the Hub endpoints are `https://` **and** the Hub edge requests a client certificate. Until then there is no handshake to make mutual |

Turn them on one at a time. They fail at different layers — JWS at the Hub, mutual TLS at your own
gateway — and a single failed transfer will not tell you which.

### The test that matters

With two enrolled participants — and worth running **before** turning `DFSP_FACING_MTLS` on, since
every row below behaves identically either way:

| Certificate | `fspiop-source` | Expected |
| --- | --- | --- |
| A | A | accepted |
| B | B | accepted |
| **B** | **A** | **rejected** |

Running it with the flag still off is how a participant proves its certificate works without risking
anyone else: only the flag's own row — a caller presenting **no** certificate, accepted while off and
rejected once on — changes when you turn it on.
| none | anything | refused at TLS |

The third row is the point. Both credentials are individually valid — B's certificate is genuine and
current — and it still cannot transact as A. That is what makes a leaked access key insufficient on
its own.

```bash
kubectl -n pivotal logs deploy/web-outbound --tail=50 | grep -i 'certificate belongs to'
```

### Known gaps to expect

- **A quote may fail on the connector's empty `extensionList`**, unrelated to any of this. The
  certificate check runs before any quote, so acceptance and rejection are still clean to observe.
- **A participant onboarded before automatic provisioning existed has no signing key** and will not
  sign. Re-onboarding provisions one.
