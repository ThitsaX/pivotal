# Vault Unseal

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 and later · Profile: both · Document version 1.0 (draft)

## Overview

Pivotal only needs Vault to be unsealed. How it is unsealed is part of Vault's own configuration, and
Pivotal works the same with any seal type. This page describes two seal types that need no cloud
service, sets up Transit auto-unseal, moves an existing Vault from Shamir to Transit, and recovers
when Vault cannot unseal.

| Seal | How Vault unseals | Needs |
|---|---|---|
| **Shamir** (Vault's default) | Key holders enter a threshold of key shares (for example 3 of 5) each time a Vault pod starts | Nothing extra |
| **Transit auto-unseal** | The main Vault asks a second, small **unseal Vault** to decrypt its root key, and unseals itself | A second Vault (Community Edition is enough) |

Other seals (a cloud KMS, or an HSM through Vault Enterprise) also work with Pivotal and are covered
by HashiCorp's documentation.

**What a sealed Vault does to Pivotal.** Pivotal's services keep their keys in memory, so a sealed
Vault does not stop traffic already flowing:

- web-outbound keeps the keys it has loaded if a refresh from Vault fails.
- A Java connector reads its key only at startup.

A Pivotal pod that **starts** while Vault is sealed cannot load its keys:

- web-outbound starts without them, and its requests go out unsigned until Vault is unsealed.
- A connector fails to start.

Certificate renewals and DFSP onboarding also wait for Vault. Auto-unseal shortens this window from
"until a key holder responds" to seconds.

**Choosing.**

- **Shamir with key holders** keeps the strongest separation: no single system can unseal Vault.
  Every Vault pod restart (node drains, upgrades) needs key holders.
- **Transit** removes that wait. The unseal Vault and its token can then unseal the main Vault, so
  they need the same protection as the main Vault.
- Keeping Shamir shares in Kubernetes Secrets, with a script that enters them, is convenient in
  non-production environments. Anyone who can read those Secrets can unseal Vault.

## Objective

Run the main Vault with Transit auto-unseal from a separate unseal Vault, and know how to recover it.

## Expected Outcome

- `vault status` on every main Vault pod shows `Seal Type transit` and `Recovery Seal Type shamir`.
- A restarted main Vault pod unseals itself.
- The recovery keys and the unseal Vault's key shares are held by named custodians.

## Prerequisites

### Mandatory

- Administrator access to the main Vault and to the unseal Vault.
- `kubectl` access to the main Vault's namespace (this page uses `vault`), and the main Vault's Helm
  values.
- An **unseal Vault**:

  | Item | Setting |
  |---|---|
  | Placement | Separate hosts or cluster from the main Vault, so both are not lost together |
  | Availability | 3 nodes, Raft storage. While it is down, the main Vault cannot unseal. |
  | Its own unseal | Shamir, with key shares held by named custodians. It rarely restarts. |
  | TLS | On, and reachable only from the main Vault |
  | Backups | Encrypted Raft snapshots, restore tested |

- For a migration: the current Shamir key shares of the main Vault, and a maintenance window.

### Optional

- A rehearsal of the migration and of its rollback on a test environment.

## Steps

In `zsh`, run `setopt interactivecomments` first: the command blocks contain `#` comments, which
interactive `zsh` otherwise passes to the command.

### Step 1. Create the Transit key and token on the unseal Vault

- **Purpose:** One key that the main Vault uses for its root key, and a token that can only use it.
- **Command or Configuration:** point the CLI at the **unseal Vault**, not the main Vault, with an
  administrator token for it.

  ```bash
  export VAULT_ADDR=https://<UNSEAL_VAULT_HOST>:8200
  export VAULT_CACERT=<UNSEAL_VAULT_CA_FILE>
  read -r -s VAULT_TOKEN; export VAULT_TOKEN     # the unseal Vault's administrator token

  vault secrets enable transit
  vault write -f transit/keys/autounseal

  vault policy write autounseal - <<EOF
  path "transit/encrypt/autounseal" { capabilities = ["update"] }
  path "transit/decrypt/autounseal" { capabilities = ["update"] }
  EOF

  vault token create -orphan -policy=autounseal -period=24h
  ```

- **Expected Result:** A token. The main Vault renews it while it runs.
- **If It Fails:** `permission denied`: use an administrator token on the unseal Vault.

> **Protect the Transit key.** Never delete it or raise its `min_decryption_version`. If you rotate it,
> keep every older version: the main Vault's data and its backups still need them. If the key is lost,
> the main Vault cannot be unsealed, and its recovery keys cannot make up for it.

### Step 2. Store the token and the unseal Vault's CA in the main Vault's namespace

- **Purpose:** The main Vault reads both at startup. The token, together with the main Vault's
  storage, is enough to unseal the main Vault, so few people may read it.
- **Command or Configuration:**

  ```bash
  kubectl -n vault create secret generic vault-unseal-token --from-literal=token=<TOKEN>
  kubectl -n vault create secret generic unseal-ca --from-file=ca.pem=<UNSEAL_VAULT_CA_FILE>
  ```

- **Expected Result:** Both Secrets exist. Restrict `get` on `vault-unseal-token` with RBAC.

### Step 3. Add the Transit seal to the main Vault's configuration

- **Purpose:** Tell the main Vault where to unseal from.
- **Command or Configuration:** in the HashiCorp Vault Helm chart's values. If your chart wraps the
  upstream chart, these keys sit under the wrapper's key (for example `vault.server`).

  ```yaml
  server:
    extraSecretEnvironmentVars:
      - envName: VAULT_TOKEN
        secretName: vault-unseal-token
        secretKey: token
    extraVolumes:
      - type: secret              # mounted at /vault/userconfig/unseal-ca/
        name: unseal-ca
    ha:
      config: |
        # ... your existing listener, storage and other blocks ...
        seal "transit" {
          address     = "https://<UNSEAL_VAULT_HOST>:8200"
          key_name    = "autounseal"
          mount_path  = "transit/"
          tls_ca_cert = "/vault/userconfig/unseal-ca/ca.pem"
        }
  ```

- **Expected Result:** The rendered StatefulSet has the `VAULT_TOKEN` variable, the `unseal-ca`
  volume and the `seal "transit"` block.
- **Note:** `VAULT_TOKEN` in the Vault container now holds the Transit token. When you run `vault`
  commands with `kubectl exec`, set `VAULT_TOKEN` to your own token on the command line.
- **Note:** If a script or sidecar enters Shamir shares automatically, remove it in this same change.
  It would interfere with the migration, and Transit makes it unnecessary.

### Step 4. Initialize or migrate the main Vault

Follow the part that fits your main Vault.

#### For a new Vault

- **Command or Configuration:** `vault operator init`, on one pod.
- **Expected Result:** Vault unseals itself and returns **recovery keys**, not unseal keys. Give them
  to named custodians. Recovery keys do not unseal Vault; they are needed for operations such as
  generating a new root token.

#### For an existing Vault on Shamir: migrate the seal

- **Purpose:** Move to Transit without re-initializing Vault. Pivotal, the CA and DFSPs are not
  affected.
- **Action:** Follow HashiCorp's seal migration procedure for your Vault version. For an HA cluster on
  Kubernetes it is:
  1. **Back up.** Take a snapshot of the main Vault's storage and test that it restores. Keep the
     current Shamir shares.
  2. **Apply the configuration** from Step 3. With the StatefulSet update strategy `OnDelete`, the
     running pods do not change yet.
  3. **Migrate each standby pod, one at a time.** Delete the pod, wait until it is running and sealed,
     and enter the threshold of shares on that pod directly:

     ```bash
     kubectl -n vault exec -it <STANDBY_POD> -- vault operator unseal -migrate
     ```

     Repeat the command until the threshold is reached.
  4. **Step down the active pod:** `vault operator step-down`, with your own `VAULT_TOKEN`. A migrated
     standby becomes active and completes the migration.
  5. **Confirm the migration finished** on the new active pod: `vault status` shows `Seal Type transit`
     and no `Seal Migration in Progress`.
  6. **Restart the former active pod.** Delete it. It starts with the new configuration and unseals
     itself.
  7. **Hand over.** The old Shamir shares are now the recovery keys. Give them to named custodians,
     then delete any Kubernetes Secrets that held them. Keep the pre-migration snapshot until the new
     setup has run for a while.
- **Expected Result:** Every pod unsealed, with `Seal Type transit`.
- **If It Fails:** A pod stays sealed after step 3: the unseal Vault is unreachable, or the token is
  wrong. Check the pod's log for the Transit error, fix it, and enter the shares again with `-migrate`.

## Verification

| Check | Command | Pass |
|---|---|---|
| Every pod uses Transit | `kubectl -n vault exec <POD> -- vault status`, for each pod | `Seal Type transit`, `Recovery Seal Type shamir`, `Sealed false` |
| A restart unseals itself | Delete one pod, then `vault status` on it | `Sealed false`, with no shares entered |
| Pivotal is unaffected | [End-to-end check](../../setup/common/end-to-end-check.md) | A transfer completes |

**Negative test:** with the unseal Vault stopped on a test environment, restart one main Vault pod. It
stays sealed. Start the unseal Vault again: the pod unseals without anyone entering keys.

## Troubleshooting

| Situation | Action |
|---|---|
| The unseal Vault is down or sealed | Restore it first if needed, then unseal it by hand with its Shamir shares. Restart the main Vault pods; they unseal themselves. |
| Main Vault pods keep restarting (`CrashLoopBackOff`) | A main Vault server that starts while the unseal Vault is unreachable or sealed exits with `error parsing Seal configuration`. Kubernetes retries with growing delays, up to 5 minutes. Once the unseal Vault is back, delete the pods so they start at once. |
| The Transit token expired (the main Vault could not renew it for longer than its 24-hour period, for example during a long outage) | Create a new token (Step 1), update the `vault-unseal-token` Secret, and restart the main Vault pods. |
| `permission denied` running `vault` in a main Vault pod | `VAULT_TOKEN` in the container is the Transit token. Pass your own token on the command line. |
| A Pivotal pod started while Vault was sealed | web-outbound picks up its keys within seconds once Vault is unsealed. Restart any connector that failed to start. |

See also [Vault](../../troubleshooting.md#vault).

## Rollback or Recovery

- **The main Vault's storage is lost:** restore its snapshot. It unseals with the same Transit key, so
  that key and its versions must still exist on the unseal Vault.
- **Undo the migration by migrating back (keeps all data).** The main Vault needs the unseal Vault to
  decrypt its root key one last time.
  1. Keep the unseal Vault running and unsealed, with its Transit key and the main Vault's token.
  2. Keep the `seal "transit"` block, `VAULT_TOKEN` and the CA volume, and add `disabled = "true"` to
     the seal block.
  3. Follow the same pod sequence as the migration in Step 4 (migrate each standby, step down the
     active pod, confirm, restart the former active pod), entering the threshold of **recovery keys**
     with `vault operator unseal -migrate` on each standby. Confirm `Seal Type shamir` and no
     `Seal Migration in Progress` on the new active pod. Unseal the restarted former active pod with
     the same keys, without `-migrate`.
  4. The former recovery keys are now the Shamir unseal keys. Remove the seal block, `VAULT_TOKEN` and
     the CA volume, then restart the pods one at a time and unseal each. Only then is the unseal Vault
     no longer needed.
- **Undo the migration from the snapshot (loses later writes).**
  1. Stop all main Vault servers (scale the StatefulSet to 0).
  2. Put back the original Shamir configuration, without the seal block and `VAULT_TOKEN`.
  3. Restore the pre-migration snapshot. A Consul snapshot restores all of Consul's data, not only
     Vault's: check what else stores data there first.
  4. Start Vault and unseal it with the original Shamir shares. Repeat any work written to Vault after
     the snapshot, such as DFSP onboarding.
- **The Transit key is lost:** the main Vault cannot be unsealed. Restore the unseal Vault from a
  backup that contains the key.

## References

- [Backup and recovery](backup-and-recovery.md)
- [Vault reference](../../reference/vault.md)
- HashiCorp Vault documentation: Transit seal, and seal migration
