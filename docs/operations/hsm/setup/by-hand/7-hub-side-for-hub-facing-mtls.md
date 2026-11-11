# 7. Hub Side of Hub-Facing mTLS

> Seventh. Needs [`4-after-the-ceremony.md`](./4-after-the-ceremony.md) — trust-manager running and
> the `pki_hub_client` CA in Vault. This records what was run **on the Hub** so that Pivotal can
> reach it over mutual TLS, and the Hub can call Pivotal back over it. Pivotal's own code and
> configuration for the leg are separate.

**Substitute throughout:** `<gitops>` the staging gitops repository, `<domain>` the staging domain,
`<cluster-public-ip>` the address the cluster's traffic leaves and re-enters by (measured in C).

**Everything here needs Hub access** — MCM, Vault, and the Hub's gitops applications.

| | What | Leaves you with |
| --- | --- | --- |
| A | Re-root the Hub CA | a Hub CA with a subject, extapi's certificate and Pivotal's client certificate under it |
| B | Oathkeeper rule for extapi | extapi accepting DFSP tokens |
| C | IP allowlist | extapi accepting connections from Pivotal |
| D | Callback leg: Pivotal CA, Hub CSR, onboard | the Hub holding a client certificate for calling Pivotal, and its egress configured |
| E | Repoint a tenant's callbacks | the Hub calling that tenant back over mutual TLS |

E needs web-inbound's public host to exist first. That host is Pivotal's configuration, so it is in
[`8-turn-on-hub-facing-mtls.md`](./8-turn-on-hub-facing-mtls.md), section E.

---

## A. Re-root the Hub CA

**Why.** The vault-config-operator generated the `pki-hub` root from a `PKISecretEngineConfig` with
no `commonName`, so the root's subject — and the issuer of everything it signed — is empty. OpenSSL
accepts that; **Java rejects it**, so the connectors cannot verify extapi. MCM never replaced it:
on startup it creates a Hub CA only when none exists.

**Gitops first:**

| Where | Change | Why |
| --- | --- | --- |
| `apps/mcm/values-mcm.yaml` | `api.env.INTERNAL_CA_TTL: "87600h"` | MCM's default is 8760h. Vault will not sign a leaf that outlives its issuer, so a one-year root starts refusing one-year client certificates within days |
| `apps/vault-pki-setup/vault-auth-config.yaml` | `commonName`, `organization`, `ou` on the `pki-hub` `PKISecretEngineConfig` | So a re-created config cannot bring an empty root back. It does **not** regenerate the existing root — the operator generates once (`status.generated: true`) |
| `apps/pivotal/values.yaml` | trust-manager `HUB_SERVER_CERT_SECRET_NAME: pivotal-hub-client-cert` | Optional rename — the certificate is a *client* certificate. A new name also forces a fresh enrolment |

Sync order matters: **`mcm` → re-root → `pivotal` → `vault-pki-app`.** If `pivotal` syncs before the
re-root, trust-manager enrols immediately under the old root and will not re-enrol until near expiry.

| # | Command | Purpose |
| --- | --- | --- |
| 40 | `kubectl -n mcm get secret vault-tls-cert -o jsonpath='{.data.ca\.crt}' \| base64 -d > old-hub-root.pem` | Keep the old root. Expect an empty subject |
| 41 | `kubectl -n mcm port-forward svc/mcm-connection-manager-api 3001:3001` | MCM's API. No login when `oauth.enabled: false` |
| 42 | `curl -sS -X POST http://localhost:3001/api/hub/ca -H 'Content-Type: application/json' -d '{"CN":"Hub Root CA","O":"Mojaloop","OU":"Infra"}'` | Deletes the `pki-hub` root and generates a new one. **Not reversible** |
| 43 | `kubectl -n mcm annotate secret vault-tls-cert cert-manager.io/issuer-name=force-renewal-triggered --overwrite` | Re-issues extapi's certificate. MCM is meant to do this itself — see below |
| 44 | `openssl s_client -connect extapi.<domain>:443 -servername extapi.<domain> </dev/null 2>/dev/null \| openssl x509 -noout -issuer` | Expect the new subject. Reflector copies the secret into `istio-ingress-ext` and `mojaloop` |
| 45 | `kubectl -n pivotal delete secret pivotal-hub-client-cert && kubectl -n pivotal rollout restart deploy/trust-manager` | Only if Pivotal enrolled before the re-root. Restarting also re-syncs `hub-ca-bundle` now rather than within the hour |
| 46 | `openssl verify -CAfile <hub-ca-bundle> <pivotal-hub-client-cert tls.crt>` | Expect `OK` |
| 47 | `kubectl -n argocd get pkisecretengineconfig pki-hub -o jsonpath='{.status.generated}'` | After syncing `vault-pki-app`. Expect `true` — the operator did not regenerate |

