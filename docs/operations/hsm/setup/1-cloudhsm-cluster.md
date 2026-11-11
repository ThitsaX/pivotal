# CloudHSM Cluster Preparation

> ### ⚠ CloudHSM backend only
>
> The HSM-backed profile runs against either **CloudHSM** or **SoftHSM**. This document is the
> CloudHSM path. If you are standing the profile up against SoftHSM — typically in a development
> cluster — use [`1-softhsm-tokens.md`](./1-softhsm-tokens.md) instead and skip straight to
> [`3-services-and-gateways.md`](./3-services-and-gateways.md) afterwards.

Bringing up CloudHSM for the **HSM-backed** profile. Run this **once per environment**.

Onboarding a DFSP is a different document — that happens many times and is a runbook, not a setup
guide. This file stops at "the cluster is ready and the pods can reach it".

> **Verify the commands before you run them.** Flag names and port numbers change between CloudHSM
> SDK releases. The steps and the order are correct; check the exact syntax against the AWS docs for
> the SDK version you install.

## Where the scripts are

| Path | Used by |
| --- | --- |
| [`docs/operations/hsm/setup/scripts/ceremony-hsm.sh`](./scripts/ceremony-hsm.sh) | Section E, driven by [`2-ca-ceremony.md`](./2-ca-ceremony.md). Builds the certificates with OpenSSL through the PKCS#11 engine and has the HSM sign them. This is the only script the ceremony needs |
| — | Sections A to D and F are run by hand from a workstation with CloudHSM CLI access. They happen once and mostly involve AWS console or CLI steps that do not repay scripting |

Per-DFSP provisioning is **not** in this guide — that is a runbook, because it runs many times.

---

## Before you start

| You need | Why |
| --- | --- |
| An AWS account with the target VPC | CloudHSM lives in a VPC and is reached over private IP |
| The VPC and subnet IDs of the Kubernetes nodes | The HSMs must sit where the pods can reach them |
| Two people to act as custodians | No service holds a Crypto Officer credential, so people do |
| A signed-off cost figure | Two HSMs bill hourly, continuously. This is the largest recurring cost in the profile, so agree it before creating the cluster |

---

## A. Create the cluster

**Why:** nothing else in this guide can happen until the cluster exists and is activated. Activation
is also what creates your first Crypto Officer.

1. **Create the cluster** in the same VPC as the Kubernetes nodes. Choose subnets in the availability
   zones where the nodes run.

2. **Open the network path.** Add a security group rule allowing the node subnets to reach the HSM
   network interfaces on the CloudHSM client ports (2223–2225).

3. **Sign the cluster certificate.** AWS gives you a certificate request for the cluster. You sign it
   with a CA you create for this purpose, then upload the result.

   > This cluster CA is **not** `pki_dfsp` or `pki_hub_client`. It is a separate thing that only
   > proves a client is talking to the right HSM cluster. Store it separately and do not file it with
   > the two payment trust domains.

4. **Launch two HSMs**, in different availability zones if the node placement allows it. Two is the
   minimum for high availability, and also the minimum the KMS custom key store needs.

5. **Activate the cluster.** Log in as the starting user (`admin`, with a temporary password) and
   change the password. That change is what turns it into a Crypto Officer. **This is how the CO is
   created — there is no separate command for it.**

6. **Create the other Crypto Officers.** You need more than one if you want quorum in the next step.

7. **Turn on quorum for admin operations** — for example, two of three Crypto Officers must approve
   creating or deleting a user.

   **Why this matters:** it means no single person can create or delete a crypto user alone, and the
   hardware enforces it rather than a screen in the portal. Test that it works before relying on it.

---

## B. Create the crypto users

**Why:** a crypto user is the identity a process logs in as to sign. There is no IAM inside the HSM,
so these accounts are what separate one tenant from another.

Every crypto user this profile uses, and where each one is made:

| User | Owns | Purpose | Created |
| --- | --- | --- | --- |
| `cu_web_outbound` | nothing | Every tenant's key is shared to it, so it can sign as any payer | **here** |
| `kmsuser` | — | Required by the KMS custom key store in section C | **here** |
| `cu_ca_hub_root`, `cu_ca_dfsp_root` | one CA root each | One root apiece, so a compromised ceremony credential yields one trust domain rather than both | [`2-ca-ceremony.md`](./2-ca-ceremony.md) |
| `cu-<fspId>` | that tenant's signing key | One per DFSP. Ownership is conferred at creation and cannot be transferred, so generating a tenant's key as its own user is what isolates it | [`../runbooks/onboard-dfsp.md`](../runbooks/onboard-dfsp.md), once per DFSP |

> **Usernames take only `a-z`, `A-Z`, `0-9` and underscore.** A hyphen is rejected, and the
> message names the character rather than the field, so it reads like a problem with the command.
> Passwords are 8–32 characters; the device reports the limit in its slot info.

**Create the first two now.** The other two rows are listed so you can see the whole picture — do
not create them here. The ceremony users are made during the ceremony because their credentials are
handled differently from every other user in the table: they never go into Vault. The per-tenant
users are made one at a time as DFSPs join.

```bash
export CLOUDHSM_ROLE=admin
export CLOUDHSM_PIN=admin:<CO password>

cloudhsm-cli user create --username cu_web_outbound  --role crypto-user
cloudhsm-cli user create --username kmsuser          --role crypto-user
```

> **`kmsuser` stops being yours.** Once you hand it to KMS in section C, KMS takes ownership and
> resets its password. Do not use it for anything else.

