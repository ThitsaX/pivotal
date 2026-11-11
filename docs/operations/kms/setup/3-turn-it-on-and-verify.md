# Turn It On and Verify — KMS-Backed

Every environment variable, the order to switch the four controls on in, how to prove each one is
actually working, and what goes wrong.

Run after [`2-services-and-gateways.md`](./2-services-and-gateways.md), and again whenever you need
to check an environment is still sound.

---

## Environment variables

Set these in the Pivotal chart values. They are shared by the services that talk to the Hub.

### Common (all services)

| Variable | Value | Notes |
| --- | --- | --- |
| `KEY_PROVIDER` | `vault-kv` | Reads signing keys from Vault. `database` is the legacy mode |
| `VAULT_ADDRESS` | `http://vault.vault.svc.cluster.local:8200` | TypeScript services |
| `VAULT_URL` | same value | **Java connectors use this name instead.** Nothing keeps them in sync |
| `VAULT_AUTH_METHOD` | `kubernetes` | Use `token` only for local development |
| `VAULT_ROLE` | per workload | Must match the Vault role created in [`2-services-and-gateways.md`](./2-services-and-gateways.md) step 1 |
| `VAULT_KV_MOUNT` | `pivotal-kv` | Must be a KV **v2** mount |
| `VAULT_JWS_KEY_PATH_PREFIX` | `pivotal/jwskey` | |
| `FSPIOP_SWITCH_ID` | `hub` | Must match the switch's ID exactly, including case |

### JWS

| Variable | Where | Value |
| --- | --- | --- |
| `FSPIOP_USE_JWS` | web-outbound, web-inbound, connectors | `true` |
| `FSPIOP_JWS_VERIFY_MODE` | web-inbound | `off`, `verify-if-present`, or `require` |

Move `FSPIOP_JWS_VERIFY_MODE` through the three values in order. `verify-if-present` accepts
unsigned traffic while checking anything that is signed, which lets you watch adoption before you
close the door with `require`.

### Hub-facing mTLS

| Variable | Where | Value |
| --- | --- | --- |
| `FSPIOP_USE_MUTUAL_TLS` | web-outbound, connectors | `true` |
| `FSPIOP_MTLS_CLIENT_CERT_PATH` | web-outbound, connectors | `/etc/pivotal/hub-client-tls/tls.crt` |
| `FSPIOP_MTLS_CLIENT_KEY_PATH` | web-outbound, connectors | `/etc/pivotal/hub-client-tls/tls.key` |
| `FSPIOP_MTLS_CA_PATH` | web-outbound, connectors | `/etc/pivotal/hub-server-ca/ca.crt` |
| `FSPIOP_TLS_VERIFY_SERVER_CERT` | web-outbound, connectors | `true` |
| `FSPIOP_TLS_VERIFY_DOMAIN` | web-outbound, connectors | `false` for the first run, then `true` |
| `FSPIOP_PARTIES_URL` | web-outbound, connectors | `https://extapi-mtls.<domain>` |
| `FSPIOP_QUOTES_URL` | web-outbound, connectors | `https://extapi-mtls.<domain>` |
| `FSPIOP_TRANSFERS_URL` | web-outbound, connectors | `https://extapi-mtls.<domain>` |

> ⚠ **`FSPIOP_USE_MUTUAL_TLS` must be `false` on web-inbound.** The same variable means the opposite
> thing there: on web-outbound and the connectors it means *present* a client certificate; on
> web-inbound it means *demand* one and serve TLS. Setting it globally makes web-inbound try to
> become a TLS server, fail to find a server certificate, and crash on startup.

Leave `FSPIOP_TLS_VERIFY_DOMAIN` off for the first run. A hostname mismatch then shows up as its own
distinct error rather than as an indistinguishable handshake failure. Turn it on once the chain
verifies.

### DFSP-facing mTLS

| Variable | Where | Value |
| --- | --- | --- |
| `DFSP_FACING_MTLS_MANDATORY` | web-outbound | `false` during migration, `true` when finished |

This flag only decides what happens to a caller who presents **no** certificate:

| Caller presents | `false` | `true` |
| --- | --- | --- |
| a good certificate | verified and admitted | verified and admitted |
| a bad certificate | **rejected** | **rejected** |
| nothing | admitted | rejected |

So an enrolled DFSP is bound to its certificate from its first request, whatever the flag says. The
flag is how you close the door behind the last DFSP to enrol.

