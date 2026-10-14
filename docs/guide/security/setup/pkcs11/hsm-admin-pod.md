# Prepare the HSM Admin Pod

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

CloudHSM has no public endpoint. It is reached only over private IP addresses inside the VPC, so
CloudHSM commands cannot run from a workstation. Every CloudHSM task in this guide runs inside a pod
in the cluster: the **HSM admin pod**, the `hsm-tools` Deployment.

The Pivotal Helm chart deploys it from the `pivotal-hsm-tools` image, which carries pinned versions
of every tool and both custodian scripts. It is kept at **zero replicas**. A custodian scales it to
one for a session and back to zero afterwards, so no admin pod runs between sessions.

This page deploys it once, and shows how to start and end a session. Other pages list a session as
a prerequisite.

## Objective

Have an `hsm-tools` Deployment that a custodian can start, use and stop, connected to your CloudHSM
cluster and to Vault.

## Expected Outcome

- During a session, `cloudhsm-cli cluster hsm-info` in the pod lists **at least two** HSMs, and
  `vault status` reaches Vault.
- Between sessions, the Deployment has zero pods.
- The pod holds no credentials of its own and mounts no Kubernetes ServiceAccount token.

## Prerequisites

### Mandatory

| Item | Where it comes from |
|---|---|
| A CloudHSM cluster with its HSMs created | [Prepare the CloudHSM cluster](2-hsm.md), Steps 1–4 |
| The cluster's CA certificate, `customerCA.crt` | Created when the cluster was initialised ([Prepare the CloudHSM cluster](2-hsm.md), Step 3) |
| The private IP address of one HSM (`<HSM_IP>`) | The AWS console or CLI, after the HSMs are created |
| Vault's address from inside the cluster (`<VAULT_ADDRESS>`) | The [shared worksheet](../common/hub-operator-and-worksheet.md#step-3-fill-in-the-worksheet) |
| The Pivotal Helm chart and your values file | [Deploy Pivotal](5-deploy-pivotal.md) uses the same file later |
| The `pivotal-hsm-tools` image tag (`<PIVOTAL_VERSION>`) | The Pivotal release you deploy ([Prerequisites](1-prerequisites.md#step-4-record-the-values-you-will-need)). It is published with each release. |
| `kubectl` access to the Pivotal namespace: create ConfigMaps, scale Deployments, `exec`, `cp` | Your cluster administrator |

### Optional

| Item | When |
|---|---|
| ArgoCD | If the chart is deployed through ArgoCD with self-heal: see Step 3 |

## Steps

All commands use the namespace `pivotal`. Change it if yours differs.

### Step 1. Publish the cluster certificate as a ConfigMap

- **Purpose:** the CloudHSM client refuses to connect unless it can check that it reached your
  cluster. The certificate is public, so a ConfigMap is enough. web-outbound and the connectors
  mount the same ConfigMap later.
- **Command or Configuration (from your workstation):**

  ```bash
  kubectl create namespace pivotal --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n pivotal create configmap cloudhsm-customer-ca --from-file=customerCA.crt=customerCA.crt
  ```

- **Expected Result:** `configmap/cloudhsm-customer-ca created`.
- **If It Fails:** `AlreadyExists`: check its content matches your `customerCA.crt`, and continue.

### Step 2. Deploy the `hsm-tools` Deployment

- **Purpose:** the admin pod's definition, at zero replicas.
- **Action:** add this block to your values file.

  ```yaml
  hsmTools:
    enabled: true
    image:
      repository: ghcr.io/thitsax/pivotal-hsm-tools
      tag: <PIVOTAL_VERSION>
    cloudhsmIp: <HSM_IP>
    vaultAddress: <VAULT_ADDRESS>
    customerCaConfigMap: cloudhsm-customer-ca
  ```

  **If Pivotal is not deployed yet** (the usual case at this point), also turn the services off for
  now, so this release creates only the admin pod. [Deploy Pivotal](5-deploy-pivotal.md) removes
  these lines and upgrades the same release:

  ```yaml
  webOutbound: {enabled: false}
  webInbound: {enabled: false}
  appAuditor: {enabled: false}
  webPivotal: {enabled: false}
  portal: {enabled: false}
  ```

- **Command or Configuration:**

  ```bash
  helm upgrade --install pivotal-stack <CHART> -n pivotal -f <VALUES_FILE>
  kubectl -n pivotal get deploy hsm-tools
  ```

  **If ArgoCD deploys the chart**, commit the values file and let ArgoCD sync it instead of running
  `helm`.
- **Expected Result:** `hsm-tools` with `READY 0/0`.
- **If It Fails:** Helm refuses to render with `hsmTools.cloudhsmIp is required`,
  `hsmTools.vaultAddress is required` or `hsmTools image.tag is required`: set that value in the
  values file.

### Step 3. If ArgoCD manages the chart, let the replica count change

- **Purpose:** with self-heal on, ArgoCD resets the Deployment to zero replicas as soon as a
  custodian scales it up.
- **Action:** add this to the ArgoCD `Application` for the chart:

  ```yaml
  spec:
    ignoreDifferences:
      - group: apps
        kind: Deployment
        name: hsm-tools
        jsonPointers:
          - /spec/replicas
    syncPolicy:
      syncOptions:
        - RespectIgnoreDifferences=true
  ```

  `RespectIgnoreDifferences=true` matters: without it, any sync during a session (for example after
  a Git change) re-applies `replicas: 0` and stops the pod.
- **Expected Result:** after Step 4, the pod stays up, also through a sync.

### Step 4. Start a session

- **Purpose:** this is how every HSM task in this guide begins.
- **Command or Configuration (from your workstation):**

  ```bash
  kubectl -n pivotal scale deploy/hsm-tools --replicas=1
  kubectl -n pivotal rollout status deploy/hsm-tools --timeout=180s
  kubectl -n pivotal logs deploy/hsm-tools | head -3
  kubectl -n pivotal exec -it deploy/hsm-tools -- bash
  ```

- **Expected Result:** the log shows
  `CloudHSM CLI and PKCS#11 library configured for <HSM_IP>.`, and you get a
  `custodian@hsm-tools-…` prompt. The CloudHSM tools are already on the `PATH`, and `VAULT_ADDR`
  is already set.
- **If It Fails:**
  - The pod stays in `ContainerCreating`, and `kubectl -n pivotal describe pod` shows
    `configmap "cloudhsm-customer-ca" not found`: create it (Step 1).
  - The pod exits at start with `/opt/cloudhsm/etc/customerCA.crt is missing. Mount the cluster's certificate there.`:
    the ConfigMap has no key named `customerCA.crt`. Re-create it as in Step 1.

### Step 5. Prove the connection

- **Purpose:** proves the network path, the cluster certificate and the client configuration in one
  call. It does not log in.
- **Command or Configuration (in the pod):**

  ```bash
  cloudhsm-cli --version
  cloudhsm-cli cluster hsm-info | grep -c '"serial-number"'
  vault status
  ```

- **Expected Result:** version 5.18.0; **2 or more** HSMs; `Initialized true` and `Sealed false`.
  `vault status` needs no token.
- **If It Fails:** see [Troubleshooting](#troubleshooting).

> **Count the HSMs.** The client refuses to create **or use** a key that is not on at least two
> HSMs. With one HSM, every key operation fails with an error saying the key must be available on
> at least 2 HSMs. Fix the cluster; do not turn the check off in production.

### Step 6. End the session

- **Purpose:** the pod may hold a Vault token you typed, the CA ceremony's working files, or a
  crypto-user password used in a command. Scaling to zero deletes the pod and its `/tmp`.
- **Action:** first copy out any files the session produced and that you still need. The page that
  produced them says which.
- **Command or Configuration (from your workstation):**

  ```bash
  kubectl -n pivotal scale deploy/hsm-tools --replicas=0
  kubectl -n pivotal get pods -l app.kubernetes.io/component=hsm-tools
  ```

- **Expected Result:** `No resources found` once the pod has stopped.

To copy a file out of the pod during a session, use its pod name:

```bash
POD=$(kubectl -n pivotal get pod -l app.kubernetes.io/component=hsm-tools -o jsonpath='{.items[0].metadata.name}')
kubectl -n pivotal cp "$POD:/tmp/<FILE>" ./<FILE>
```

## Verification

| Check | Command | Expected |
|---|---|---|
| Deployment at rest | `kubectl -n pivotal get deploy hsm-tools` | `0/0` between sessions |
| No Kubernetes token | `kubectl -n pivotal get deploy hsm-tools -o jsonpath='{.spec.template.spec.automountServiceAccountToken}'` | `false` |
| Runs as a normal user (in a session) | `id -un` | `custodian` |
| Tools present (in a session) | `cloudhsm-cli --version; vault version; ls /usr/local/bin/*.sh` | 5.18.0; Vault 1.13.1; `ceremony-hsm.sh`, `provision-hsm-tenant.sh` and the entrypoint |
| HSM count (in a session) | `cloudhsm-cli cluster hsm-info \| grep -c '"serial-number"'` | `2` or more |

**Negative test:** in a session, run `ls /var/run/secrets/kubernetes.io/serviceaccount`. It must
report `No such file or directory`: the pod has no Kubernetes credentials.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `cluster hsm-info` hangs or times out | No network path from the pod's node to the HSMs | Check the security group rule for TCP 2223–2225 from the node subnets ([Prepare the CloudHSM cluster](2-hsm.md), Step 2) |
| `cluster hsm-info` fails with a certificate error | The ConfigMap holds another cluster's certificate | Re-create it from the right `customerCA.crt` (Step 1), then restart the session |
| Only one HSM listed | The cluster has one HSM, or one was lost | Add an HSM in AWS before going further |
| The pod scales back to zero by itself | ArgoCD self-heal | Step 3 |
| `ImagePullBackOff` | The image tag does not exist for your release, or the pull Secret is missing | Check `<PIVOTAL_VERSION>` and `global.imagePullSecrets`. If your release has no `pivotal-hsm-tools` image, use the [fallback](#fallback-a-hand-built-pod) |

More: [Troubleshooting: HSM](../../troubleshooting.md#hsm).

## Rollback or Recovery

- **After every session:** Step 6.
- **To remove the admin pod entirely:** set `hsmTools.enabled: false` and upgrade the release.
  Nothing in the CloudHSM cluster depends on the pod, so this changes nothing in the HSM.

## Fallback: a hand-built pod

Only for a release that has no `pivotal-hsm-tools` image. Skip Steps 2 to 4 and leave
`hsmTools.enabled: false`. This pod installs the same pinned tools by hand, so it needs internet
access from the cluster. The scripts are copied in from the Pivotal repository: run the commands
below from the repository root. The pod is deleted after each session instead of scaled down.

Differences from the chart's pod:

- It runs as root, and it prints no entrypoint log line. The Verification checks `id -un` and the log
  line do not apply.
- `PATH` and `VAULT_ADDR` are set only in the shell where you export them. Export them again in every
  new `kubectl exec`.

```bash
# From your workstation, in the Pivotal repository root
kubectl -n pivotal run hsm-tools --image=ubuntu:24.04 --restart=Never \
  --labels app.kubernetes.io/component=hsm-tools \
  --overrides='{"metadata":{"annotations":{"sidecar.istio.io/inject":"false"}},"spec":{"automountServiceAccountToken":false}}' \
  --command -- sleep infinity
kubectl -n pivotal wait --for=condition=Ready pod/hsm-tools --timeout=120s
kubectl -n pivotal cp customerCA.crt hsm-tools:/tmp/customerCA.crt
kubectl -n pivotal cp docs/operations/hsm/setup/scripts/ceremony-hsm.sh hsm-tools:/usr/local/bin/ceremony-hsm.sh
kubectl -n pivotal cp docs/operations/hsm/runbooks/scripts/provision-hsm-tenant.sh hsm-tools:/usr/local/bin/provision-hsm-tenant.sh
kubectl -n pivotal exec -it hsm-tools -- bash

# In the pod
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y wget ca-certificates unzip openssl libengine-pkcs11-openssl opensc
cd /tmp
wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble/cloudhsm-cli_5.18.0-1_u24.04_amd64.deb
wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble/cloudhsm-pkcs11_5.18.0-1_u24.04_amd64.deb
apt-get install -y ./cloudhsm-cli_5.18.0-1_u24.04_amd64.deb ./cloudhsm-pkcs11_5.18.0-1_u24.04_amd64.deb
wget -q https://releases.hashicorp.com/vault/1.13.1/vault_1.13.1_linux_amd64.zip
unzip -o vault_1.13.1_linux_amd64.zip -d /usr/local/bin
cp /tmp/customerCA.crt /opt/cloudhsm/etc/customerCA.crt
chmod +x /usr/local/bin/*.sh
export PATH=$PATH:/opt/cloudhsm/bin VAULT_ADDR=<VAULT_ADDRESS>
configure-cli -a <HSM_IP>
configure-pkcs11 -a <HSM_IP>
```

Then continue at Step 5. In the other pages, read `kubectl exec -it deploy/hsm-tools` as
`kubectl exec -it hsm-tools`. The label makes the `POD=$(…)` lookups on other pages find this pod. End
each session with `kubectl -n pivotal delete pod hsm-tools`.

## References

- [Prepare the CloudHSM cluster](2-hsm.md)
- [Run the CA ceremony](3-ca-ceremony.md)
- [Onboard a DFSP (pkcs11)](../../runbooks/pkcs11/onboard-dfsp.md)
- [Helm values: hsmTools](../../reference/helm-values.md)
- [Glossary: HSM admin pod](../../reference/glossary.md)
