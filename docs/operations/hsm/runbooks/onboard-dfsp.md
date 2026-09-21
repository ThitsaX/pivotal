# Onboard a DFSP — HSM-Backed

> **Written for the CloudHSM backend.** Crypto users, ownership and sharing are CloudHSM concepts.
> On the SoftHSM backend a tenant gets its own **token and PIN** instead, mounted only into that
> tenant's connector, and there is no sharing step — see
> [`../setup/1-softhsm-tokens.md`](../setup/1-softhsm-tokens.md). Everything else here is the same.

Run **once per DFSP**, in this order. Six steps: the five the KMS-backed profile has, plus creating
the tenant's crypto user before onboarding.

The environment must already be set up — [`../setup/1-cloudhsm-cluster.md`](../setup/1-cloudhsm-cluster.md)
through [`../setup/4-turn-it-on-and-verify.md`](../setup/4-turn-it-on-and-verify.md).

**One JWS key per DFSP, not one per component.** web-outbound has no key of its own — it signs as
whichever tenant is the payer, using that tenant's key shared to it. That tenant's connector signs
with the same key, as its owner.

> **Three of these steps are word-for-word the same in the KMS-backed profile**, which numbers them
> differently because it has one fewer. If you change any of them here, change
> [`../../kms/runbooks/onboard-dfsp.md`](../../kms/runbooks/onboard-dfsp.md) too.
>
> | here | there | |
> | --- | --- | --- |
> | 1 | 1 | Register in MCM — **identical** |
> | 2 | 2 | Access key — **identical** |
> | 3 | — | Create the crypto user — **exists only here** |
> | 4 | 3 | Onboard — differs: the key is generated in the HSM |
> | 5 | 4 | TLS client certificate — **identical** |
> | 6 | 5 | Connector — differs: two Vault paths instead of one |

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

## 3. Create the tenant's crypto user

**This step does not exist in the KMS-backed profile.** It is the one that needs a Crypto Officer
credential, and no service holds one — so a custodian runs it.

```bash
cd docs/operations/hsm/runbooks/scripts
./provision-hsm-tenant.sh DemoDFSP3
```

It prompts for the Crypto Officer password and a Vault token, creates `cu-DemoDFSP3`, and writes
`{username, password}` to `pivotal-kv/pivotal/hsmcred/DemoDFSP3`.

**The crypto user's password is generated at random inside the script and never shown.** It goes
straight to Vault. That is deliberate — it means the custodian who created the user cannot later log
in as that tenant and sign.

**The crypto user must exist before onboarding.** Generating a tenant's key requires authenticating
as that tenant's own crypto user, because CloudHSM confers ownership at creation and has no transfer
operation. So this is a prerequisite in the same way MCM registration is.

Batch it. Onboarding a DFSP has weeks of commercial lead time, so crypto users can be created in a
scheduled custodian session rather than on the day.

## 4. Onboard the DFSP

Portal → **Participant → Onboard FSP**. Enter name, currencies, endpoint, and the access public key.

You are not asked for a signing key. One is generated **inside CloudHSM** during onboarding, as the
crypto user from step 3, and shared with `cu-web-outbound`. No private key exists outside the HSM at
any point.

Check the chain completed — it takes about a second:

```bash
kubectl -n pivotal logs deploy/web-pivotal   --tail=30 | grep -iE 'Provisioned|Announced'
kubectl -n pivotal logs deploy/trust-manager --tail=30 | grep -iE 'published|enabled'
```

Expect: provisioned into Vault → announced → published to MCM → `signing is now enabled`.

If the announcement is missing, the hourly background job publishes and enables it instead — later,
but not broken. It logs `was published to MCM but never switched on`.

Confirm the keyRef was recorded, and that the key has the right owner:

```bash
vault kv get pivotal-kv/pivotal/keyref/DemoDFSP3

CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu-DemoDFSP3:<password> \
  cloudhsm-cli key list --filter attr.label=<the keyRef>
```

`key-owners` must be `[cu-DemoDFSP3]` and `shared-users` must include `cu-web-outbound`. **If the
owner is anything else, stop** — ownership is permanent, so the key has to be destroyed and
regenerated as the right crypto user.

> **Until `KEY_PROVIDER=pkcs11` is implemented**, onboarding cannot do this. Run
> `./provision-hsm-tenant.sh DemoDFSP3 --generate-key` instead, which performs trust-manager's steps
> by hand. Stop using that flag the day the provider ships — two things creating keys is how a tenant
> ends up with two, and the second is invisible until something signs with the wrong one.

## 5. Issue the DFSP's TLS client certificate

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
go back to [`../setup/2-ca-ceremony.md`](../setup/2-ca-ceremony.md) — the issuing role is wrong.

Send the DFSP their certificate, and also the **DFSP root CA** so they can build a full chain.

## 6. Add a connector, if the DFSP needs one

Copy an existing connector block in the chart and change:

- `name`, `serviceAccount.name`, and `CONNECTOR_ID` (must match the fspId exactly)
- `SNOWFLAKE_NODE_ID` — **must be unique across every workload**; a collision shows up much later as
  duplicate identifiers
- `VAULT_ROLE`, plus a matching Vault policy and role granting **exactly two paths, both its own**:
  `pivotal-kv/pivotal/hsmcred/<fspId>` and `pivotal-kv/pivotal/keyref/<fspId>`
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