**Not obvious:**

- **MCM v3.7.4 does not re-issue extapi's certificate.** `POST /hub/ca` returns 200, but its log
  shows `Error renewing server cert: Required parameter name was null or undefined` — its
  Kubernetes client expects a different calling style. Step 43 does by hand what it fails to do.
  Repeat it after every re-root on this version.
- **cert-manager follows the new root on its own.** `vault-cluster-issuer` signs through
  `pki-hub/sign/server-cert-role`, which uses the mount's default issuer — the new root.
- **Nothing in Pivotal's transactions uses this root** while Pivotal reaches the Hub on its
  internal addresses, so re-rooting does not interrupt payments.

## B. Oathkeeper rule for extapi

**Why.** The `interop-jwt` AuthorizationPolicy sends every extapi request to Oathkeeper, which had
no rule for the host and answered `404 no rule matched` — so even a valid token was refused. The
global JWT authenticator trusts only the `hub-operators` realm; DFSP tokens come from `dfsps`.

**Gitops:** added to `apps/mojaloop/istio-config.yaml` (Argo CD application `moja`, auto-sync):

```yaml
apiVersion: oathkeeper.ory.sh/v1alpha1
kind: Rule
metadata:
  name: interop-extapi
  namespace: mojaloop
spec:
  match:
    url: <http|https>://extapi.<domain>/<.*>
    methods: [GET, POST, PUT, PATCH, DELETE]
  authenticators:
    - handler: jwt
      config:
        jwks_urls:
          - https://keycloak.<domain>/realms/dfsps/protocol/openid-connect/certs
        trusted_issuers:
          - https://keycloak.<domain>/realms/dfsps
  authorizer:
    handler: allow
  mutators:
    - handler: header
```

`PATCH` is for `fxTransfers`, `DELETE` for `/participants`. `allow` means any valid DFSP token
passes, whichever DFSP it belongs to — the JWS signature is what proves the sender.

| # | Command | Purpose |
| --- | --- | --- |
| 48 | `kubectl -n ory port-forward svc/oathkeeper-api 14456:4456`, then `curl -H 'Host: extapi.<domain>' -H 'X-Forwarded-Proto: https' -H "Authorization: Bearer $TOKEN" http://localhost:14456/decisions/parties/MSISDN/123` | Asks Oathkeeper directly, so the IP allowlist does not interfere. Expect `200` with a `dfsps` token, `401` without. Before the rule: `404` |

## C. IP allowlist

**Why.** `dfsp-whitelist-ingress-policy` DENYs extapi to every source outside its list. Pivotal's
calls go out and back in through the cluster's own public address, so that is the source the
gateway sees — not a pod or node address.

The policy is rendered by MCM's Vault agent from `apps/mcm/configmaps/vault-config-configmap.hcl`:
the IPs registered in MCM, then a hard-coded tail. **MCM's `/onboard` could not add the address**:
it first builds the DFSP's callback bundle, which needs a signed outbound certificate, and no DFSP
had one — so it fails before writing the allowlist.

