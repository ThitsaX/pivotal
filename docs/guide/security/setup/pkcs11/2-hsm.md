# Prepare the CloudHSM Cluster

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

This procedure creates and activates the AWS CloudHSM cluster, and creates the one crypto user that
every Pivotal environment needs before the CA ceremony: `cu_web_outbound`, the user web-outbound
signs as. Run it **once per environment**.

The crypto users for the two root CAs are created in [Run the CA ceremony](3-ca-ceremony.md). The
crypto user for each DFSP is created by a custodian with `provision-hsm-tenant.sh`, before that DFSP is
onboarded ([Onboard a DFSP](../../runbooks/pkcs11/onboard-dfsp.md)).

## Objective

Have an activated CloudHSM cluster with two HSMs, Crypto Officer credentials held by custodians, and
the `cu_web_outbound` crypto user with its credential stored in Vault.

## Expected Outcome

- `cloudhsm-cli cluster hsm-info` lists two HSMs.
- `cloudhsm-cli user list` shows your Crypto Officer(s) and `cu_web_outbound`.
- Vault holds `pivotal-kv/pivotal/hsmcred/web-outbound` with the fields `username` and `password`.
- No Crypto Officer credential is stored in Vault, a Kubernetes Secret, an environment variable or
  a file.

## Prerequisites

### Mandatory

| Item | Notes |
|---|---|
| Everything in [Prerequisites](1-prerequisites.md) | |
| An AWS administrator for Steps 1–4 | Steps 1–4 are done in AWS, not in Kubernetes |
| Two custodians present from Step 6 | Activation creates the first Crypto Officer |
| A Vault token that can enable a secrets engine and write to it | Step 8 |

### Optional

| Item | Notes |
|---|---|
| Quorum for Crypto Officer operations | Set it up after Step 7, following AWS's CloudHSM documentation. Test it before you rely on it. |

## Steps

### Step 1. Create the cluster

- **Purpose:** nothing else in this profile can start until the cluster exists.
- **Action:** in the AWS console or CLI, create a CloudHSM cluster in the **same VPC as the
  Kubernetes nodes**. Choose subnets in the availability zones where the nodes run.
- **Expected Result:** the cluster is in state `UNINITIALIZED`.

### Step 2. Open the network path

- **Purpose:** the pods must reach the HSMs.
- **Action:** add a rule to the cluster's security group that allows the Kubernetes node subnets to
  reach it on TCP ports **2223–2225**.
- **Expected Result:** the rule is listed on the cluster's security group.
- **If It Fails:** without this rule, every CloudHSM command from the cluster times out.

### Step 3. Initialise the cluster with its own CA

- **Purpose:** AWS gives the cluster a certificate signing request. You sign it with a CA you create
  for this cluster. Clients then use that CA certificate, `customerCA.crt`, to check that they
  reached your cluster and not another one.
- **Action:** download the cluster's CSR from AWS, then on a secure workstation:

  ```bash
  openssl genrsa -aes256 -out customerCA.key 2048
  openssl req -new -x509 -days 3652 -key customerCA.key -out customerCA.crt
  openssl x509 -req -days 3652 -in <CLUSTER_ID>_ClusterCsr.csr \
    -CA customerCA.crt -CAkey customerCA.key -CAcreateserial \
    -out <CLUSTER_ID>_CustomerHsmCertificate.crt
  ```

  Upload `<CLUSTER_ID>_CustomerHsmCertificate.crt` and `customerCA.crt` to initialise the cluster.
- **Expected Result:** the cluster moves to state `INITIALIZED`.
- **If It Fails:** follow the "Initialize the cluster" section of AWS's CloudHSM documentation.

> **This CA is not one of Pivotal's CAs.** It only proves which HSM cluster a client reached. Keep
> `customerCA.key` offline with the custodians. `customerCA.crt` is public and is needed again in
> the HSM admin pod and in the Pivotal deployment.

### Step 4. Create two HSMs

- **Purpose:** two HSMs are the minimum. The client will not create or use a key that is on fewer
  than two.
- **Action:** create two HSMs in the cluster, in different availability zones where the node
  placement allows it.
- **Expected Result:** both HSMs are `ACTIVE`. Record the private IP address of one of them as
  `<HSM_IP>`.

