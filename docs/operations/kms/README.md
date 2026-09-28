# KMS-Backed Profile

Start here for the profile that has no HSM. This is an index — the documents it points at hold the
detail.

**What this profile is:** `KEY_PROVIDER=vault-kv`. Each DFSP's signing key is held in Vault and read
into process memory at startup, so signing happens in the service. The CA roots are non-exportable
AWS KMS keys. The alternative profile, `pkcs11`, generates keys inside a CloudHSM cluster and signs
in the hardware.

**This is the default profile.** Unless your deployment specifically requires dedicated hardware,
this is the one to set up.

**When not to use it.** Isolation here comes from per-tenant Vault path policy, not from a hardware
boundary, and AWS KMS is shared infrastructure rather than a dedicated device. Where a dedicated
hardware security module is required for private-key storage, use [`../hsm/`](../hsm/) instead. Where
it is not, this profile is the right answer and is considerably simpler to run — but choose it
knowingly rather than by leaving a setting at its default.

---

## Set up an environment — in order

| | Document | Run |
| --- | --- | --- |
| 1 | [`setup/1-ca-ceremony.md`](./setup/1-ca-ceremony.md) · [`setup/scripts/ceremony-kms.js`](./setup/scripts/ceremony-kms.js) | Both CA trust domains rooted in AWS KMS. Creates the root keys, signs both intermediates, and produces the root CRLs |
| 2 | [`setup/2-services-and-gateways.md`](./setup/2-services-and-gateways.md) | Vault auth roles per workload, cert-manager, MCM, trust-manager, and both gateways |
| 3 | [`setup/3-turn-it-on-and-verify.md`](./setup/3-turn-it-on-and-verify.md) | Every environment variable, the order to switch the four controls on in, and how to prove each one works |

The ceremony uses [`../shared/ceremony.py`](../shared/ceremony.py), which builds the X.509
certificates. It takes a signature from an external signer, so the same file serves this profile and
the HSM one.

**Rehearse the ceremony first** with [`../local/setup/ceremony.md`](../local/setup/ceremony.md),
which runs it against SoftHSM2 in Docker.

## Run again, every time

| Document | Triggered by |
| --- | --- |
| [`runbooks/onboard-dfsp.md`](./runbooks/onboard-dfsp.md) | A new DFSP joins the scheme |
| [`runbooks/rotate-signing-key.md`](./runbooks/rotate-signing-key.md) | Policy, or a suspected compromise |
| [`runbooks/offboard-dfsp.md`](./runbooks/offboard-dfsp.md) | A DFSP leaves |

**Onboarding here is five steps to the HSM profile's six.** Under `vault-kv` a tenant's signing key
is provisioned automatically during onboarding — trust-manager generates it, writes it to Vault,
publishes the public half to MCM and enables signing, in about a second. Nothing is created by hand,
so there is no crypto user to make first.

---

## Three things to know before you start

**The signing key is in process memory.** Every service that signs reads its tenant's key from Vault
at startup and holds it. Nothing in the infrastructure prevents a process that can read one key from
reading another — **per-tenant Vault path policy is the entire isolation boundary.** A policy that
grants more than one tenant's path silently removes it, and nothing will report that.

**Vault is read once at startup, never on the signing path.** Vault can be down and payments
continue. Keep it that way: anything that makes a signature wait on a Vault call turns an outage in
Vault into an outage in payments.

**The root keys cannot be recovered.** They are created inside AWS KMS with no export API, so there
is nothing to back up and nothing to restore. Everything issued underneath a root stops verifying if
that key is deleted. Keep root creation out of Terraform, Argo CD and any other reconcile loop.

---

## Known limitations — read before relying on any of this

**`KEY_PROVIDER=database` is a legacy path and must not be used.** It reads signing keys from a
plaintext column in MySQL. Every value ever written to that column has to be treated as compromised,
so a tenant found on it needs a new key, not a migration. The mode survives only so those old rows
can be found and retired.

**Rotating a signing key is manual**, and it has an ordering rule that will take a tenant offline if
you get it wrong — see [`runbooks/rotate-signing-key.md`](./runbooks/rotate-signing-key.md).

**Certificate renewal for DFSPs is manual, and nothing warns you.** Their client certificates last a
year, there is no expiry alerting, and no contact record — so a DFSP drops off the network a year
after enrolment with no warning to either side. Track the dates yourself until that is built.
