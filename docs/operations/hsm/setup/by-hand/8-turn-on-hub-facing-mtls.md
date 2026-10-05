# 8. Turn On Hub-Facing mTLS

> Eighth. Needs [`7-hub-side-for-hub-facing-mtls.md`](./7-hub-side-for-hub-facing-mtls.md) sections
> A–D. This records what was run **on Pivotal's side**: Pivotal reaching the Hub over mutual TLS, and
> web-inbound's public host for the Hub to call back on. Repointing callbacks to that host is doc 7,
> section E.

**Substitute throughout:** `<gitops>` the staging gitops repository, `<domain>` the staging domain,
`<cluster-public-ip>` the cluster's public address (doc 7, C).

| | What | Leaves you with |
| --- | --- | --- |
| A | Releases | images that can send the Hub's token and read a PKCS#8 key |
| B | Re-enrol the client certificate | a PKCS#8 key the Java connectors can load |
| C | Connectors to the Hub's mutual-TLS host | callbacks to the Hub over mutual TLS, with a token |
| D | web-outbound to the same host | every tenant's outbound requests over mutual TLS |
| E | web-inbound's public host | a host the Hub's egress can call back on over mutual TLS |

C before D, deliberately. web-outbound fronts every tenant, so moving it moves all of them at once;
the connectors move one tenant each, so a problem shows up on a demo tenant first.

---

## A. Releases

| Component | Minimum | What it adds |
| --- | --- | --- |
| pivotal (all services) | `v0.2.86` | web-outbound sends the Hub's bearer token (`FSPIOP_OAUTH_*`); trust-manager writes the client key as PKCS#8; `Authorization` is redacted from HTTP logs |
| connector framework | `v0.0.36` | callbacks carry the Hub's bearer token, with one retry on `401` |
| ThitsaWallet connector image | `v0.0.17` | built on that framework; passes `FSPIOP_OAUTH_TOKEN_URL` and `FSPIOP_OAUTH_CLIENT_ID` through. The secret is read from the environment, never passed on the command line |

**The extapi gateway needs all three** of the client certificate, the IP allowlist, and a token from
the Hub's `dfsps` realm. Mutual TLS alone is refused.

## B. Re-enrol the client certificate

trust-manager before `v0.2.86` wrote the key as PKCS#1, which the Java connectors refuse. It
replaces a certificate only when it is missing or near expiry, so the new version does not re-enrol
by itself.

| # | Command | Purpose |
| --- | --- | --- |
| 64 | `kubectl -n pivotal rollout status deploy/trust-manager` | Wait for `v0.2.86` |
| 65 | `kubectl -n pivotal delete secret pivotal-hub-client-cert && kubectl -n pivotal rollout restart deploy/trust-manager` | It enrols again on startup. The name is `HUB_SERVER_CERT_SECRET_NAME`; this environment renamed it from `hub-server-cert`, because it is a client certificate |
| 66 | `kubectl -n pivotal get secret pivotal-hub-client-cert -o jsonpath='{.data.tls\.key}' \| base64 -d \| head -1` | Expect `-----BEGIN PRIVATE KEY-----`, not `RSA PRIVATE KEY` |

Both web-outbound and the connectors re-read the mounted Secret every minute, so a later renewal
needs no restart.

## C. Connectors to the Hub's mutual-TLS host

**First, move the shared settings out of the shared block.** `global.commonFspiopEnv` is rendered
into every service **after** its own env, and Kubernetes keeps the last duplicate, so a value there
overrides any per-service one. Move these out and set them on **every** service that reads them —
internal values where nothing changes, the mutual-TLS values where it does:

| Setting | Why per service |
| --- | --- |
| `FSPIOP_PARTIES_URL`, `FSPIOP_QUOTES_URL`, `FSPIOP_TRANSFERS_URL` | Each service moves to the mutual-TLS host on its own day |
| `FSPIOP_USE_MUTUAL_TLS` | On web-inbound the same name means *serve* TLS. web-inbound requires the setting, so it must stay set there, to `false` |
| `FSPIOP_TLS_VERIFY_SERVER_CERT`, `FSPIOP_TLS_VERIFY_DOMAIN` | `true` only where it matters; the client-owned connector images are not known not to read them |

**An earlier attempt was reverted** for exactly this. It removed the URLs from the shared block and
set them only on the services being moved, leaving every other connector with no Hub address, and it
dropped `FSPIOP_USE_MUTUAL_TLS` from web-inbound, which then refuses to start. Render the chart before
and after and compare each Deployment's env — everything outside the services you meant to move
should be unchanged.

**Then, per connector:**

| Setting | Value |
| --- | --- |
| Hub URLs | `https://extapi.<domain>` |
| `FSPIOP_USE_MUTUAL_TLS` | `"true"` |
| `FSPIOP_MTLS_CLIENT_CERT_PATH`, `FSPIOP_MTLS_CLIENT_KEY_PATH` | `tls.crt` and `tls.key` of the mounted `pivotal-hub-client-cert` |
| `FSPIOP_MTLS_CA_PATH` | `hub-ca.pem` of the mounted `hub-ca-bundle` |
| `FSPIOP_OAUTH_TOKEN_URL` | the `dfsps` realm's token endpoint |
| `FSPIOP_OAUTH_CLIENT_ID` | in staging, `pivotal-trust-manager`, reused |
| `FSPIOP_OAUTH_CLIENT_SECRET` | `valueFrom.secretKeyRef` — in staging `trust-manager-mcm` / `MCM_CLIENT_SECRET` |

