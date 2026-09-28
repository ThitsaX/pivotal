# 3. Prepare for the Ceremony

> Third of four. Runs after [`2-identities-and-vault.md`](./2-identities-and-vault.md) and before
> the ceremony itself, [`../2-ca-ceremony.md`](../2-ca-ceremony.md). See [`README.md`](./README.md)
> for the sequence.

Creating the two crypto users that will own the roots, and making one host able to run the
ceremony. Assumes the cluster is activated and the client pod from
[`1-verify-cluster.md`](./1-verify-cluster.md) still exists.

**Substitute throughout:** `<CO>` the Crypto Officer username, `<pw>` the relevant password.

---

## 1. Reach the device

| # | Command | Purpose |
| --- | --- | --- |
| 5 | `kubectl -n pivotal exec hsm-tools -- /opt/cloudhsm/bin/cloudhsm-cli user list` | Proves the network path, the certificate and the credential model in one call. **There is no `cluster info` subcommand** — an earlier draft of this document used one and it does not exist |
| 6 | `kubectl -n pivotal exec -it hsm-tools -- bash` | A shell on the pod. Everything in D and E runs there |

What `user list` returns is worth reading rather than skimming:

- **`mfa: []` and `quorum: []` on every account.** Single-factor, no quorum. The scripts assume
  both. Either could be turned on later and both would break them.
- **`kmsuser`** — a reserved account created when a cluster backs an AWS KMS custom key store.
  Its keys belong to that store. Leave it alone; the ceremony is unaffected.
- **More than one Crypto Officer** is normal. Any of them can create users.

## 2. Create the two ceremony crypto users

One root per trust domain, each owned by its own user. Ownership is conferred at creation and
cannot be transferred, so a single user owning both roots would put both trust domains behind one
password — and the point of separating them is that a DFSP's certificate must never be acceptable
to the Hub.

Usernames take only `a-z`, `A-Z`, `0-9` and underscore. A hyphen is rejected with a message naming
the character rather than the field.

| # | Command | Purpose |
| --- | --- | --- |
| 7 | `export PATH=$PATH:/opt/cloudhsm/bin` | So the commands below can be typed unqualified |
| 8 | `export CLOUDHSM_ROLE=admin`<br>`export CLOUDHSM_PIN=<CO>:<pw>` | Authorises user creation. The prompts below are for the accounts being *created* |
| 9 | `cloudhsm-cli user create --username cu_ca_hub_root --role crypto-user` | Will own the `pki_hub_client` root key |
| 10 | `cloudhsm-cli user create --username cu_ca_dfsp_root --role crypto-user` | Will own the `pki_dfsp` root key |
| 11 | `cloudhsm-cli user list` | Both present, both `crypto-user` |
| 12 | `unset CLOUDHSM_PIN CLOUDHSM_ROLE` | The Crypto Officer credential is otherwise left in the environment of a pod anyone with exec rights can enter |

**Record both passwords as they are set.** There is no way to read one back. A Crypto Officer can
only *reset* one, which changes it — and a reset after the ceremony leaves the root key owned by a
credential nobody holds. The key is not lost, but it becomes unusable, and recovering means a new
root distributed to every DFSP and to MCM.

**One password to each custodian, not both to one person.** Neither goes into Vault, an environment
variable, or any service. Every other crypto user in this system is delivered through Vault so a
pod can read it; these two are the exception, and the exception is the point.

## 3. Check the CLI before the ceremony depends on it

`--help` contacts nothing and changes nothing. Run it, because the script's first real step is a
key generation and a renamed flag would fail it with custodians already in the room.

| # | Command | Purpose |
| --- | --- | --- |
| 13 | `cloudhsm-cli key generate-asymmetric-pair rsa --help` | Confirms `--public-label`, `--private-label`, `--modulus-size-bits`, `--public-exponent` and `--private-attributes` |
| 14 | `cloudhsm-cli key list --help` | Confirms `--filter attr.NAME=VALUE`, which the ceremony's "already exists" guard uses |

Two options worth knowing, neither used by the current ceremony:

- **`--share-crypto-users`** on the generate command shares a private key at the moment it is
  created. PKCS#11 has no sharing operation, which is why provisioning through the library leaves
  sharing manual — this is the CLI path that would automate it.
- **`--manage-private-key-quorum-value`** and **`--use-private-key-quorum-value`** set quorum per
  key. A management quorum on the two roots would mean no single custodian could delete or alter
  one. Set at generation; deliberately not used on the first run, to keep it matching the rehearsal.

## 4. Prepare the ceremony host

The ceremony needs the CloudHSM client, OpenSSL with a PKCS#11 engine, and a route to Vault, all
on one host. Inside the cluster that is the client pod, which reaches Vault as a Service — so it
needs neither `kubectl` nor permission to exec into another namespace.