That leaves one credential to store. `kmsuser` belongs to KMS from here on, so only
`cu_web_outbound` goes into Vault — readable by web-outbound and nothing else:

```bash
vault kv put pivotal-kv/pivotal/hsmcred/web-outbound \
  username=cu_web_outbound password=<password>
```

---

## C. Move the Vault seal to the custom key store

**Why:** the custom key store is the supported way to back a KMS key with your CloudHSM cluster. It
is used here for Vault's seal only, which keeps the metered KMS path off the signing path — signing
goes to the HSM directly over PKCS#11, where there is no per-request charge.

1. Create a **KMS custom key store** backed by the cluster. This is where `kmsuser` is consumed.
2. Create a **KMS key inside that key store**. Keep it separate from the CA root keys — different
   keys, different policies, different blast radius.
3. **Migrate Vault's seal** from plain KMS to that key.

> **Be clear about what this does and does not achieve.** The seal protects Vault's storage with a
> hardware-held key. It does **not** make signing a hardware operation — keys protected this way are
> still decrypted into memory and used in software. What puts signing inside the HSM is the signing
> path itself, not the seal. Do not let the two be reported as the same control.

---

## D. Prepare the client images

**Why:** every pod that signs talks to the HSM through a native library. That library is not in any
base image, so this is a packaging job that must be done before any application work is tested.

Each signing workload — web-outbound and every Java connector — needs three things:

| Item | What it is | How to supply it |
| --- | --- | --- |
| The PKCS#11 library | AWS's native `.so` | Install into the image |
| `cloudhsm-pkcs11.cfg` | Points at the cluster | ConfigMap |
| `customerCA.crt` | The cluster certificate from section A, step 3 | ConfigMap |

The credential itself is **not** in the image. It comes from Vault at runtime.

**Prove it from a pod before writing any code:**

```bash
kubectl exec -it <pod> -- cloudhsm-cli key list
```

If that works, the network, the security group, the cluster certificate and the library are all
correct. If it fails, fix it here — debugging it later through application code is much harder.

---

## E. CA roots — only at the production ceremony

**Why this is last, not first:** the CA roots serve mTLS, and re-rooting a live trust domain means
reissuing every certificate and redistributing trust anchors to every DFSP and the Hub operator. That
is a multi-week change involving other organisations.

**You are probably not migrating anything.** No production root exists yet — both domains still run
on rehearsal keys. So the production ceremony simply generates its roots in CloudHSM the first time,
and there is nothing to move.

**The ceremony is the next document.** [`2-ca-ceremony.md`](./2-ca-ceremony.md) is the complete
procedure — generating both root keypairs in CloudHSM, signing each Vault intermediate, and producing
the root CRLs — with [`scripts/ceremony-hsm.sh`](./scripts/ceremony-hsm.sh) to drive it.

Do not follow the KMS profile's ceremony for this. It is the same shape with a different signer, but
the crypto users, the key labels and the PKCS#11 calls are all different, and it will not produce
roots inside your cluster.

**What this section is responsible for** is only the prerequisite: the cluster from section A must be
activated, and the two ceremony crypto users must exist. Both are covered at the start of
`2-ca-ceremony.md`.

> Note that the CA roots are not what the cluster is for — the per-DFSP signing keys are. Putting the
> roots in it as well costs nothing once it exists and is worth doing, but it is not the reason the
> cluster is funded, and it is not on the critical path to signing.

---

## F. Monitoring and compliance

**Why:** two of these alarms are the only thing standing between an accepted risk and an undetected
compromise. They are not optional.

| Alarm | Threshold | Why |
| --- | --- | --- |
| **Crypto Officer operations** — `user create`, `user change-password` | Any occurrence outside a scheduled custodian session | A Crypto Officer can reset any crypto user's password, then sign as that tenant. That signature looks completely normal in the log, so this alarm is the only thing that catches it |
| **Vault reads of `hsmcred/*`** | Any read outside a provisioning or rotation window | trust-manager holds every tenant's crypto-user credential in order to generate keys, so it *can* sign as any tenant it has provisioned. This is the only signal that it is doing so. The credential cannot be taken away from it — generating requires the owner's credential — so detection is the control |
| CloudHSM audit logs → CloudWatch | — | Per-operation logging, retained where it cannot be altered. Without it the two alarms above have nothing to fire on, and an administrative action leaves no record |

Also before go-live:

- **A key destruction procedure.** Destroying a key in the HSM has no automated path today, and it is
  needed when a DFSP is offboarded. Until there is one, follow
  [`../runbooks/offboard-dfsp.md`](../runbooks/offboard-dfsp.md), which does it by hand.

- **A tested backup and restore.** CloudHSM backs the cluster up automatically, but a backup nobody
  has restored is not a backup. If a cluster is lost, every tenant's signing identity is lost with
  it, because the keys cannot be exported. Rehearse the restore before go-live, not after.

---

## Done when

- [ ] `cloudhsm-cli key list` succeeds from inside a pod
- [ ] Two HSMs are running and the cluster is activated
- [ ] Crypto Officer credentials are held by named people, and are in no service, env var or Vault
- [ ] `cu_web_outbound` exists and its credential is in Vault
- [ ] Vault is sealed against the custom key store
- [ ] Both alarms fire when tested deliberately
- [ ] A cluster restore has been performed at least once

---

**Next:** [`2-ca-ceremony.md`](./2-ca-ceremony.md) — root both certificate authorities in the cluster you just built.
