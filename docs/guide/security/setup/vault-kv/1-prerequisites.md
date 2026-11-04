# 1. Prerequisites (vault-kv)

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: vault-kv · Document version 1.0 (draft)

## Overview

This page lists everything that must exist before you start the `vault-kv` setup: infrastructure,
tools, access rights and the profile-specific values to collect. What the Hub operator must provide,
and the values shared with the `pkcs11` profile, are on
[Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md). It ends with
checks that prove each item is in place.

## Objective

Confirm that every dependency of the `vault-kv` setup is available and reachable.

## Expected Outcome

- Every check in [Verification](#verification) passes.
- The shared page [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md)
  is complete.
- The profile values in [Step 4](#step-4-fill-in-the-worksheet) are recorded.

## Prerequisites

### Mandatory

#### Infrastructure

| Item | Requirement | Used for |
|---|---|---|
| Kubernetes cluster | A namespace for Pivotal (this guide uses `pivotal`) | All Pivotal services |
| Istio | An ingress gateway reachable by DFSPs and by the Hub | DFSP-facing gateway (leg 1), Pivotal callback gateway (leg 4) |
| cert-manager | Installed in the cluster, with permission to authenticate to Vault | web-inbound server certificate (leg 4) |
| HashiCorp Vault | Unsealed, reachable from the cluster, Kubernetes auth method available | Intermediate CAs, Hub JWS signing keys |
| MySQL | The Pivotal database | All services |
| Redis | Reachable from the cluster | web-outbound, web-pivotal, trust-manager |
| NATS | Reachable from the cluster | web-outbound, web-inbound, connectors, trust-manager |
| Mojaloop Hub with MCM | MCM (Mojaloop Connection Manager) v3.7.4, and its Keycloak | Hub-facing legs 2–4 |
| AWS account | AWS KMS available in the chosen region | The two CA root keys |
| Ceremony host | A short-lived machine (for example an EC2 instance) that can reach AWS KMS and the cluster | The CA ceremony |

#### Tools

On the platform engineer's workstation and on the ceremony host:

| Tool | Version | Where |
|---|---|---|
| `kubectl` | Matching the cluster | Workstation, ceremony host |
| `helm` | 3.x | Workstation |
| `aws` CLI | 2.x | Ceremony host, and the AWS administrator's workstation |
| `vault` CLI | Matching the Vault server | Workstation |
| Node.js and npm | Node 22 (`>=22 <23`) | Ceremony host |
| A checkout of the `pivotal` repository at the release tag | — | Ceremony host |
| `openssl`, `curl`, `jq` | Any recent version | Workstation, ceremony host |

#### Access

| Who | Needs |
|---|---|
| Platform engineer | Create Secrets in the Pivotal namespace and in the ingress gateway's namespace; install Helm releases; `kubectl exec` into Pivotal pods; `create` on `serviceaccounts/token` in the Pivotal namespace (for `kubectl create token`) |
| Vault administrator | A Vault token that can enable secrets engines, write policies and write Kubernetes auth roles |
| AWS administrator | `kms:CreateKey`, `kms:CreateAlias`, `kms:GetKeyPolicy`, `kms:PutKeyPolicy` in the chosen region |
| Custodian (runs the ceremony) | On the ceremony host: an AWS identity allowed only `kms:Sign`, `kms:GetPublicKey` and `kms:DescribeKey` on the root keys; `kubectl exec` into the Vault pod; a Vault token that can disable and enable the PKI mounts and write roles; permission to create a Secret in the Pivotal namespace |

#### What the Hub operator must provide

See [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md). Agree the
items before page 4.

### Optional

| Item | Why you might want it |
|---|---|
| external-dns | Creates DNS records for the gateway hosts |
| A CloudTrail trail with a metric filter and alarm on `kms:Sign` | Alerts on any use of a root key. Legitimate use is only during a ceremony. Strongly recommended for production. |
| OpenTelemetry Operator | Tracing for the Java connectors |

## Steps

### Step 1. Check the tools

- **Purpose:** Make sure every command in this guide will run.
- **Action:** Run the version commands on the workstation and on the ceremony host.
- **Command or Configuration:**

  ```bash
  kubectl version --client
  helm version
  vault version
  aws --version
  node --version
  openssl version
  jq --version
  ```

- **Expected Result:** Every command prints a version. `node --version` prints `v22.x`.
- **If It Fails:** Install the missing tool. Use Node 22: it is the version the repository declares
  in `package.json`.

### Step 2. Check cluster access

- **Purpose:** Confirm you can create what later pages need.
- **Action:** Ask Kubernetes whether you are allowed to create Secrets in both namespaces.
- **Command or Configuration:**

  ```bash
  kubectl auth can-i create secrets -n pivotal
  kubectl auth can-i create secrets -n <GATEWAY_NAMESPACE>
  kubectl get pods -n <GATEWAY_NAMESPACE> -l <GATEWAY_SELECTOR_KEY>=<GATEWAY_SELECTOR_VALUE>
  ```

- **Expected Result:** `yes`, `yes`, and at least one running ingress gateway pod.
- **If It Fails:** Ask the cluster administrator for the missing rights. Note the gateway namespace
  and the label that selects the gateway; you need both later.

### Step 3. Complete the shared items

- **Purpose:** The Hub operator's items and the shared values are the same for both profiles.
- **Action:** Work through
  [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md), including its
  MCM token check.
- **Expected Result:** That page's verification passes.

### Step 4. Fill in the worksheet

- **Purpose:** Collect every value later pages ask for, in one place.
- **Action:** Copy this table into your change record and fill it in.

| Value | Example | Your value |
|---|---|---|
| AWS region | — | |
| KMS alias, DFSP CA root | `alias/pivotal-dfsp-root-ca` | |
| KMS alias, Pivotal Hub-client CA root | `alias/pivotal-hub-client-root-ca` | |

The shared values (namespaces, hosts, MCM, Vault, IDs) are in the
[shared worksheet](../common/hub-operator-and-worksheet.md#step-3-fill-in-the-worksheet).

- **Expected Result:** No empty cells.

## Verification

| Check | Command | Pass |
|---|---|---|
| Vault is unsealed | `vault status` | `Sealed false` |
| Kubernetes auth exists, or can be enabled | `vault auth list` | `kubernetes/` listed, or you hold rights to enable it |
| AWS identity and region are right (AWS administrator) | `aws sts get-caller-identity` and `aws configure get region` | Expected account and region |
| Shared items | Step 3 | The shared page's verification passed |
| Gateway exists | Step 2 | Gateway pod running |


## Troubleshooting

- [Trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- [Vault](../../troubleshooting.md#vault)

## Rollback or Recovery

Not applicable. This page changes nothing.

## References

- [Choosing a profile](../../concepts/choosing-a-profile.md)
- [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md)
- [Glossary](../../reference/glossary.md)
- Next: [2. CA ceremony](./2-ca-ceremony.md)