| # | Command | Purpose |
| --- | --- | --- |
| 15 | `apt-get install -y libengine-pkcs11-openssl` | The OpenSSL PKCS#11 engine. Without it `-engine pkcs11` fails, and the message points at the engine rather than at the missing package |
| 16 | `kubectl -n vault exec vault-0 -- vault version` | The server version, so the CLI installed next is close to it. **Read it rather than assume** — one environment returned 1.13.1 where a development cluster was on 2.x |
| 17 | `apt-get install -y wget unzip`<br>`wget -qO /tmp/vault.zip https://releases.hashicorp.com/vault/<VERSION>/vault_<VERSION>_linux_amd64.zip`<br>`unzip -o /tmp/vault.zip -d /usr/local/bin`<br>`vault version` | The Vault CLI, so the ceremony can talk to Vault directly instead of through `kubectl exec`. `<VERSION>` is what step 16 returned |
| 18 | `kubectl -n pivotal cp docs/operations/hsm/setup/scripts/ceremony-hsm.sh hsm-tools:/root/ceremony-hsm.sh`<br>`kubectl -n pivotal exec hsm-tools -- chmod +x /root/ceremony-hsm.sh`<br>`kubectl -n pivotal exec hsm-tools -- sha256sum /root/ceremony-hsm.sh` | The script itself. **Compare the hash against the source.** `kubectl cp` has truncated a file in this project before, twice, at different lengths — and a shell script cut short runs happily up to the cut, which here means a root key generated and nothing done with it |
| 19 | `kubectl -n vault get svc` | Which Service to point at. The chart publishes `vault` across all nodes and `vault-active` at the leader only |
| 20 | `VAULT_ADDR=http://vault-active.vault.svc.cluster.local:8200 vault status` | The pod can reach Vault, **and reaches the leader**. Confirm before ceremony day, not during it |

**Use `vault-active`, not `vault`.** The plain Service load-balances across nodes, so it will often
answer `HA Mode: standby`. Standbys forward writes to the leader and that normally works — but the
ceremony is a sequence of writes that must all land (disable the mount, enable it, generate the
intermediate, install the signed certificate, restore the role). A forwarding failure partway
leaves a root key generated and a mount half-built, with custodians waiting.

Read the rest of `vault status` too. A production Vault here reported **Consul storage, 5 key
shares, threshold 3**. If it restarts mid-ceremony, unsealing needs three shareholders — not just
the token you are holding.

If step 16 returns a server several releases behind, note it and move on — the ceremony needs
nothing recent, and the endpoints it calls have been stable for years. It is worth raising
separately, though: this Vault will hold both intermediate CA private keys, which makes its patch
level a security question rather than a housekeeping one.

## 5. Prove the Vault token before ceremony day

The ceremony disables and re-enables each mount, so the token needs `sys/mounts` permission, not
just write access to a path. A token that can write but not enable fails at the third step — with
one root key already generated.

`vault secrets list` does not prove this; it only shows read access. Run the operation itself
against a throwaway mount.

| # | Command | Purpose |
| --- | --- | --- |
| 21 | `export VAULT_ADDR=http://vault-active.vault.svc.cluster.local:8200`<br>`export VAULT_TOKEN=<token>` | The leader, and the token under test |
| 22 | `vault secrets enable -path=pki_ceremony_probe pki` | **The exact operation the ceremony performs first.** Succeeds or the token is insufficient |
| 23 | `vault secrets disable pki_ceremony_probe` | Removes the probe. Also proves the disable half, which the ceremony does before each enable |
| 24 | `unset VAULT_TOKEN` | The script prompts for the token itself, so it need not stay in the environment of a pod others can enter |

A least-privilege token, rather than root, needs at least:

```hcl
path "sys/mounts/pki_dfsp"       { capabilities = ["create", "update", "delete", "sudo"] }
path "sys/mounts/pki_hub_client" { capabilities = ["create", "update", "delete", "sudo"] }
path "pki_dfsp/*"                { capabilities = ["create", "read", "update", "delete", "list"] }
path "pki_hub_client/*"          { capabilities = ["create", "read", "update", "delete", "list"] }
```

---

## Then run the ceremony

[`../2-ca-ceremony.md`](../2-ca-ceremony.md), with both custodians present:

```bash
VAULT_ADDR=http://vault-active.vault.svc.cluster.local:8200 /root/ceremony-hsm.sh
```

It prompts for both crypto-user passwords and the Vault token — nothing is passed on the command
line, because a password in `argv` lands in shell history and in the process list. It refuses to
run if both domains name the same crypto user.

Then continue with [`4-after-the-ceremony.md`](./4-after-the-ceremony.md).
