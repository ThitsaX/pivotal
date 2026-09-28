# CA Root Ceremony — HSM-Backed

> ### ⚠ CloudHSM backend only
>
> This puts the CA roots inside a CloudHSM cluster. **The SoftHSM path skips this document
> entirely** — a development cluster already has certificate authorities, and re-rooting them in
> SoftHSM would be churn for no gain. Go from [`1-softhsm-tokens.md`](./1-softhsm-tokens.md) to
> [`3-services-and-gateways.md`](./3-services-and-gateways.md).

Creating both certificate authorities with their roots inside CloudHSM. Run **once per
deployment**, after [`1-cloudhsm-cluster.md`](./1-cloudhsm-cluster.md).

This is a ceremony, not a deployment step. Follow it in order, with witnesses, in one sitting.

**Script:** [`scripts/ceremony-hsm.sh`](./scripts/ceremony-hsm.sh)

> **Verify before you run.** This script has not been run against a live CloudHSM cluster. The
> procedure is correct and matches the two working ceremonies it is modelled on, but check the
> CloudHSM CLI flags and the OpenSSL engine against your installed versions first. Rehearse with
> [`local/setup/ceremony.md`](../../local/setup/ceremony.md), which does the same thing against SoftHSM2.

---

## What you are building

Two **separate** certificate authorities. They must never share a root.

| | Hub-client CA | DFSP-facing CA |
| --- | --- | --- |
| Vault mount | `pki_hub_client` | `pki_dfsp` |
| Issues | client certificates to Pivotal's own workloads | client certificates to DFSPs |
| Trusted by | the Mojaloop Hub, via MCM | Pivotal's gateway only |
| Leaf lifetime | 90 days, renewed by cert-manager | 1 year, renewed by an operator |
| Root goes to | MCM, for every tenant | the gateway trust anchor, and to each DFSP |

**Why they stay separate:** one root for both would make a DFSP's client certificate acceptable to
the Hub. A DFSP could then transact as Pivotal. This is the single most important property of the
ceremony — everything else can be redone, this cannot.

## Where the root actually lives

CloudHSM is **not** a certificate authority. It cannot parse a request, build a certificate or
allocate a serial number. It signs a digest, and that is all.

So the script builds each certificate with OpenSSL and asks the HSM only to sign it:

```
 1. generate the root keypair      inside CloudHSM, non-extractable
 2. build the root certificate     OpenSSL, on the ceremony machine
 3. sign it                        CloudHSM, PKCS#11 C_Sign
 4. generate the intermediate      inside Vault — private half never leaves
 5. sign the intermediate's CSR    CloudHSM, PKCS#11 C_Sign
 6. install the signed result      back into the Vault mount
```

**This is why Vault needs no HSM integration and no Enterprise licence.** Vault never learns that an
HSM exists. It generates a certificate request and receives a signed certificate, which is the
ordinary externally-signed-intermediate pattern.

---

## Before you start

| Requirement | Why |
| --- | --- |
| The cluster is activated and reachable | Everything here depends on it — see `1-cloudhsm-cluster.md` |
| **Two** crypto users, one per trust domain | One root each, so a compromised credential yields one domain, not both |
| Two custodians present | These credentials are the roots of everything. Nobody should hold both alone |
| A Vault token with permission to manage PKI mounts | The script disables and re-enables each mount |
| `kubectl` access to the Vault pod | The intermediate is generated inside Vault |
| CloudHSM client, OpenSSL, and a PKCS#11 engine installed | On the machine running the ceremony |

**Create the two ceremony crypto users first**, as a Crypto Officer:

```bash
export CLOUDHSM_ROLE=admin
export CLOUDHSM_PIN=admin:<CO password>

cloudhsm-cli user create --username cu_ca_hub_root  --role crypto-user
cloudhsm-cli user create --username cu_ca_dfsp_root --role crypto-user
```

> **These two credentials never go into Vault, an environment variable, or any service.** Every other
> crypto user in this system is delivered through Vault so a pod can read it. These are the
> exception, and the exception is the point: the root keys must be unreachable from anything that
> runs. Custodians hold them, on paper or in a password manager, and nothing else does.

---

## Run it

```bash
cd docs/operations/hsm/setup/scripts
./ceremony-hsm.sh
```

It prompts for both crypto-user credentials and the Vault token. Nothing is passed on the command
line, because a password in `argv` lands in shell history and in the process list.

