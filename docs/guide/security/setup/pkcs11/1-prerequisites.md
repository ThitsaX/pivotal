# Prerequisites: HSM-Backed Profile

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

This page lists everything you need before you set up the HSM-backed profile: infrastructure,
access, people, images, tools and information. Nothing here changes any system. Work through it and
tick every mandatory item before you start [Prepare the CloudHSM cluster](2-hsm.md).

## Objective

Have every account, person, tool and value ready, so that no later step stops halfway.

## Expected Outcome

- Every mandatory item in the checklists below is ticked.
- The values in [Step 4](#step-4-record-the-values-you-will-need) are written down in your change
  record.

## Prerequisites

### Mandatory

| Item | Why |
|---|---|
| An AWS account, and the VPC and subnets where the Kubernetes nodes run | CloudHSM is reached only over private IP addresses inside the VPC. The HSMs must be placed where the pods can reach them. |
| Permission to create a CloudHSM cluster, HSMs and security group rules in that VPC | Needed in [Prepare the CloudHSM cluster](2-hsm.md) |
| An approved budget for **two HSMs**, billed hourly | The CloudHSM client refuses to create or use a key that is not on at least two HSMs. One HSM is not a supported production setup. |
| A Kubernetes cluster with Istio and cert-manager installed | Pivotal's gateways and the web-inbound server certificate depend on them |
| `kubectl` access to the namespace Pivotal runs in (this guide uses `pivotal`), including creating ConfigMaps, scaling Deployments, `exec` and `cp` | The HSM admin pod runs there |
| A HashiCorp Vault server, unsealed, with a token that can enable secrets engines and write policies and auth roles | Vault holds the intermediate CAs, the crypto-user credentials and the key references |
| **At least two custodians** | One custodian per root CA crypto user. No single person may hold both. Crypto Officer credentials are held only by custodians. |
| Access to the Hub operator and to MCM | Needed from [Deploy Pivotal](5-deploy-pivotal.md) onwards: trust-manager enrolls the Hub client certificate and registers Pivotal's CA as soon as it starts. Ask early: it is the step most likely to wait on someone else. See [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md). |

The people involved, and what each needs:

| Who | Needs |
|---|---|
| AWS administrator | Create the CloudHSM cluster, HSMs and security group rules ([Prepare the CloudHSM cluster](2-hsm.md), Steps 1 to 4) |
| Platform engineer | `kubectl` access to the Pivotal namespace (ConfigMaps, Deployments, `scale`, `exec`, `cp`, Secrets); install Helm releases |
| Vault administrator | A Vault token that can enable secrets engines, write policies and write Kubernetes auth roles ([Prepare the CloudHSM cluster](2-hsm.md), Step 8; [Configure Vault](4-vault.md); each new connector's policy and role) |
| Custodians (at least two) | A Crypto Officer login, and their own root CA crypto user for the [CA ceremony](3-ca-ceremony.md). For onboarding, a short-lived Vault token with `pivotal-hsm-provisioning` |
| Ceremony witness | Present for the whole [CA ceremony](3-ca-ceremony.md) |
| Portal operator | A portal account with **participant.onboard**, **participant.certificate.enroll** and **participant.certificate.view** |

### Optional

| Item | Why |
|---|---|
| Quorum for Crypto Officer operations (for example, two of three Crypto Officers must approve) | No single person can then create or delete an HSM user. Set it up following AWS's CloudHSM documentation. |
| CloudHSM audit logs sent to CloudWatch | A record of every Crypto Officer action. Recommended for production. |
| A Vault audit device | Records every read of a crypto-user credential. Recommended for production. |

## Steps

### Step 1. Confirm the network path can be opened

- **Purpose:** the pods must reach the HSMs, or nothing in this profile works.
- **Action:** confirm with your AWS administrator that a security group rule can allow the
  Kubernetes node subnets to reach the HSM network interfaces on TCP ports **2223–2225**.
- **Expected Result:** the rule is approved, or already exists.
- **If It Fails:** stop here. Without this path the HSM admin pod and the services cannot connect.

### Step 2. Confirm the images carry the CloudHSM client

- **Purpose:** every workload that talks to the HSM needs the vendor library inside its image.
- **Action:** check the images you will deploy.

  | Image | Requirement |
  |---|---|
  | `pivotal-web-outbound` | The published release image already includes the CloudHSM PKCS#11 library. Nothing to do. |
  | `pivotal-web-pivotal` | Needs no CloudHSM library: it only reads key references and public keys from Vault. |
  | `pivotal-hsm-tools` | The HSM admin pod's image, published with each release. It carries the CloudHSM CLI and PKCS#11 library 5.18.0, the Vault CLI and both custodian scripts. If your release has none, use the [hand-built fallback](hsm-admin-pod.md#fallback-a-hand-built-pod). |
  | Java connector images | Must be built with the build argument `PKCS11_BACKEND=cloudhsm`, which installs the CloudHSM JCE provider. The published `pivotal-thitsawallet-connector` images are built this way. For any other connector image, confirm it with whoever builds it. |

- **Expected Result:** every image you will deploy carries the CloudHSM client.
- **If It Fails:** rebuild the connector image with `--build-arg PKCS11_BACKEND=cloudhsm`. A
  connector image built without it exits at start with `/opt/cloudhsm/bin/configure-jce: not found`
  when `CLOUDHSM_IP` is set.

### Step 3. Check your workstation tools

- **Action:** confirm these are installed on the workstation you will use.

  | Tool | Used for |
  |---|---|
  | `kubectl` | Every step |
  | `helm` 3 | Deploying Pivotal |
  | `vault` CLI, matching the Vault server | [Configure Vault](4-vault.md), the connector policy in onboarding, and the login checks in [Deploy Pivotal](5-deploy-pivotal.md) |
  | `openssl` | Checking certificates |
  | `sha256sum` (Linux) or `shasum -a 256` (macOS) | Checking the ceremony script and files copied out of the HSM admin pod |

- **Expected Result:** each command prints its version.

Vault usually has no address reachable from outside the cluster. Reach it from your workstation with
a port-forward, in a second terminal:

```bash
kubectl -n <VAULT_NAMESPACE> port-forward svc/vault 8200:8200
export VAULT_ADDR=http://127.0.0.1:8200
```

The CloudHSM tools themselves are **not** installed on your workstation. CloudHSM cannot be reached
from outside the VPC, so every CloudHSM command runs inside the
[HSM admin pod](hsm-admin-pod.md).

### Step 4. Record the values you will need

- **Action:** work through
  [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md), which holds the
  Hub operator's items, the MCM token check and every value shared with the `vault-kv` profile
  (namespaces, Vault address, `<PIVOTAL_CALLBACK_HOST>`, MCM settings, DFSP IDs). Then record these
  values, which only this profile needs:

  | Value | Example | Used in |
  |---|---|---|
  | Names of the two custodians who will each own one root CA | — | [CA ceremony](3-ca-ceremony.md) |
  | HSM IP address(es) | Known after [Prepare the CloudHSM cluster](2-hsm.md) | HSM admin pod, Pivotal values (`<HSM_IP>`, `CLOUDHSM_IP`) |
  | `<PIVOTAL_VERSION>`: the Pivotal release you deploy | `v1.4.0` | Image tags, including `hsmTools.image.tag` |

- **Expected Result:** the shared page's verification passes, and every value here is known except
  the HSM IP addresses, which you get in the next page.

## Verification

- [ ] Network path to ports 2223–2225 approved
- [ ] Budget for two HSMs approved
- [ ] Two named custodians agreed
- [ ] Vault reachable and a suitable token available
- [ ] Images confirmed to carry the CloudHSM client
- [ ] Workstation tools installed
- [ ] Shared items and worksheet complete; values in Step 4 recorded

## Troubleshooting

Not applicable. This page changes nothing.

## Rollback or Recovery

Not applicable. This page changes nothing.

## References

- [Choosing a profile](../../concepts/choosing-a-profile.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Environment variables](../../reference/environment-variables.md)
- [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md)
- Next: [Prepare the CloudHSM cluster](2-hsm.md)
