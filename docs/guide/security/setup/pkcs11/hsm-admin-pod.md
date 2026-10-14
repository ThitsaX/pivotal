# Prepare the HSM Admin Pod

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

CloudHSM has no public endpoint. It is reached only over private IP addresses inside the VPC, so
CloudHSM commands cannot run from a workstation. Every CloudHSM administration task in this guide
runs inside a short-lived pod in the cluster: the **HSM admin pod**, named `hsm-tools`.

This page creates that pod, installs the CloudHSM client into it, and proves it can reach the
cluster. Other pages list it as a prerequisite. Delete the pod at the end of every session.

> **This page will be simplified in a later release.** A ready-made `hsm-tools` image and a
> Deployment kept at zero replicas will replace the manual installation below. Until then, follow
> these steps exactly, with the pinned versions shown.

## Objective

Have a pod in the Pivotal namespace with the CloudHSM CLI, the CloudHSM PKCS#11 library, the OpenSSL
PKCS#11 engine and the Vault CLI, connected to your CloudHSM cluster.

## Expected Outcome

- `cloudhsm-cli cluster hsm-info`, run in the pod, lists **at least two** HSMs.
- The pod can reach Vault.
- The pod holds no credentials of its own and does not mount a Kubernetes ServiceAccount token.

## Prerequisites

### Mandatory

| Item | Where it comes from |
|---|---|
| A CloudHSM cluster with its HSMs created | [Prepare the CloudHSM cluster](2-hsm.md), Steps 1–4 |
| The cluster's CA certificate, `customerCA.crt` | Created when the cluster was initialised ([Prepare the CloudHSM cluster](2-hsm.md), Step 3) |
| The private IP address of one HSM (`<HSM_IP>`) | The AWS console or CLI, after the HSMs are created |
| `kubectl` access to the Pivotal namespace with `create pod`, `exec`, `cp` and `delete pod` | Your cluster administrator |
| The Vault server version (`<VAULT_VERSION>`) | Step 6 below |

### Optional

None.

## Steps

All commands use the namespace `pivotal`. Change it if yours differs.

### Step 1. Create the pod

- **Purpose:** a place inside the cluster that can reach the HSMs.
- **Action:** from your workstation, create the pod.
- **Command or Configuration:**

  ```bash
  kubectl create namespace pivotal --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n pivotal run hsm-tools --image=ubuntu:24.04 --restart=Never \
    --overrides='{"metadata":{"annotations":{"sidecar.istio.io/inject":"false"}},"spec":{"automountServiceAccountToken":false}}' \
    --command -- sleep infinity
  kubectl -n pivotal wait --for=condition=Ready pod/hsm-tools --timeout=120s
  ```

- **Expected Result:** `pod/hsm-tools condition met`.
- **If It Fails:** run `kubectl -n pivotal describe pod hsm-tools` and read the Events. Use
  Ubuntu, not Alpine: the CloudHSM library is built for glibc and does not load on Alpine.

`automountServiceAccountToken: false` keeps a Kubernetes token out of the pod. The pod needs no
Kubernetes access, and anyone who can exec into it would otherwise get that token too.

### Step 2. Copy the cluster CA certificate into the pod