### Step 5. Prepare the HSM admin pod and start a session

- **Action:** follow [Prepare the HSM admin pod](hsm-admin-pod.md) Steps 1 to 5, then come back here
  with the session still open.
- **Expected Result:** `cloudhsm-cli cluster hsm-info` in the pod lists two HSMs.

**Steps 6 to 9 run inside the HSM admin pod.** The CloudHSM tools are on the `PATH` and `VAULT_ADDR`
is set there.

### Step 6. Activate the cluster

- **Purpose:** activation sets the password of the built-in `admin` user. That user becomes the
  first **Crypto Officer**. There is no other command that creates it.
- **Action:** a custodian runs this and types a new password at the prompt.
- **Command or Configuration:**

  ```bash
  cloudhsm-cli cluster activate
  ```

- **Expected Result:** the cluster is `ACTIVE` in the AWS console.
- **If It Fails:** the cluster must be `INITIALIZED` (Step 3) first.

The Crypto Officer can reset any crypto user's password, and so could sign as any DFSP. Its
credential is held **only by custodians**. Never store it in Vault, a Secret, an environment
variable of a workload, or a file.

### Step 7. Create the other Crypto Officers

- **Purpose:** more than one Crypto Officer means the environment does not depend on one person,
  and makes quorum possible.
- **Action:** log in as the first Crypto Officer for this shell only, then create each additional
  Crypto Officer. Each new Crypto Officer types their own password at the prompt.
- **Command or Configuration:**

  ```bash
  read -r -p "Crypto Officer username [admin]: " CO_USER; CO_USER=${CO_USER:-admin}
  read -r -s -p "Crypto Officer password: " CO_PASS; echo
  export CLOUDHSM_ROLE=admin CLOUDHSM_PIN="${CO_USER}:${CO_PASS}"
  unset CO_PASS

  cloudhsm-cli user create --username <CO_USERNAME> --role admin
  ```

- **Expected Result:** `cloudhsm-cli user list` shows the new user with role `admin`.
- **If It Fails:** usernames accept only `a-z`, `A-Z`, `0-9` and underscore. A hyphen is rejected.

Keep `CLOUDHSM_ROLE` and `CLOUDHSM_PIN` set for Step 8.

### Step 8. Create the `cu_web_outbound` crypto user and store its credential in Vault

- **Purpose:** web-outbound signs as any tenant by logging in as this one crypto user. Each tenant's
  key is shared with it by `provision-hsm-tenant.sh`, before onboarding. It owns no keys itself.
- **Action:** create the Vault KV mount (once), generate a random password, create the user, and
  write the credential straight to Vault. No person needs to know this password.
- **Command or Configuration:**

  ```bash
  read -r -s -p "Vault token: " VAULT_TOKEN; echo; export VAULT_TOKEN

  # Once per environment: the KV mount Pivotal reads. It must be version 2.
  vault secrets enable -path=pivotal-kv -version=2 kv

  CU_PASS=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
  cloudhsm-cli user create --username cu_web_outbound --role crypto-user --password "$CU_PASS"
  printf '%s' "$CU_PASS" | vault kv put -mount=pivotal-kv pivotal/hsmcred/web-outbound \
    username=cu_web_outbound password=-
  ```

- **Expected Result:** `cloudhsm-cli user create` succeeds and `vault kv put` prints the secret's
  metadata (version 1).
- **If It Fails:**
  - `path is already in use at pivotal-kv/`: the mount exists. Check it is version 2 with
    `vault secrets list -detailed | grep pivotal-kv` and continue.
  - If `user create` succeeded but `vault kv put` failed, run the `printf … | vault kv put` line
    again **in the same shell** while `CU_PASS` is still set. If the shell was closed, the password
    is lost: delete the user (see Rollback) and repeat this step.

The password goes on `cloudhsm-cli`'s command line. It is visible only inside this pod, for the
moment the command runs. `vault kv put … password=-` reads it from standard input, so it never
appears on Vault's command line.

> **The KV mount must be version 2.** Pivotal's services read KV v2 paths. Against a version 1
> mount, Pivotal's Node services refuse to start. See [Vault reference](../../reference/vault.md).

