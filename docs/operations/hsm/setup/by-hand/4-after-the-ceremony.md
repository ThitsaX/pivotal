# 4. After the Ceremony

> Last of four. Runs after the ceremony, [`../2-ca-ceremony.md`](../2-ca-ceremony.md). See
> [`README.md`](./README.md) for the sequence.
>
> The generic runbook for this phase is
> [`../3-services-and-gateways.md`](../3-services-and-gateways.md); this is the record of doing
> it in a real environment.

Everything that needs a certificate authority to exist. Two steps here cannot be committed — the
Keycloak client and the MCM credential — and both are called out where they fall.

---

## 1. Immediately after the ceremony

### The engine is noisy, and it does not mean failure

The first real run against CloudHSM printed this at every OpenSSL invocation:

```
Workaround for OpenSSL 3.0.13 30 Jan 2024 enabled
Unable to enumerate private keys

thread '<unnamed>' panicked at .../tokio-1.50.0/src/runtime/handle.rs:90:25:
The Tokio context thread-local variable has been destroyed.
```

**Both are harmless, and every signature succeeded.** `Unable to enumerate private keys` is the
engine failing to *list* keys — CloudHSM restricts enumeration, consistent with it storing no
certificates and not behaving like a general token. The engine then resolves the key by its
explicit `pkcs11:object=...` URI, which is the only way the script ever addresses it.

The panic is inside the vendor library's Rust internals, tearing down a thread-local at process
exit — after the signing has completed. Once per invocation, always after the work.

Judge the run by the script's own lines instead: `root certificate:`, `intermediate signed by the
HSM-held root`, `issuing role restored:`, `root CRL signed:` and `chain verified: intermediate →
root`, for each domain.

### Get the output off the pod first

The working directory holds both root certificates, both intermediates and both CRLs, on an
ephemeral pod. Nothing in it is secret — but if the pod is deleted they are gone, and the only way
back is another ceremony.

| # | Command | Purpose |
| --- | --- | --- |
| 25 | `kubectl -n pivotal cp hsm-tools:/tmp/pivotal-ceremony-hsm/out ./ceremony-out` | Both domains' public material, off the ephemeral pod |

### Prove each mount can issue

The script verifies its own chain. This proves the thing the ceremony exists for: that Vault signs
a certificate which chains to a root held in hardware.

| # | Command | Purpose |
| --- | --- | --- |
| 26 | `openssl req -new -newkey rsa:2048 -nodes -keyout /tmp/probe.key -subj "/CN=probe.example" -out /tmp/probe.csr` | A request, as a DFSP would send |
| 27 | `vault write -field=certificate pki_dfsp/sign/dfsp-client csr=@/tmp/probe.csr common_name=probe.example > /tmp/probe.pem` | Vault signs it from the intermediate |
| 28 | `openssl verify -CAfile .../pki_dfsp/root.pem -untrusted .../pki_dfsp/inter.pem /tmp/probe.pem` | **`probe.pem: OK`** — leaf to intermediate to hardware-held root |
| 29 | Repeat 26–28 against `pki_hub_client/sign/pivotal-client` | The other trust domain |

Both mounts report the same AIA warning on `set-signed`. Not fatal, and not something the ceremony
can fix — but `config/urls` is worth setting on the DFSP-facing mount, since relying parties use
those fields to build chains and check revocation.

---

---

## 2. The PKI half

Only now, because the operator would otherwise retry forever against mounts that do not exist.
Appended to the same file:

- `PKISecretEngineRole` **pivotal-client** and **dfsp-client** — the issuing roles
- `Policy` **pivotal-hub-client-sign**, **pivotal-dfsp-sign**, **pivotal-dfsp-ca-read**
- `KubernetesAuthEngineRole` **pivotal-trust-issuer-role** (cert-manager) and
  **pivotal-trust-manager-role**
- `ClusterIssuer` **pivotal-hub-client-issuer**

**Edit the existing web-pivotal role; do not declare a second one.** It now carries two policies —
provisioning tenant keys and signing DFSP requests are unrelated jobs that happen to share a
service. Two files declaring one auth role would have two Applications fighting over it.

**There is deliberately no issuer for the DFSP-facing CA.** Those certificates are signed by
web-pivotal at enrolment from a CSR the DFSP submits; cert-manager has no part in it. A reference
deployment declares one anyway — unreferenced, and bound to a role that would return 403 if
anything used it.

### The ceremony already created these roles. The operator now takes them over.

That hand-off is where a mistake hides. Confirm against Vault, never against the CR:

```bash
vault read pki_dfsp/roles/dfsp-client
vault read pki_hub_client/roles/pivotal-client
```

**`use_csr_common_name` and `use_csr_sans` must both read `false`.** Kubernetes prunes a field a
CRD does not declare, silently, so a misspelling leaves the role on Vault's insecure default while
the CR still reports healthy. True there means a DFSP can name itself anything in its request —
which defeats the one check binding a certificate to the participant it claims to be.

Two changes are expected and harmless when the operator takes over:

- `allow_ip_sans` becomes `false` — intended; a client certificate has no business carrying one
- `key_usage` becomes empty — the CRD cannot express it, so the operator writes an empty list.
  An absent extension places no restriction, unlike a present one omitting `digitalSignature`,
  which would break client authentication. `clientAuth` comes from `clientFlag`.

Then prove the issuer authenticated, which is the whole cert-manager path in one line:

```bash
kubectl get clusterissuer pivotal-hub-client-issuer \
  -o 'custom-columns=NAME:.metadata.name,READY:.status.conditions[-1].status,MESSAGE:.status.conditions[-1].message'
