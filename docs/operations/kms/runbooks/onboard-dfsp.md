# Onboard a DFSP — KMS-Backed

Run **once per DFSP**, in this order. Five steps, roughly fifteen minutes plus whatever the DFSP
takes to send you their CSR.

The environment must already be set up — [`../setup/1-ca-ceremony.md`](../setup/1-ca-ceremony.md)
through [`../setup/3-turn-it-on-and-verify.md`](../setup/3-turn-it-on-and-verify.md).

> **Three of these steps are word-for-word the same in the HSM-backed profile**, which numbers them
> differently because it has an extra one. If you change any of them here, change
> [`../../hsm/runbooks/onboard-dfsp.md`](../../hsm/runbooks/onboard-dfsp.md) too.
>
> | here | there | |
> | --- | --- | --- |
> | 1 | 1 | Register in MCM — **identical** |
> | 2 | 2 | Access key — **identical** |
> | — | 3 | Create the crypto user — **exists only there** |
> | 3 | 4 | Onboard — differs: the key is generated in the HSM |
> | 4 | 5 | TLS client certificate — **identical** |
> | 5 | 6 | Connector — differs: two Vault paths instead of one |

---


## 1. Register the DFSP in MCM — do this FIRST

MCM is not exposed outside the cluster, so reach it with a port-forward:

```bash
kubectl -n mcm port-forward svc/mcm-connection-manager-api 3001:3001
```

Then, in another shell:

```bash
curl -s -X POST http://127.0.0.1:3001/api/dfsps \
  -H 'Content-Type: application/json' \
  -d '{"dfspId":"DemoDFSP3","name":"DemoDFSP3","monetaryZoneId":"USD","email":"ops@demodfsp3.example"}'
```

`email` is optional. **Straight quotes only** — a smart-quote from an editor or chat client is sent
as a literal byte and comes back as a JSON parse error that points nowhere near the cause.

> ⚠ **Do not skip this or do it later.** Onboarding does not do it, and getting the order wrong
> fails silently: onboarding reports success, the key is provisioned, and the problem only shows up
> as a `404 DFSP with id ... not found` in a background job.

IDs are **case-sensitive** everywhere — the database, the certificate check, and the Vault path.

## 2. Get the DFSP's access key

The DFSP generates this and sends you only the **public** half. For testing you can make both:

```bash
openssl genrsa -out DemoDFSP3-access.key 2048
openssl rsa -in DemoDFSP3-access.key -pubout -out DemoDFSP3-access.pub
```

This is what signs their `/secured/sendmoney` requests. It is not the FSPIOP signing key and not
the TLS client certificate — three different things.

## 3. Onboard the DFSP

Portal → **Participant → Onboard FSP**. Enter name, currencies, endpoint, and the access public key.

You are not asked for a signing key. One is generated into Vault during onboarding and never leaves.

Check the chain completed — it takes about a second:

```bash
kubectl -n pivotal logs deploy/web-pivotal   --tail=30 | grep -iE 'Provisioned|Announced'
kubectl -n pivotal logs deploy/trust-manager --tail=30 | grep -iE 'published|enabled'
```

Expect: provisioned into Vault → announced → published to MCM → `signing is now enabled`.

If the announcement is missing, the hourly background job publishes and enables it instead — later,
but not broken. It logs `was published to MCM but never switched on`.

Confirm the key exists:

```bash
vault kv get pivotal-kv/pivotal/jwskey/DemoDFSP3
```

## 4. Issue the DFSP's TLS client certificate

The DFSP generates a key and CSR and sends you **only the CSR**:

```bash
openssl req -new -newkey rsa:2048 -nodes \
  -keyout DemoDFSP3-client.key -out DemoDFSP3-client.csr \
  -subj "/CN=anything/O=anything"
```

The subject does not matter — Vault overwrites it with `CN=<fspId>`.

> **Tip:** on the first enrolment in a new environment, deliberately put a wrong name in the CSR.
> That proves the override is working instead of assuming it.

Enrol through Portal → **Participant → Certificates**, then check what came back:

```bash
openssl x509 -in <downloaded>.pem -noout -subject -issuer
```

`CN=DemoDFSP3` means the override is live. Anything else means the `pki_dfsp` issuing role is wrong —
go back to [`../setup/1-ca-ceremony.md`](../setup/1-ca-ceremony.md) — the issuing role is wrong.

Send the DFSP their certificate, and also the **DFSP root CA** so they can build a full chain.

## 5. Add a connector, if the DFSP needs one

Copy an existing connector block in the chart and change:

- `name`, `serviceAccount.name`, and `CONNECTOR_ID` (must match the fspId exactly)
- `SNOWFLAKE_NODE_ID` — **must be unique across every workload**; a collision shows up much later as
  duplicate identifiers
- `VAULT_ROLE`, plus a matching Vault policy and role so it reads **only its own** key path
- `BACKEND_ENDPOINT`, `CONNECTOR_ILP_SECRET`
- add the connector to `hubClientCertificates.workloads` so it gets a client certificate

Deploy the Vault roles **before** the workload. A pod that starts before its Vault role exists fails
to authenticate. Sync `vault-pki-app` before `pivotal`.

The connectors read `VAULT_URL`; the TypeScript services read `VAULT_ADDRESS`. Same idea, different
name, and nothing reconciles them.

> ⚠ **Check the connector image maps the environment variables.** The connector reads Java system
> properties, and its `docker-entrypoint.sh` is what converts environment variables into them. An
> image built before that mapping existed will start cleanly, find nothing configured, and silently
> never present a certificate. Verify on the running pod:
> ```bash
> kubectl -n pivotal exec <connector-pod> -c <connector> -- \
>   sh -c 'tr "\0" "\n" < /proc/1/cmdline | grep -c fspiopMtls'
> ```
> This must be **3 or more**. Zero means the image is too old, and no amount of configuration will
> fix it.

---