### Step 9. Check the new user can log in, then clear the shell

- **Purpose:** proves the stored credential works before any service depends on it.
- **Command or Configuration:**

  ```bash
  CU_PASS_READ=$(vault kv get -mount=pivotal-kv -field=password pivotal/hsmcred/web-outbound)
  CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN="cu_web_outbound:${CU_PASS_READ}" cloudhsm-cli key list

  unset CU_PASS CU_PASS_READ CO_USER CLOUDHSM_PIN CLOUDHSM_ROLE VAULT_TOKEN
  ```

- **Expected Result:** `key list` succeeds with `"error_code": 0` and an empty or near-empty key
  list. `cu_web_outbound` owns no keys.
- **If It Fails:** the password in Vault does not match the HSM. Delete the user and repeat Step 8.

Then end the session if you are not going straight on to the [CA ceremony](3-ca-ceremony.md). See
[Prepare the HSM admin pod: End the session](hsm-admin-pod.md#step-6-end-the-session).

## Verification

Run in the HSM admin pod, logged in as a Crypto Officer for `user list`.

| Check | Command | Expected |
|---|---|---|
| Two HSMs | `cloudhsm-cli cluster hsm-info \| grep -c '"serial-number"'` | `2` or more |
| Users | `cloudhsm-cli user list` | Your Crypto Officer(s) with role `admin`, and `cu_web_outbound` with role `crypto-user`. An `app_user` account also appears: it belongs to AWS. Leave it alone. |
| Credential stored | `vault kv get -mount=pivotal-kv -field=username pivotal/hsmcred/web-outbound` | `cu_web_outbound` |
| KV version | `vault secrets list -detailed \| grep pivotal-kv` | `version:2` in the options |

**Negative test:** a crypto user cannot manage users. Logged in as `cu_web_outbound`
(as in Step 9), run `cloudhsm-cli user create --username test_refused --role crypto-user`. It must
be **refused**. If it succeeds, stop: the user was created with the wrong role. Delete both users
and repeat Step 8.

Do not print the password from Vault to the screen. Read only the `username` field when checking.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `user create` rejects the username | A character other than `a-z`, `A-Z`, `0-9` or underscore | Use underscores. Crypto users in this guide are named `cu_<name>` |
| `user create` is refused for the Crypto Officer | `CLOUDHSM_ROLE` / `CLOUDHSM_PIN` not set in this shell, or quorum is on | Repeat the `export` in Step 7. With quorum on, follow AWS's quorum approval steps |
| Every command times out | No network path to the HSMs | Step 2 |
| Key operations later fail with "the key must be available on at least 2 HSMs" | The cluster has one HSM | Step 4 |

More: [Troubleshooting: HSM](../../troubleshooting.md#hsm) and
[Troubleshooting: Vault](../../troubleshooting.md#vault).

## Rollback or Recovery

- **Remove `cu_web_outbound`** (it owns no keys, so this is safe before any DFSP is onboarded). As a
  Crypto Officer, in the HSM admin pod:

  ```bash
  cloudhsm-cli user delete --username cu_web_outbound --role crypto-user
  vault kv metadata delete -mount=pivotal-kv pivotal/hsmcred/web-outbound
  ```

- **After DFSPs are onboarded, do not delete `cu_web_outbound`.** Every tenant's key is shared with
  it. Deleting it stops web-outbound signing for every tenant.
- **A lost Crypto Officer password** cannot be read back. Another Crypto Officer can reset it with
  `cloudhsm-cli user change-password`. If every Crypto Officer password is lost, the cluster cannot
  be administered. This is why Step 7 creates more than one.
- **Removing the whole cluster** is done in AWS (delete the HSMs, then the cluster). Every key in it
  is lost unless a cluster backup exists. CloudHSM backs the cluster up automatically; restore a
  backup once before go-live so you know the restore works.

## References

- [Prepare the HSM admin pod](hsm-admin-pod.md)
- [Run the CA ceremony](3-ca-ceremony.md)
- [Vault reference](../../reference/vault.md)
- [Glossary: Crypto Officer, Crypto user, Key sharing](../../reference/glossary.md)
- Next: [Run the CA ceremony](3-ca-ceremony.md)
