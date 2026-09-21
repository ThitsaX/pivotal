# HSM-Backed Profile

Start here for anything involving CloudHSM. This is an index — the documents it points at hold the
detail.

**What this profile is:** `KEY_PROVIDER=pkcs11`. Each DFSP's signing key is generated inside
CloudHSM and never leaves it, so signing happens in the hardware and no private key is ever present
in a pod. The alternative profile, `vault-kv`, holds the key in Vault and signs in process.

**When to use it:** where a dedicated hardware security module is required for private-key storage.
Where it is not, use [`../kms/`](../kms/), which is simpler to run.

---

## Two backends — pick one first

This profile runs against either device. The signing path, the Vault paths and the `keyRef` model are
identical; what differs is the device and everything around setting it up.

| | Use it for | Start at |
| --- | --- | --- |
| **CloudHSM** | A deployment that requires dedicated hardware | [`setup/1-cloudhsm-cluster.md`](./setup/1-cloudhsm-cluster.md) |
| **SoftHSM** | A development cluster, to prove the code path before hardware exists | [`setup/1-softhsm-tokens.md`](./setup/1-softhsm-tokens.md) |

**A SoftHSM environment does not validate this profile.** It exercises the same PKCS#11 code path —
correct signatures, the Java provider resolving, keyRef lookup — but SoftHSM has no per-user key
ownership and no sharing, so the isolation this profile depends on is untested until a real cluster.
Read *What a clean local rehearsal does not prove* below before reporting it as working.

## Set up an environment — in order

| | Document | Backend | Run |
| --- | --- | --- | --- |
| 1 | [`setup/1-cloudhsm-cluster.md`](./setup/1-cloudhsm-cluster.md) | CloudHSM | The cluster, crypto users, the Vault seal, client images, alarms |
| 1 | [`setup/1-softhsm-tokens.md`](./setup/1-softhsm-tokens.md) | SoftHSM | The module, a token per tenant, PINs into Vault. **Then go straight to 3** |
| 2 | [`setup/2-ca-ceremony.md`](./setup/2-ca-ceremony.md) · [`setup/scripts/ceremony-hsm.sh`](./setup/scripts/ceremony-hsm.sh) | CloudHSM | Both CA trust domains rooted in CloudHSM |
| 3 | [`setup/3-services-and-gateways.md`](./setup/3-services-and-gateways.md) | both | Vault auth roles per workload, cert-manager, MCM, trust-manager, and both gateways |
| 4 | [`setup/4-turn-it-on-and-verify.md`](./setup/4-turn-it-on-and-verify.md) | both | Every environment variable, the order to switch the four controls on in, and how to prove each one works |

**The SoftHSM path skips step 2.** A development cluster already has certificate authorities, and
re-rooting them in SoftHSM would be churn for no gain.

**On the CloudHSM path, rehearse the ceremony first.**
[`../local/setup/ceremony.md`](../local/setup/ceremony.md) runs it against SoftHSM2 on a laptop,
through the same PKCS#11 calls — a real rehearsal rather than a simulation.

> **Two different things use SoftHSM, and they are easy to confuse.**
>
> | | Where | Rehearses |
> | --- | --- | --- |
> | [`../local/setup/ceremony.md`](../local/setup/ceremony.md) | a laptop | the **ceremony** — building and signing the CA certificates |
> | [`setup/1-softhsm-tokens.md`](./setup/1-softhsm-tokens.md) | a development cluster | the **signing path** — the services signing transactions through PKCS#11 |
>
> The first is a dry run before a real ceremony. The second is a working environment. Neither
> replaces a CloudHSM cluster.

## Run again, every time

| Document | Triggered by |
| --- | --- |
| [`runbooks/onboard-dfsp.md`](./runbooks/onboard-dfsp.md) · [`runbooks/scripts/provision-hsm-tenant.sh`](./runbooks/scripts/provision-hsm-tenant.sh) | A new DFSP joins the scheme |
| [`runbooks/rotate-signing-key.md`](./runbooks/rotate-signing-key.md) | Policy, or a suspected compromise |
| [`runbooks/offboard-dfsp.md`](./runbooks/offboard-dfsp.md) | A DFSP leaves |

**Onboarding is six steps here, five in the KMS profile.** The extra one is creating the tenant's
crypto user, which needs a Crypto Officer credential — and no service holds one, so a custodian does
it. Generating and sharing the key stay automated.

**One signing key per DFSP**, not one per component. web-outbound has no key of its own — it signs
as whichever tenant is the payer, using that tenant's key shared to it. That tenant's connector
signs with the same key, as its owner.

---

## Four things to know before you start

These shape how the whole profile behaves, and each one has caught someone out.

**Ownership in CloudHSM is permanent.** Whoever creates a key owns it, there is no transfer
operation, and an owner keeps the right to use it forever. That is why each tenant's key must be
generated *as that tenant's own crypto user* rather than by whatever is convenient — and why a key
generated under the wrong user has to be destroyed and remade rather than fixed.

**Crypto Officer credentials live with people, not services.** A Crypto Officer can create users and
reset any user's password, which means resetting a tenant's crypto user and signing as them. No
service holds that credential; named custodians do. Creating a crypto user is therefore the one
manual step in onboarding.

**Key references always change on rotation.** The key label is the reference the services look up,
and rotation always mints a new one. Never reuse a label — a stale reference lets a process sign
with a key its peers have never been told about.

**The CA roots are not what the cluster is for.** The signing keys are. Putting the roots in it as
well costs nothing once it exists, but that is a separate step with its own document and it happens
once.

---

## Known limitations — read before relying on any of this

**`KEY_PROVIDER=pkcs11` is not available yet.** Setting it fails at startup rather than falling back
to a software key — deliberately, because a silent downgrade in a deployment that chose hardware
custody would be worse than a refusal. Until it ships, run the services on `vault-kv` and use
`provision-hsm-tenant.sh --generate-key` to exercise the HSM path by hand.

**Destroying a key is a manual step.** There is no automated path for it, and it is needed when a
DFSP is offboarded — see [`runbooks/offboard-dfsp.md`](./runbooks/offboard-dfsp.md).

**`ceremony-hsm.sh` has never been run against a live cluster.** The procedure matches two ceremonies
that do work, but check the CloudHSM CLI flags and the OpenSSL engine against your installed
versions before the real ceremony, and rehearse locally first.

**The Vault-read alarm is not configured.** trust-manager reads every tenant's crypto-user credential
in order to generate keys, so a read of `hsmcred/*` outside a provisioning window is the signal that
it is being used to sign instead. Vault records the reads; nothing watches them yet. Set this up
before go-live — [`setup/1-cloudhsm-cluster.md`](./setup/1-cloudhsm-cluster.md) section F.

## What a clean local rehearsal does not prove

SoftHSM exercises the same PKCS#11 code path, so the ceremony and the certificate contents are
genuinely rehearsed. Two things are not:

- **The crypto-user model.** SoftHSM has one security-officer PIN and one user PIN per token. It has
  no per-user key ownership and no sharing, so none of the isolation this profile depends on can be
  tested locally.
- **Session behaviour** — the login model, how long a session lives, and whether a client recovers
  after an idle disconnect. These vary between devices, and CloudHSM will not match SoftHSM on any
  of them.

Budget an integration pass against a real cluster for both.