| # | Command | Purpose |
| --- | --- | --- |
| 67 | `kubectl -n pivotal logs deploy/<connector> \| grep -E "mutual TLS is enabled\|carry a Hub token"` | Both lines at startup |
| 68 | send money **to** that tenant; `kubectl -n istio-ingress-ext logs -l app=istio-external-ingress-gw --since=10m --prefix=false \| grep extapi.<domain>` | Its `PUT /parties`, `/quotes`, `/transfers` with `200`, from `okhttp` |

## D. web-outbound to the same host

The same settings as C, plus `FSPIOP_TLS_VERIFY_SERVER_CERT` and `FSPIOP_TLS_VERIFY_DOMAIN` set to
`"true"` **on web-outbound only**. Left `false`, it would authenticate itself to a host it never
checked.

Before switching, prove the host verifies strictly from a web-outbound pod: a `tls.connect` with the
`hub-ca-bundle` as `ca` and `rejectUnauthorized: true` should report `authorized: true`, then fail
with `CERTIFICATE_REQUIRED` because it sent no certificate — which is correct.

| # | Command | Purpose |
| --- | --- | --- |
| 69 | `kubectl -n pivotal logs deploy/web-outbound \| grep "Obtained a Hub access token"` | At the first Hub request after startup |
| 70 | send money from any tenant; the gateway log as in 68 | `GET /parties`, `POST /quotes`, `POST /transfers` with `202`, from `axios` |

A business rejection such as `4200 Payer limit error` still proves the transport: the Hub reaches
that check only after accepting the request.

## E. web-inbound's public host

**Why.** The Hub's egress, configured by doc 7 D, calls `web-inbound.<domain>` on 443 with the client
certificate Pivotal's CA signed, and verifies the answer against Pivotal's CA. That host did not
exist.

**Gitops:**

| Where | What |
| --- | --- |
| `apps/vault-pki-setup/pivotal-trust-pki.yaml` | Role `web-inbound-server` on `pki_hub_client` — server use only, that one name. Policy `pivotal-hub-server-sign`, added to `pivotal-trust-issuer-role`. ClusterIssuer `pivotal-hub-server-issuer` |
| `apps/vault-pki-setup/pivotal-web-inbound-hub-tls.yaml` | Certificate `pivotal-web-inbound-hub-tls` in the external gateway's namespace, renewed by cert-manager. Secret `pivotal-web-inbound-hub-tls-cacert` holding Pivotal's intermediate **and** root |
| `apps/pivotal/values.yaml` | Gateway `pivotal-hub-callback-gateway` (`MUTUAL`, with the `external-dns.alpha.kubernetes.io/target` annotation), VirtualService to `web-inbound:3201`, and a DENY policy admitting only `<cluster-public-ip>` |

**DNS is created for you.** external-dns watches VirtualServices and writes the Route 53 record,
pointing it at the Gateway's target annotation.

| # | Command | Purpose |
| --- | --- | --- |
| 71 | `kubectl -n istio-ingress-ext get certificate pivotal-web-inbound-hub-tls` | `READY=True` |
| 72 | `dig +short web-inbound.<domain>` | `<cluster-public-ip>` |
| 73 | `kubectl -n mojaloop exec deploy/moja-quoting-service -c quoting-service -- node -e 'fetch("http://web-inbound.<domain>/health").then(r=>console.log(r.status))'` | A Hub service, through its egress, over mutual TLS. Any status **web-inbound** answers proves the path. `/health` does not exist and its error filter turns that into `500` — which is a pass |

**Not obvious:**

- **Allow up to fifteen minutes for the name to resolve inside the cluster**, even after it resolves
  outside. The egress kept looking the name up from the moment doc 7 D ran, and the zone tells
  resolvers to cache a "not found" for 900 seconds. Meanwhile 73 gives `503 no healthy upstream`.
  Rule out a private hosted zone by comparing the zone's SOA from a pod and from outside.
- **The CA Secret needs the root, not only the intermediate.** Istio prefers the `-cacert` companion
  over the credential's own `ca.crt`, and cert-manager fills `ca.crt` with the issuing intermediate
  alone, which a verifier will not accept as an anchor.
- **Vault's `ca/pem` has no trailing newline.** Concatenating it with another PEM joins
  `-----END CERTIFICATE-----` and `-----BEGIN CERTIFICATE-----` on one line, and the bundle silently
  holds one unreadable certificate. Check it parses as two before committing.
- **Write certificate durations normalised** — `2160h0m0s`, not `2160h`. The API server stores the
  long form, and Argo CD otherwise reports the Certificate OutOfSync for ever.
- **The WAF on the external gateway runs in detection mode**, so its rules log but do not block.

Then repoint callbacks, tenant by tenant: doc 7, section E.

---

## Where this leaves things

- **Pivotal to the Hub:** web-outbound for every tenant, and the connectors moved in C, over mutual
  TLS with a token. Connectors on client-owned images stay on the internal path until their images
  support the same settings.
- **The Hub to Pivotal:** over mutual TLS for every tenant whose callbacks were repointed.
- **Planned:** trust-manager renewing the Hub's callback certificate and registering Pivotal's CA
  under the `pivotal` DFSP, replacing doc 7 D's manual steps.