```

`True` / `Vault verified`. Quote the `-o` argument — `zsh` reads `[-1]` as a glob and refuses the
command before `kubectl` sees it.

## 3. Publish Pivotal's Hub-facing root

trust-manager registers this with MCM so the Hub trusts every client certificate Pivotal presents.
Registering the root, rather than each leaf, is what lets leaves rotate with no Hub interaction.

A Secret in `apps/pivotal/secrets/`, listed in its `kustomization.yaml`, holding the ceremony's
`pki_hub_client/root.pem` under the key `ca.pem`.

**The root alone, not the chain.** The service reads one certificate and sends it; an intermediate
concatenated here is registered as though it were the authority.

Committed in the clear on purpose — a certificate carries no secret — with a comment saying so, or
the next reader assumes an encryption oversight. It is written rather than fetched because the
private half lives in a device with no export API, and nothing in the cluster can ask for it.

## 4. A Keycloak client for trust-manager — by hand

trust-manager authenticates to MCM with the client-credentials grant. `MCM_CLIENT_ID` and
`MCM_CLIENT_SECRET` are required settings, so it will not start without them.

In the Keycloak admin UI, in the realm MCM uses:

1. **Clients → Create client**, type `OpenID Connect`, Client ID `pivotal-trust-manager`
2. Capability config: **Client authentication ON** (confidential, so it gets a secret) and
   **Service accounts roles ON** (this is the client-credentials grant). Authorization, standard
   flow and direct access grants all OFF — there is no browser and no password here.
3. Save, then **Credentials → Client secret**.

Take the token endpoint from **Realm settings → Endpoints → OpenID Endpoint Configuration** rather
than assembling it by hand, and prove the client works before anything depends on it:

```bash
curl -s -d 'grant_type=client_credentials' \
     -d 'client_id=pivotal-trust-manager' \
     -d 'client_secret=<secret>' '<token_endpoint>' | head -c 200
```

An `access_token` means trust-manager will start. `unauthorized_client` means service accounts were
not enabled.

> **Check whether MCM verifies the token at all.** One environment had `oauth.enabled: false` in
> MCM's values, so the token is fetched and then ignored. The client is still required — the
> service really does call Keycloak at startup — but **no role mapping is needed**, which is
> otherwise the fiddly part. Where MCM does verify, the client needs whichever role it checks.

## 5. The MCM credential — by hand

A credential, not configuration, so it is not committed:

```bash
kubectl -n pivotal create secret generic trust-manager-mcm \
  --from-literal=MCM_CLIENT_SECRET='<the secret from F>'