> ⚠ **While this flag is `false`, the endpoint must not be reachable from outside your network
> perimeter.** An enrolled DFSP could otherwise simply stop presenting its certificate and still be
> admitted. That is a network control, not something the application can enforce.

> ⚠ **This service trusts a header it cannot verify.** It reads the client certificate details from
> `x-forwarded-client-cert`, which the gateway sets. It **must** sit behind a proxy configured to
> overwrite that header (Istio's `forwardClientCertDetails: SANITIZE_SET`). Exposed directly with
> the flag on, anyone who names a fingerprint is accepted.

---

## Turning it on

Turn on **one flag at a time**. They fail at different layers, and a single failed transfer will not
tell you which one broke.

| Order | Flag | Turn on when |
| --- | --- | --- |
| 1 | `FSPIOP_USE_JWS` | every tenant that will transact has a key in Vault and is published to MCM |
| 2 | `FSPIOP_JWS_VERIFY_MODE=verify-if-present` | you want to watch signatures arrive without rejecting anything |
| 3 | `DFSP_FACING_MTLS_MANDATORY` | every DFSP holds a certificate **and has been seen using it** |
| 4 | `FSPIOP_USE_MUTUAL_TLS` | the Hub endpoints are `https://` **and** the Hub gateway asks for a client certificate |
| 5 | `FSPIOP_JWS_VERIFY_MODE=require` | every peer is signing |

A tenant with no signing key logs a warning and sends **unsigned** — it does not fail. So step 1 is
safe to turn on early, but does not prove anything by itself.

---

## Verification

### 1. Check the DFSP-facing certificate rule

The important test uses two enrolled DFSPs, A and B. Run it **before** turning
`DFSP_FACING_MTLS_MANDATORY` on — every row below behaves identically either way, so you can prove
each DFSP's setup without risking anyone else.

| Certificate | `fspiop-source` header | Expected |
| --- | --- | --- |
| A | A | accepted |
| B | B | accepted |
| **B** | **A** | **rejected** |
| none | anything | refused at TLS |

The third row is the point. B's certificate is genuine and current, and it still cannot transact as
A. That is what makes a leaked access key insufficient on its own.

```bash
kubectl -n pivotal logs deploy/web-outbound --tail=50 | grep -i 'certificate belongs to'
```

You should see, for the third row:

```
Rejected: certificate belongs to 'B' but the request claims fspiop-source 'A'.
```

### 2. Check the Hub-facing gateway demands a certificate

From anywhere, with no client certificate:

```bash
curl -sv --max-time 10 https://extapi-mtls.<domain>/participants
```

Look for two things in the output:

```
* (304) (IN), TLS handshake, Request CERT (13):
* ... reason(1116)
```

`Request CERT` means the server asked for a certificate. Alert **116** is `certificate_required`.

Also check **which certificate came back**. It must be the one for `extapi-mtls`, not a wildcard
certificate. If a wildcard host is sharing the same gateway and matches first, no certificate would
be requested and the host would look enabled while enforcing nothing.

### 3. Check Pivotal can complete the handshake

From inside a web-outbound pod, using its own mounted certificate:

```bash
kubectl -n pivotal exec deploy/web-outbound -c web-outbound -- node -e '
const fs=require("fs"), https=require("https");
const req = https.request({
  host:"extapi-mtls.<domain>", port:443, path:"/participants/MSISDN/000000000",
  method:"GET", timeout:10000,
  cert:fs.readFileSync("/etc/pivotal/hub-client-tls/tls.crt"),
  key: fs.readFileSync("/etc/pivotal/hub-client-tls/tls.key"),
  ca:  fs.readFileSync("/etc/pivotal/hub-server-ca/ca.crt"),
}, res => {
  console.log("status " + res.statusCode + ", server verified: " + res.socket.authorized);
  process.exit(0);
});
req.on("error", e => { console.log("FAILED: " + e.code + " " + e.message); process.exit(1); });
req.end();'
```

A `400` about a missing FSPIOP header is a **pass** — it means the switch's application answered,
so the whole transport chain worked. `server verified: true` confirms Pivotal checked the switch's
certificate too.

### 4. Run a real transfer and check both directions

Send a transfer between two DFSPs that both have connectors.

**Check the outbound leg is signed.** In web-outbound's logs, find the `POST /quotes` and
`POST /transfers` requests and confirm the headers:

```bash
kubectl -n pivotal logs deploy/web-outbound -c web-outbound --since=1h | grep <transferId>
```

Each should carry `fspiop-signature`, plus matching `fspiop-uri`, `fspiop-http-method` and `date`
headers. `GET /parties` goes out **unsigned** and that is correct — there is no body to sign.

**Check both legs at the gateway:**

```bash
kubectl -n istio-ingress-ext logs -l istio=<gateway-label> --tail=4000 | grep <transferId>
```

You want to see requests with two different user agents against the mTLS host: `axios/...` is
web-outbound (the payer leg), `okhttp/...` is the Java connector (the payee callback leg).

**Best evidence — check the switch's own logs.** This is confirmation from the receiving party
rather than from your own services:

```bash
kubectl -n mojaloop logs deploy/moja-quoting-service --all-containers --since=1h | grep <transferId>
```

Look for `fspiop-signature` present on requests from **both** DFSP IDs.

---

## Common problems

| What you see | What it means |
| --- | --- |
| `certificate_required` / TLS alert 116 | The caller presented no client certificate. Check `FSPIOP_USE_MUTUAL_TLS`, the mounted cert paths, and — for a Java connector — the entrypoint mapping check in [`onboard-dfsp.md`](../runbooks/onboard-dfsp.md) step 5 |
| `ECONNRESET before secure TLS connection` | Either a ServiceEntry set to `MESH_INTERNAL`, or you are connecting past a `proxy_protocol` listener filter |
| `Empty issuer DN not allowed in X509Certificates` | The CA you gave the connectors cannot be parsed by Java. Use a different CA for the gateway's server certificate |
| `Mutual TLS is enabled but no server certificate is configured` | `FSPIOP_USE_MUTUAL_TLS=true` reached web-inbound. It must be `false` there |
| `404 DFSP with id ... not found` in a scheduler log | The DFSP was onboarded in Pivotal but never registered in MCM. Do [`onboard-dfsp.md`](../runbooks/onboard-dfsp.md) step 1 |
| `certificate belongs to X but the request claims fspiop-source Y` | Working as intended — that is the binding rule refusing an impersonation |
| Tenant never signs, no error anywhere | Usually a KV v1 mount, or a tenant whose key was never published to MCM |
| A quote fails on an empty `extensionList` | Unrelated to any of this. The certificate check runs first, so acceptance and rejection are still clean to observe |

---

## Final checklist

**One-time, per environment**

- [ ] Two separate KMS root keys created, ARNs recorded, key policies locked down
- [ ] `kms:Sign` alarm created **and tested**
- [ ] Both ceremonies run; `pki_dfsp` and `pki_hub_client` exist in Vault
- [ ] `use_csr_common_name` and `use_csr_sans` both read **false**
- [ ] Root CRL built and rehearsed for both domains
- [ ] Ceremony IAM role revoked, ceremony host terminated
- [ ] `pivotal-kv` mount is **version 2**
- [ ] One Vault policy per workload; connectors read only their own key path
- [ ] cert-manager issuing hub-client certificates, PKCS#8 encoding
- [ ] Pivotal registered in MCM; trust-manager credentials working
- [ ] DFSP-facing gateway on `MUTUAL` with its own credential name and the **intermediate** as anchor
- [ ] Hub-facing gateway host created, with a **separate** credential name and anchor
- [ ] Hub's server CA mounted as a file for Pivotal, parseable by Java

**Per DFSP**

- [ ] Registered in MCM **before** onboarding
- [ ] Access public key received and onboarded
- [ ] Signing key in Vault, published to MCM, signing enabled
- [ ] Client certificate issued, `CN` matches the fspId
- [ ] Root CA sent to the DFSP
- [ ] Connector deployed with a unique `SNOWFLAKE_NODE_ID` and its own Vault role
- [ ] Connector image verified to map the mTLS environment variables

**Before calling it done**

- [ ] The three-row certificate test passes, including the impersonation rejection
- [ ] A caller with no certificate is refused at TLS on both gateways
- [ ] A real transfer completes with signatures visible in the **switch's** logs from both directions

---

## Known gaps to expect

- **A quote may fail on the connector's empty `extensionList`**, unrelated to any of this. The
  certificate check runs before any quote, so acceptance and rejection are still clean to observe.
- **A participant onboarded before automatic provisioning existed has no signing key** and will not
  sign. Re-onboarding provisions one.

---

**Next:** the environment is ready. Onboard your first DFSP with [`../runbooks/onboard-dfsp.md`](../runbooks/onboard-dfsp.md).