| # | Command | Purpose |
| --- | --- | --- |
| 49 | From a web-outbound pod, request `https://pivotal.<domain>/<marker>`; then `kubectl -n istio-ingress-ext logs <gateway pod> \| grep <marker>` | The access log shows the source address. That is `<cluster-public-ip>` |
| — | Gitops: append `<cluster-public-ip>/32` to the hard-coded tail of `notRemoteIpBlocks` in the template | Sync `mcm` |
| 50 | `kubectl -n mcm rollout restart deploy/mcm-connection-manager-api`, then read `.spec.rules[0].from[0].source.notRemoteIpBlocks` of the policy | The agent re-renders on start. Expect the address in the list |

The address is shared by everything in the cluster, so this lets any in-cluster caller past the
IP check. mTLS and the token still apply. The tail's existing `10.110.0.0/16` does not match this
cluster's nodes and looks inherited from another environment.

## D. Callback leg: Pivotal CA, Hub CSR, onboard

**Why.** For the Hub to call web-inbound over mTLS, MCM must hold Pivotal's CA (so the Hub can
verify web-inbound) and a signed client certificate for the Hub (so web-inbound can verify the Hub).
**Both are issued by Pivotal's CA** — the Hub CA plays no part in this direction.

MCM creates one outbound CSR per DFSP automatically, with an **empty subject**, and never renews
the result. Only the `pivotal` DFSP's is used: every tenant's callbacks go to the same web-inbound.

**Gitops first — keep `pivotal` out of the ledger.** `/onboard` renders a TTK job that registers the
DFSP as a Hub participant. Pivotal is not one. In `vault-config-configmap.hcl`, wrap the TTK
ConfigMap and Job in `{{ if ne .Data.host "pivotal" }} … {{ end }}`, sync `mcm`, and restart MCM.
Check the agent loaded it before onboarding:

```bash
kubectl -n mcm exec <mcm pod> -c vault-agent -- grep -c 'if ne .Data.host "pivotal"' /vault/configs/config.hcl   # 1
```

Use **`printf '%s'`, not `echo`**, for any variable holding JSON or PEM: zsh's `echo` expands the
`\n` inside the JSON, and `jq` then refuses it.

| # | Command | Purpose |
| --- | --- | --- |
| 51 | `kubectl -n vault port-forward svc/vault-active 8200:8200`; `export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=…` | `vault-active` always reaches the leader |
| 52 | `vault write pki_hub_client/roles/hub-callback-client allowed_domains=web-inbound.<domain> allow_bare_domains=true allow_subdomains=false client_flag=true server_flag=false use_csr_common_name=false use_csr_sans=false key_type=any ttl=8760h max_ttl=8760h organization=Mojaloop` | A role that issues this one client certificate. `use_csr_common_name=false` because MCM's CSR has no subject |
| 53 | `jq -n --arg r "$ROOT" --arg i "$INT" '{rootCertificate:$r, intermediateChain:$i}' \| curl -sS -X POST $MCM/dfsps/pivotal/ca -H 'Content-Type: application/json' -d @-` | `$ROOT` from the `pivotal-hub-client-ca` Secret, `$INT` from `vault read -field=certificate pki_hub_client/cert/ca`. **Include the intermediate** — it is what signs. Expect `VALID` |
| 54 | `curl -sS -X POST $MCM/dfsps/pivotal/endpoints/egress -H 'Content-Type: application/json' -d '{"ipList":[{"description":"Pivotal egress","address":"<cluster-public-ip>/32","ports":["443"]}]}'` | `/onboard` rewrites the allowlist from MCM's registry; registering keeps the two consistent |
| 55 | `EN=$(curl -sS $MCM/dfsps/pivotal/enrollments/outbound \| jq '[.[]\|select(.state=="CSR_LOADED")]\|max_by(.id)')`; `ENID=$(printf '%s' "$EN" \| jq -r .id)`; `printf '%s' "$EN" \| jq -r .csr > hub.csr` | The Hub's pending CSR. Expect an empty subject |
| 56 | `vault write -field=certificate pki_hub_client/sign/hub-callback-client csr=@hub.csr common_name=web-inbound.<domain> ttl=8760h > hub-client.crt` | The CN is web-inbound's public host: MCM uses it as the callback address. Expect `TLS Web Client Authentication` |
| 57 | `jq -n --rawfile c hub-client.crt '{certificate:$c}' \| curl -sS -X POST $MCM/dfsps/pivotal/enrollments/outbound/$ENID/certificate -H 'Content-Type: application/json' -d @-` | Upload the leaf only — MCM appends the chain. Expect `CERT_SIGNED`, `VALID` |
| 58 | `curl -sS -X POST $MCM/dfsps/pivotal/onboard` | Expect `{}` |
| 59 | `kubectl -n mojaloop get serviceentry,gateway,virtualservice,destinationrule \| grep -i pivotal`; `kubectl -n egress-gateway get secret pivotal-clientcert-tls`; `kubectl -n mojaloop get job pivotal-onboard-dfsp` | Expect the five Istio objects, the Secret in both `mojaloop` and `egress-gateway`, and **no** Job |

