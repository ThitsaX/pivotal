# Status — HSM-Backed Staging Rollout

> Where this environment actually is, as of **2026-09-29**. The numbered documents beside this one
> say *how*; this one says *how far*. Programme-wide status for the KMS-backed environment is
> [`../../../../internal/implementation/status.md`](../../../../internal/implementation/status.md) —
> a different environment, do not merge the two.

**Substitute throughout:** `<gitops>` the staging gitops repository, `<domain>` the staging domain,
`<HSM_IP>` the cluster's private address, `<CO>` the Crypto Officer username.

**Versions deployed:** pivotal `v0.2.85`, the ThitsaWallet connector image `v0.0.16`. The six
connectors on other images are untouched.

---

## The four legs

| Leg | State |
| --- | --- |
| DFSP-facing JWS | Done |
| Hub-facing JWS — web-outbound | **Done.** Signs through PKCS#11 as `cu_web_outbound` |
| Hub-facing JWS — connectors | DemoDFSP1 **on**; DemoDFSP2 configured, flag still `false` |
| DFSP-facing mTLS | **Done.** Certificate verified and bound to `fspiop-source`; impersonation refused |
| Hub-facing mTLS | **Hub side partly done** — see [`7-hub-side-for-hub-facing-mtls.md`](./7-hub-side-for-hub-facing-mtls.md). Hub CA re-rooted, extapi accepts DFSP tokens and Pivotal's address, the Hub holds a callback certificate (expires one year from signing). Open: web-inbound's public mTLS host, repointing callbacks, and Pivotal's own configuration. Pivotal still reaches the Hub on its internal addresses |

## What exists per tenant

| | DemoDFSP1 | DemoDFSP2 |
| --- | --- | --- |
| Crypto user | `cu_demodfsp1` | `cu_demodfsp2` |
| Key label / keyRef | `DemoDFSP1-jws-20260929090802` | `DemoDFSP2-jws-20260929101038` |
| Shared with `cu_web_outbound` | yes | yes |
| `participant_key` | `role='self'`, public key set | same |
| Published to MCM | yes | yes |
| `jws_sign_enabled` | `1` | `1` |
| Connector `FSPIOP_USE_JWS` | `true` | **`false`** |
| DFSP-facing client certificate | issued | **not confirmed** |

Both keys verified `extractable=false`, `never-extractable=true`, `sign=true`, owned by the tenant's
own crypto user. Ownership is conferred at creation and cannot be transferred — a key generated as
the wrong user is replaceable, not fixable.

---

## DFSP-facing mTLS — proven end to end

Verified 2026-09-29 against a real handshake, with a real certificate, including the impersonation
case. Envoy's own configuration for the DFSP-facing host:

| SNI | `require_client_certificate` | validation context |
| --- | --- | --- |
| the DFSP-facing host | `False` | **yes** |
| the Hub's mTLS host | `True` | yes |
| the shared wildcard | `False` | no |

`False` with a validation context is what `OPTIONAL_MUTUAL` produces: the handshake carries
`Request CERT`, an offered certificate is verified, and a caller offering none is still admitted.
Its own filter chain keyed on SNI, so sharing a `credentialName` with the wildcard does **not**
collapse them.

The binding rule was then demonstrated. A DemoDFSP1 certificate sent with
`fspiop-source: DemoDFSP2` was refused:

```
HTTP 401 — "The client certificate does not belong to the participant named in fspiop-source."
ERROR DfspCertificateGuard : Rejected: certificate belongs to 'DemoDFSP1' but the request
                             claims fspiop-source 'DemoDFSP2'.
```

So a genuine, current certificate cannot transact as another participant. That is the control this
leg exists for, and it works.

**Reading the absence of logs.** Only rejection logs. A caller presenting a valid certificate and a
caller presenting none are both silent, so a quiet log proves nothing either way — the mismatch
request is the only probe that distinguishes them. Nor can the client tell you: Postman drops a
configured certificate silently on a host mismatch or a missing passphrase, and `curl -v` prints
`(OUT) Certificate (11)` whether or not it has one, because it sends an empty record when
challenged.

**Certificate in use:** `CN=DemoDFSP1`, issued by `CN=Pivotal DFSP-Facing CA Intermediate` — the
same intermediate as the gateway's anchor — `clientAuth` EKU, valid to 2027-09-29.

## Open finding — two routes to the same endpoint

An internal host (`SIMPLE`) and the external host both route to `web-outbound:3200`. The internal one
can never carry a client certificate.