- **Purpose:** the CloudHSM client refuses to connect unless it can check that it reached your
  cluster.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal cp customerCA.crt hsm-tools:/tmp/customerCA.crt
  ```

- **Expected Result:** the command prints nothing and exits with status 0.

### Step 3. Open a shell in the pod

- **Command or Configuration:**

  ```bash
  kubectl -n pivotal exec -it hsm-tools -- bash
  ```

- **Expected Result:** a `root@hsm-tools` prompt. **Steps 4 to 8 run inside this shell.**

### Step 4. Install the operating system packages

- **Purpose:** download tools, OpenSSL, the OpenSSL PKCS#11 engine (used by the CA ceremony) and
  `pkcs11-tool`.
- **Command or Configuration:**

  ```bash
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    wget ca-certificates unzip openssl libengine-pkcs11-openssl opensc
  ```

- **Expected Result:** the packages install without errors.
- **If It Fails:** keep `DEBIAN_FRONTEND=noninteractive`. Without it, the `tzdata` dependency stops
  and waits for a time zone answer.

### Step 5. Install the CloudHSM client, version 5.18.0

- **Purpose:** the management CLI (`cloudhsm-cli`) and the PKCS#11 library. Both are pinned so
  that every custodian uses the same tested version.
- **Command or Configuration:**

  ```bash
  cd /tmp
  wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble/cloudhsm-cli_5.18.0-1_u24.04_amd64.deb
  wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble/cloudhsm-pkcs11_5.18.0-1_u24.04_amd64.deb
  apt-get install -y ./cloudhsm-cli_5.18.0-1_u24.04_amd64.deb ./cloudhsm-pkcs11_5.18.0-1_u24.04_amd64.deb

  cp /tmp/customerCA.crt /opt/cloudhsm/etc/customerCA.crt
  export PATH=$PATH:/opt/cloudhsm/bin
  cloudhsm-cli --version
  ```

- **Expected Result:** `cloudhsm-cli 5.18.0`. The tools install under `/opt/cloudhsm`, which is not
  on the `PATH` until you add it.
- **If It Fails:** check the file names. These are the Ubuntu 24.04 (`u24.04`, "Noble") builds and
  must match the pod's Ubuntu release.

### Step 6. Install the Vault CLI

- **Purpose:** the CA ceremony and DFSP onboarding write to Vault directly from this pod.
- **Action:** first, from **your workstation** (a second terminal), read the Vault server version:

  ```bash
  kubectl -n vault exec vault-0 -- vault version
  ```

  Then, **in the pod**, install the same version:

  ```bash
  VAULT_VERSION=<VAULT_VERSION>          # for example 1.13.1
  wget -qO /tmp/vault.zip https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_amd64.zip
  unzip -o /tmp/vault.zip -d /usr/local/bin
  vault version
  ```

- **Expected Result:** `vault version` prints the same version as the server. The commands in this
  guide use `vault kv … -mount=`, which needs Vault CLI 1.11 or later.
- **If It Fails:** if your Vault runs in another namespace or pod, change `-n vault exec vault-0`
  to match.

### Step 7. Point the client at the cluster

- **Purpose:** the CLI and the PKCS#11 library each have their own configuration. Configure both.
- **Command or Configuration:**

  ```bash
  configure-cli -a <HSM_IP>
  configure-pkcs11 -a <HSM_IP>
  ```

- **Expected Result:** both commands complete without an error.

One HSM address is enough: the client discovers the other HSMs in the cluster.

### Step 8. Prove the connection

- **Purpose:** proves the network path, the cluster certificate and the client configuration in one
  call. It does not log in.
- **Command or Configuration:**

  ```bash
  cloudhsm-cli cluster hsm-info
  cloudhsm-cli cluster hsm-info | grep -c '"serial-number"'
  ```

- **Expected Result:** the first command prints a JSON list of HSMs with `"error_code": 0`. The
  second prints the number of HSMs: **2 or more**.
- **If It Fails:** see [Troubleshooting](#troubleshooting).

> **Count the HSMs.** The client refuses to create **or use** a key that is not on at least two
> HSMs. With one HSM, every key operation fails with "the key must be available on at least 2
> HSMs". Fix the cluster; do not turn the check off in production.

### Step 9. Check the pod can reach Vault

- **Command or Configuration (in the pod):**

  ```bash
  vault status -address=http://vault.vault.svc.cluster.local:8200
  ```

- **Expected Result:** `Initialized true` and `Sealed false`.
- **If It Fails:** check the Vault address recorded in
  [Prerequisites](1-prerequisites.md#step-4-record-the-values-you-will-need). `vault status`
  needs no token.

## Verification

| Check | Command (in the pod) | Expected |
|---|---|---|
| CLI version | `cloudhsm-cli --version` | `cloudhsm-cli 5.18.0` |
| HSM count | `cloudhsm-cli cluster hsm-info \| grep -c '"serial-number"'` | `2` or more |
| PKCS#11 library present | `ls /opt/cloudhsm/lib/libcloudhsm_pkcs11.so` | The file is listed |
| OpenSSL engine present | `ls /usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so` | The file is listed |
| Vault reachable | `vault status -address=<VAULT_ADDR>` | `Sealed false` |
| No Kubernetes token (from your workstation) | `kubectl -n pivotal get pod hsm-tools -o jsonpath='{.spec.automountServiceAccountToken}'` | `false` |

There is no safe negative test on this page. The negative tests for the HSM are on
[Prepare the CloudHSM cluster](2-hsm.md#verification).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `cluster hsm-info` hangs or times out | No network path from the pod's node to the HSMs | Check the security group rule for TCP 2223–2225 from the node subnets ([Prepare the CloudHSM cluster](2-hsm.md), Step 2) |
| `cluster hsm-info` fails with a certificate error | `customerCA.crt` missing or from another cluster | Repeat Step 2 and the `cp` in Step 5 with the right file |
| Only one HSM listed | The cluster has one HSM, or one was lost | Add an HSM in AWS before going further |
| `-engine pkcs11` fails in the CA ceremony | `libengine-pkcs11-openssl` not installed | Repeat Step 4 |
| `apt-get` stops at a time zone question | `DEBIAN_FRONTEND` not set | Press Ctrl+C and repeat Step 4 as written |

More: [Troubleshooting: HSM](../../troubleshooting.md#hsm).

## Rollback or Recovery

**Delete the pod at the end of every session.** It may hold the cluster certificate, a Vault token
you typed, the CA ceremony's working files, or a crypto-user password used in a command. Anyone who
can exec into the pod could use what is left there.

1. If the session produced files you need (for example, the CA ceremony output), copy them out
   first. The page that produced them tells you which files.
2. From your workstation:

   ```bash
   kubectl -n pivotal delete pod hsm-tools
   ```

3. Check it is gone: `kubectl -n pivotal get pod hsm-tools` returns `NotFound`.

To use the pod again later, repeat this page from Step 1. Nothing in the CloudHSM cluster depends on
the pod, so deleting it changes nothing in the HSM.

## References

- [Prepare the CloudHSM cluster](2-hsm.md)
- [Run the CA ceremony](3-ca-ceremony.md)
- [Glossary: HSM admin pod](../../reference/glossary.md)