The script refuses to run if both domains are given the same crypto user.

**What it does, per domain:**

1. Generates the root keypair inside CloudHSM with `extractable=false`.
2. Builds and signs the self-signed root certificate.
3. Has Vault generate the intermediate keypair and a certificate request.
4. Signs that request with the root.
5. Installs the signed intermediate into the Vault mount.
6. Restores the issuing role.
7. Signs an empty root CRL.
8. Verifies the chain.

### Two steps that exist because they were learned the hard way

**Step 6 — restoring the issuing role.** Step 3 disables and re-enables the mount, which destroys
every role on it. A ceremony that does not put the role back leaves cert-manager failing with
"unknown role" — and it fails at the *next renewal*, weeks later, so nobody connects it to the
ceremony.

The DFSP role sets `use_csr_common_name=false`. Vault's `sign` endpoint otherwise takes the subject
from the submitted request, which would let a DFSP obtain a certificate naming any other
participant. That defeats the certificate-to-`FSPIOP-Source` binding entirely.

**Step 7 — signing a CRL now.** Revoking an intermediate needs a root-signed CRL, which means using
the root key again. Proving that works while the ceremony is open costs minutes. Discovering it does
not work during an incident costs much more.

---

## Verify

The script checks the chain itself, but check these by hand before declaring the ceremony complete.

**The roots are different keys:**

```bash
OUT="${CEREMONY_DIR:-${TMPDIR:-/tmp}/pivotal-ceremony-hsm}/out"

openssl x509 -in "$OUT/pki_hub_client/root.pem" -noout -pubkey | sha256sum
openssl x509 -in "$OUT/pki_dfsp/root.pem"       -noout -pubkey | sha256sum
```

Two different hashes. **If these match, stop** — the domains are merged and the ceremony must be
redone with separate keys.

**The private keys cannot be exported:**

```bash
CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_ca_hub_root:<password> \
  cloudhsm-cli key list --filter attr.label=pki_hub_client-root
```

`extractable` reads false. If it reads true, the key was created wrong and must be replaced —
extractability is set at creation and cannot be changed afterwards.

**Vault issues from the new chain:**

```bash
kubectl exec -n vault -i vault-0 -- sh -c \
  'export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=<token>;
   vault write pki_hub_client/issue/pivotal-client common_name=test.pivotal ttl=1h'
```

---

## After the ceremony

1. **Distribute `pki_dfsp/root.pem`** to the gateway trust anchor, and to each DFSP that wants it
   for their records.
2. **Register the `pki_hub_client` chain with MCM**, for every tenant. `trust-manager` reconciles
   this, but the first registration is worth confirming by hand.
3. **Store both crypto-user credentials** with their custodians. Record who holds which.
4. **Confirm the alarms fire.** Section F of `1-cloudhsm-cluster.md` — test them deliberately
   rather than assuming.
5. **Destroy the working directory.** It holds no private keys, but it does hold the Vault token you
   typed and the ceremony's intermediate files.

   ```bash
   rm -rf "${TMPDIR:-/tmp}/pivotal-ceremony-hsm"
   ```

6. **Record what happened** — date, who was present, which crypto user owns which root, the
   certificate fingerprints, and the root expiry dates. Keep it wherever this environment keeps
   its change records — it is the only evidence the root was created under dual control, and the
   only place the root expiry is written down.

---

## What must never happen

| Never | Why |
| --- | --- |
| Put a ceremony crypto-user credential in Vault | Any service that reads Vault could then use a root key |
| Use one crypto user for both roots | A single compromised credential would yield both trust domains |
| Re-run the ceremony on a live environment | It replaces both roots, so every certificate ever issued stops chaining and every DFSP must re-enrol |
| Let a root certificate expire unnoticed | Ten years is longer than anyone's tenure here. Put the expiry somewhere that will shout |

---

## Rotating an intermediate later

Not covered here, deliberately. Replacing an intermediate is a **runbook**, not a ceremony, and it is
a multi-stage change: new intermediate, reissue every leaf, distribute both anchors together, and
only then remove the old one. Revocation is the last step, never the first.

For a planned renewal you do not need a CRL at all — let the old intermediate expire. The CRL matters
only when you are rotating because a key was stolen.

The rotation procedure is not written yet — raise it before you need it, not during an incident.

---

**Next:** [`3-services-and-gateways.md`](./3-services-and-gateways.md) — wire the platform to the authorities you just created.