```

Unlike the CA in E, this one genuinely is secret. Create it **before** enabling trust-manager, or
the pod crash-loops on a missing Secret.

## 6. Deploy trust-manager

Four changes in the chart:

- `templates/trust-manager-rbac.yaml` — its Roles and bindings
- `templates/apps.yaml` — added to the workload loop, with a database
- `templates/serviceaccounts.yaml` — its ServiceAccount
- `values.yaml` — the `trustManager` block

The RBAC is deliberately narrow: `get` and `patch` on **named** Secrets, never Secrets in general —
whoever can write these decides which authority is trusted. `create` cannot be restricted by name,
because the authorizer does not know the name until the object exists, so it is scoped to the
namespace.

The DFSP anchor needs a **second Role in the gateway's own namespace**, because Istio reads a
gateway's credentials only from where that gateway runs. `create` is not granted there: the Secret
should already exist beside the gateway, so a missing one fails visibly rather than letting this
service mint a trust anchor of its own. The Secret name is the gateway's `credentialName` with
`-cacert` appended.

### Its image may not exist on your usual branch

**trust-manager is not built by every branch's pipeline.** In one environment the workloads ran a
release from the default branch, which does not build trust-manager at all — only the branch
carrying the HSM work does. Check before choosing a tag:

```bash
git show <branch>:.github/workflows/publish.yml | grep -c trust-manager
```

Zero means no release from that branch contains the image. Moving one service to a different
branch's release puts two code generations against one database, which is worse than it sounds
where migrations are involved. Move the whole stack to one release instead, and accept that it
carries that branch's lineage.

### Then confirm

```bash
kubectl -n pivotal get pods -l app.kubernetes.io/component=trust-manager
kubectl -n pivotal logs deploy/trust-manager | head -40
```

Startup reads the CA file, logs into Vault as `pivotal-trust-manager-role`, and fetches an MCM
token. Each failure names its own cause; none of them degrade quietly, which is why all three
inputs must exist before it is enabled.

## 7. Register the participants in MCM

trust-manager addresses MCM per participant — `/dfsps/{dfspId}/enrollments/inbound` to enrol
Pivotal's own server certificate, `/dfsps/{dfspId}/jwscerts` to publish each tenant's public
signing key. A participant with no record in MCM's register produces:

```
404 POST /api/dfsps/pivotal/enrollments/inbound
{"message":"DFSP with id pivotal not found"}
```

**Pivotal itself first**, under whatever `PIVOTAL_DFSP_ID` names:

| # | Command | Purpose |
| --- | --- | --- |
| 30 | `wget -qO- --header='Content-Type: application/json' --post-data='{"dfspId":"pivotal","name":"pivotal","email":"<ops address>","monetaryZoneId":"<zone>"}' http://<mcm>:3001/api/dfsps` | Creates the record. Returns `{"id":"pivotal"}` |
| 31 | `wget -qO- http://<mcm>:3001/api/dfsps` | Lists the register, to confirm |

**Then every tenant Pivotal signs for.** Each needs its own record, or its key publish fails the
same way. The per-DFSP runbook covers this as part of onboarding —
[`../../runbooks/onboard-dfsp.md`](../../runbooks/onboard-dfsp.md) — so an environment with
existing participants has to backfill them once.

### Four things that cost time here

**`email` is required**, though MCM's swagger omits it. Without it the call fails with
`ValidationError: email is required`, which reads like the field is unknown rather than missing.

**`monetaryZoneId` is a single value, not a list**, and nothing in Pivotal reads it. One zone per
record; pick the primary one.

**The client pod may have no `curl`.** `wget` does the same job:
`wget -qO- --header='Content-Type: application/json' --post-data='...' <url>`. Note `-q` hides the
error body on failure, so confirm with a follow-up GET rather than trusting a silent return.

**Call MCM in-cluster.** The public host routes `/api/*` to an authorization proxy expecting a
browser session, so the same call from outside fails in a way that looks like an auth problem.

### Then make it retry

`HubServerCertEnroller` runs **every 24 hours**, so it will not pick up the new record on its own
in any useful timeframe. Every scheduler also runs once at startup, so restart rather than wait:

```bash
kubectl -n pivotal rollout restart deploy/trust-manager
```

Safe at any time — it is a background reconciler with nothing on the traffic path.

---

**Next:** [`../4-turn-it-on-and-verify.md`](../4-turn-it-on-and-verify.md) — every environment
variable, the order to switch the four controls on in, and how to prove each one works.

The trust material now exists and is published. Nothing yet *uses* it: signing and mutual TLS are
still off, and turning them on is a separate, reversible decision per leg.