Delete `hub.csr` and `hub-client.crt` afterwards and `unset VAULT_TOKEN`.

**Not obvious:**

- **Onboarding changes no traffic by itself.** The egress path applies only to calls addressed to
  `web-inbound.<domain>`, and none are until web-inbound's public host exists (doc 8, E) and a
  tenant's callbacks are repointed (E below). Until then the egress gateway answers `503 no healthy
  upstream` for that name, because it does not resolve.
- **The certificate expires a year from signing and MCM will not renew it.** Renewal is steps 55–58
  again — a new CSR from `POST $MCM/dfsps/pivotal/enrollments/outbound/csr` — and `/onboard` picks
  the newest signed certificate. Automating this in trust-manager is open.
- **Every `/onboard` rewrites the IP allowlist** from MCM's registry, which is why step 54 exists.

---

## E. Repoint a tenant's callbacks

**Why.** The Hub calls each participant back at the endpoints the ledger holds for it, and they
pointed at web-inbound's internal Service. The egress configuration from D applies only to calls
addressed to `web-inbound.<domain>`; anything else bypasses it and arrives as plain HTTP.

**Only after** web-inbound's public host answers through the Hub's egress — doc 8, section E. Then
one tenant at a time, each followed by a test transfer.

The script changes the base of every endpoint and keeps each path and its `{{placeholders}}`. The
new base is plain `http` with no port: the egress gateway upgrades it to mutual TLS, so an `https`
URL would bypass that and fail.

| # | Command | Purpose |
| --- | --- | --- |
| 60 | `kubectl -n mojaloop port-forward svc/moja-centralledger-service 3001:80` | The central ledger's admin API |
| 61 | `../scripts/repoint-callbacks.sh <fspId> http://web-inbound.pivotal.svc.cluster.local:3201 http://web-inbound.<domain>` | Dry run. Check every `->` line: one mistyped character points the tenant's callbacks at a host that does not exist |
| 62 | the same with `--apply` | Writes each endpoint, then reads them back. Expect `0 endpoints still start with ...; 0 writes failed` |
| 63 | the same with the two bases swapped, and `--apply` | Rollback. Immediate apart from the cache below |

**Not obvious:**

- **The Hub caches participant endpoints.** Allow about five minutes before the first test
  transfer, in either direction.
- **Repointing is per tenant and optional.** A tenant left on the internal address keeps working;
  the Hub chooses the callback per participant, so a transfer between a repointed tenant and one
  that is not uses each side's own path.
- **The dry run makes one request** — a single `Handling connection` line from the port-forward.
  `--apply` makes one per endpoint, 26 per tenant.

---

## What remains on the Hub side

- **Repoint the remaining tenants** with E, one at a time.
- **Renew the Hub's callback certificate before it expires** — a year from signing. MCM will not:
  steps 55–58 again, with a new CSR from `POST $MCM/dfsps/pivotal/enrollments/outbound/csr`, then
  `/onboard`. Automating this in trust-manager is planned.
- The role from step 52 is now also declared in `apps/vault-pki-setup/pivotal-trust-pki.yaml`
  (`hub-callback-client`), so a rebuilt Vault gets it back. Note the declared `keyType` is `rsa`,
  not the hand-made `any`; MCM's CSRs are RSA 2048, so nothing changes in practice.