So while `DFSP_FACING_MTLS_MANDATORY` is false the internal host bypasses the certificate control
entirely, and when it is turned **on** every request through that host starts failing — no
`x-forwarded-client-cert` means no verified identity, which is exactly what the flag makes fatal.
Decide the internal route's fate before flipping that flag.

---

## Next steps, in order

1. **Flip `FSPIOP_USE_JWS: "true"` on the DemoDFSP2 connector.** One connector at a time, checking
   it loads its key from the device before moving on.
2. **Hub-facing mTLS** — the last leg, below. All the certificate material already exists.
3. `DFSP_FACING_MTLS_MANDATORY=true` once every caller is seen presenting a certificate **and** the
   internal route is resolved, since that route can never carry one.
4. Optional: issue DemoDFSP2 a client certificate, only needed to run the accepted/accepted rows of
   the three-row test rather than the rejection alone.

## Hub-facing mTLS — what it needs

The Hub already exposes a `MUTUAL` host on 443, so the endpoint is not the work. What is:

- A client certificate for Pivotal signed by whatever CA the Hub's gateway trusts — its
  `<credential>-cacert` companion decides that, and it was not readable from the switch's namespace
- That certificate and key mounted on web-outbound **and** each connector
- The Hub's server CA for verification — a `hub-ca-bundle` Secret already exists, likely this
- `FSPIOP_PARTIES_URL` / `QUOTES_URL` / `TRANSFERS_URL` repointed from the in-cluster `http://`
  Service addresses to the `https://` mTLS host
- `FSPIOP_USE_MUTUAL_TLS=true` on web-outbound and connectors — **never on web-inbound**, where the
  same name means "demand a certificate and serve TLS" and will crash it

Two things to know before scheduling it. Pivotal and the switch are in the **same cluster**, talking
over ClusterIP, so here this rehearses the mechanism rather than adding a control — it matters where
the Hub is a separate party across a real network. And one existing connector already does mTLS
through a `cc-keystore.p12` / `cc-truststore.p12` pair, not the PEM paths the current framework
reads, so there are two mechanisms to reconcile rather than one to extend.

---

## Gotchas found the hard way

**One HSM, not two.** This cluster has a single HSM; the ceremony recorded two. The client refuses to
create *or use* a key held by fewer than two, and the flag is named for creation while its help says
"during key use". Hence `CLOUDHSM_DISABLE_KEY_AVAILABILITY_CHECK`, staging only — these keys are
`extractable=false`, so one device holding them means losing it costs every key since the last
cluster backup. Production runs two HSMs and leaves this unset.

**The check lives in three separate configurations.** `configure-cli` covers key creation and
sharing, `configure-pkcs11` the TypeScript services, `configure-jce` the Java connectors. Disabling
one and not the others fails partway through.

**`FSPIOP_USE_JWS` must not sit in a shared env block.** A Java connector with signing enabled and no
Vault settings throws from `afterPropertiesSet` and never starts. It is set per service now.
Related: the shared FSPIOP env block is rendered **after** each service's own env, and Kubernetes
takes the last duplicate — so a value there silently overrides a per-service one, not the reverse.

**Connector defaults that bite.** `VAULT_KV_MOUNT` defaults to `secret`, not the Pivotal KV mount.
`KEY_PROVIDER` defaults to `vault-kv`, not `pkcs11`. The Java side reads `VAULT_URL`, not
`VAULT_ADDRESS`.

**`cloudhsm-cli` writes errors as JSON to stdout.** A call whose stdout is discarded dies under
`set -e` printing nothing. `provision-hsm-tenant.sh` now holds the output and prints it on failure.
Its verification listing needs `--verbose`, or it shows neither `key-owners` nor `shared-users`.

**`kubectl logs deploy/web-outbound` reads one replica.** There are two. A transfer handled by the
other looks like it never happened — loop over `get pods -o name` instead.

**MCM refuses to overwrite a divergent key, deliberately.** `JwsKeyPublishScheduler` logs
`MCM holds a different signing key ... Resolve this deliberately` and stops. DemoDFSP1 hit this
because a software key from an earlier `vault-kv` attempt was still registered. Resolved by POSTing
the correct key to `/dfsps/{id}/jwscerts` by hand — MCM accepts unauthenticated calls in-cluster.

**A VPN can take out the cluster API.** While the tunnel is up the API address is unreachable, the
same shape as the tunnel problem in the other environment.

---

## Uncommitted

`pivotal` (on `main`): `6-turn-on-hub-jws.md` — corrects the claim that a connector without Vault
settings sends unsigned, and records why the flag cannot live in a shared env block. Plus this file
and the README link to it.

Everything else is committed and synced.
