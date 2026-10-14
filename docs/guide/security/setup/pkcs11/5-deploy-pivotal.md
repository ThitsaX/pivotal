# Deploy Pivotal

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

This page installs Pivotal with the Helm chart, configured for the `pkcs11` profile, with
trust-manager enabled. Every security control stays **off** at this point. The pages that follow turn
them on one leg at a time.

The values shown here are only the ones this guide depends on. Every other setting a service needs
(database, Redis, NATS, ledger and oracle URLs) is listed in
[Environment variables](../../reference/environment-variables.md) and
[Helm values](../../reference/helm-values.md).

## Objective

Run Pivotal with Hub JWS signing done inside CloudHSM, and prove the profile is in effect.

## Expected Outcome

- All Pivotal pods are `Running`.
- web-outbound runs with `KEY_PROVIDER=pkcs11`, has logged in to the HSM as `cu_web_outbound`, and
  holds no private key.
- web-pivotal runs with `KEY_PROVIDER=pkcs11`, so portal onboarding records keys a custodian
  provisioned in the HSM. It holds no HSM credential.
- trust-manager has enrolled the Hub client certificate into Secret `pivotal-hub-client-cert`,
  written the Hub CA bundle into Secret `hub-ca-bundle`, and registered the Pivotal Hub-client CA
  with MCM.

## Prerequisites

### Mandatory

| Item | Notes |
|---|---|
| [Configure Vault](4-vault.md) completed and verified | |
| Secret `pivotal-hub-client-ca` in the Pivotal namespace | [Run the CA ceremony](3-ca-ceremony.md), Step 6 |
| ConfigMap `cloudhsm-customer-ca`, holding the CloudHSM cluster's CA certificate | [Prepare the HSM admin pod](hsm-admin-pod.md), Step 1 |
| Your values file, with the `hsmTools` block | [Prepare the HSM admin pod](hsm-admin-pod.md), Step 2. If you also turned the services off there, remove those lines now. |
| `<HSM_IP>`, the private IP address of one HSM | [Prepare the CloudHSM cluster](2-hsm.md), Step 4 |
| The Hub operator's items H1 to H4 in place: MCM URL, token URL and client, Hub CA in MCM | [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md), with the shared values for this page |
| The Pivotal Helm chart 0.2.0 and the image tags for your release | The published images already carry the CloudHSM library ([Prerequisites](1-prerequisites.md), Step 2) |
| The non-security settings for each service | Database, Redis, NATS, ledger and oracle URLs |

### Optional

None.

## Steps

### Step 1. Create the MCM credential Secret

- **Purpose:** trust-manager reads its MCM client secret from a Secret, never from the values file.
- **Action:** type the secret at the prompt so it does not enter shell history.
- **Command or Configuration:**

  ```bash
  read -r -s -p "MCM client secret: " S; echo
  kubectl -n pivotal create secret generic trust-manager-mcm --from-literal=MCM_CLIENT_SECRET="$S"
  unset S
  ```

- **Expected Result:** `secret/trust-manager-mcm created`
- **If It Fails:** `already exists`: replace it only if the value has changed.

### Step 2. Check the CloudHSM cluster certificate ConfigMap

- **Purpose:** the CloudHSM library reads `customerCA.crt` from a fixed path and refuses to connect
  without it. web-outbound and the connectors mount the ConfigMap the HSM admin pod uses.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal get configmap cloudhsm-customer-ca -o jsonpath='{.data.customerCA\.crt}' | openssl x509 -noout -subject
  ```

- **Expected Result:** the subject of your cluster's CA certificate.
- **If It Fails:** create it: [Prepare the HSM admin pod](hsm-admin-pod.md), Step 1.

### Step 3. Write the security settings into your values file

- **Purpose:** select the `pkcs11` profile and give each service its Vault identity.
- **Action:** add these blocks to your values file, alongside your other settings.
- **Command or Configuration:**

  ```yaml
  global:
    commonFspiopEnv:
      FSPIOP_SWITCH_ID: <FSPIOP_SWITCH_ID>

  webOutbound:
    # The CloudHSM library reads the cluster certificate from this fixed path. Mount it with
    # subPath, so the rest of /opt/cloudhsm/etc stays as the image installed it.
    volumeMounts:
      - {name: cloudhsm-customer-ca, mountPath: /opt/cloudhsm/etc/customerCA.crt, subPath: customerCA.crt, readOnly: true}
    volumes:
      - {name: cloudhsm-customer-ca, configMap: {name: cloudhsm-customer-ca}}
    env:
      # Key profile. Unset means no keys; with FSPIOP_USE_JWS "true", web-outbound refuses to start.
      KEY_PROVIDER: pkcs11
      VAULT_ADDRESS: <VAULT_ADDRESS>
      VAULT_AUTH_METHOD: kubernetes
      VAULT_ROLE: pivotal-web-outbound
      VAULT_KV_MOUNT: pivotal-kv               # the default, "secret", is not Pivotal's mount
      # Its own crypto-user credential, and where every tenant's keyRef is read from.
      HSM_CRED_PATH: pivotal/hsmcred/web-outbound
      KEY_REF_PATH: pivotal/keyref
      # The device.
      PKCS11_MODULE_PATH: /opt/cloudhsm/lib/libcloudhsm_pkcs11.so
      PKCS11_SESSION_POOL_SIZE: "4"
      CLOUDHSM_IP: <HSM_IP>
      # Off for now. Later pages turn these on.
      FSPIOP_USE_JWS: "false"
      FSPIOP_USE_MUTUAL_TLS: "false"
      FSPIOP_TLS_VERIFY_SERVER_CERT: "true"
      FSPIOP_TLS_VERIFY_DOMAIN: "true"
      DFSP_FACING_MTLS_MANDATORY: "false"
      # The Hub endpoints you use today. A later page moves them to the Hub API gateway.
      FSPIOP_PARTIES_URL: <CURRENT_HUB_PARTIES_URL>
      FSPIOP_QUOTES_URL: <CURRENT_HUB_QUOTES_URL>
      FSPIOP_TRANSFERS_URL: <CURRENT_HUB_TRANSFERS_URL>

  webPivotal:
    env:
      # DFSP client certificate issuance (leg 1).
      VAULT_ADDRESS: <VAULT_ADDRESS>
      VAULT_AUTH_METHOD: kubernetes
      VAULT_ROLE: pivotal-web-pivotal
      DFSP_CERT_PKI_MOUNT: pki_dfsp
      DFSP_CERT_PKI_ROLE: dfsp-client
      # Onboarding records the key a custodian provisioned: it reads the key reference and public
      # key from <VAULT_KV_MOUNT>/<KEY_REF_PATH>/<DFSP_ID>. No HSM settings: web-pivotal never
      # reaches the device.
      KEY_PROVIDER: pkcs11
      VAULT_KV_MOUNT: pivotal-kv
      KEY_REF_PATH: pivotal/keyref

  webInbound:
    env:
      FSPIOP_USE_JWS: "false"          # a later page turns verification on
      FSPIOP_USE_MUTUAL_TLS: "false"   # always false here: the gateway terminates TLS

  trustManager:
    enabled: true
    env:
      PIVOTAL_DFSP_ID: <PIVOTAL_DFSP_ID>
      MCM_BASE_URL: <MCM_BASE_URL>
      MCM_TOKEN_URL: <MCM_TOKEN_URL>
      MCM_CLIENT_ID: <MCM_CLIENT_ID>
      MCM_CLIENT_SECRET:
        valueFrom:
          secretKeyRef: {name: trust-manager-mcm, key: MCM_CLIENT_SECRET}
      MCM_AUTO_REGISTER_DFSPS: "true"
      PIVOTAL_CA_PATH: /etc/pivotal/hub-client-ca/ca.pem
      HUB_SERVER_CERT_COMMON_NAME: <HUB_CLIENT_CERT_COMMON_NAME>
      HUB_SERVER_CERT_SECRET_NAME: pivotal-hub-client-cert
      VAULT_ADDRESS: <VAULT_ADDRESS>
      VAULT_AUTH_METHOD: kubernetes
      VAULT_ROLE: pivotal-trust-manager
    volumeMounts:
      - {name: hub-client-ca, mountPath: /etc/pivotal/hub-client-ca, readOnly: true}
    volumes:
      - {name: hub-client-ca, secret: {secretName: pivotal-hub-client-ca}}
  ```

  Notes:

  - **Leave `PKCS11_TOKEN_LABEL` unset.** CloudHSM presents one token and names it itself; with the
    label unset, web-outbound uses the only token present.
  - `PKCS11_SESSION_POOL_SIZE` is 4 by default. One replica signs about 500 times per second at
    that size. A larger pool makes it **slower**, not faster. For more capacity, add replicas.
  - **Do not set `CLOUDHSM_DISABLE_KEY_AVAILABILITY_CHECK`** in production. It lets keys exist on
    one HSM only.
  - `volumeMounts` and `volumes` are lists. When a later page adds the Hub client certificate
    mounts to web-outbound, keep the `cloudhsm-customer-ca` entries.
  - `HUB_SERVER_CERT_*` configure the **Hub client certificate**. The names say "server" for
    historical reasons; the certificate is the one Pivotal presents to the Hub.
  - `MCM_AUTO_REGISTER_DFSPS: "true"` makes trust-manager create Pivotal and each DFSP in MCM. Only
    `true` or `false` are accepted; anything else stops trust-manager from starting.
  - trust-manager and web-inbound ignore `KEY_PROVIDER`. Do not add it to them. Neither talks to
    the HSM.
  - web-pivotal needs no `CLOUDHSM_IP`, `PKCS11_*` or `HSM_CRED_PATH`, and no `cloudhsm-customer-ca`
    mount.

- **Expected Result:** a values file that renders. Check it with
  `helm template pivotal-stack <CHART> -n pivotal -f <VALUES_FILE> > /dev/null`.
- **If It Fails:** Helm names the missing value.

### Step 4. Know the connector settings

- **Purpose:** each DFSP's Java connector signs its own callbacks inside the HSM, as that DFSP's own
  crypto user. It uses the CloudHSM JCE provider, not PKCS#11, so its settings differ from
  web-outbound's.
- **Action:** nothing to deploy now. A connector is added when its DFSP is onboarded, after a
  custodian has created its crypto user and key. This is the `pkcs11` part of a connector entry:

  ```yaml
  connectors:
    - name: <DFSP_ID>-connector
      enabled: true
      serviceAccount: {create: true, name: <DFSP_ID>-connector}
      volumeMounts:
        - {name: cloudhsm-customer-ca, mountPath: /opt/cloudhsm/etc/customerCA.crt, subPath: customerCA.crt, readOnly: true}
      volumes:
        - {name: cloudhsm-customer-ca, configMap: {name: cloudhsm-customer-ca}}
      env:
        CONNECTOR_ID: <DFSP_ID>
        KEY_PROVIDER: pkcs11                    # the connector's default is vault-kv
        VAULT_URL: <VAULT_ADDRESS>              # VAULT_URL, not VAULT_ADDRESS, for the Java connector
        VAULT_ROLE: pivotal-<DFSP_ID>-connector
        VAULT_KV_MOUNT: pivotal-kv
        HSM_CRED_PATH: pivotal/hsmcred/<DFSP_ID>
        KEY_REF_PATH: pivotal/keyref
        CLOUDHSM_IP: <HSM_IP>
  ```

  - The connector image must be built with `PKCS11_BACKEND=cloudhsm`
    ([Prerequisites](1-prerequisites.md), Step 2).
  - `PKCS11_MODULE_PATH` does nothing on a connector. Its image entrypoint configures the JCE
    provider from `CLOUDHSM_IP`.
  - The connector reads its key **once, at startup**, and only when `FSPIOP_USE_JWS=true`. Restart it after its key is created or
    changed.

### Step 5. Install or upgrade the release

- **Command or Configuration:**

  ```bash
  helm upgrade --install pivotal-stack <CHART> -n pivotal -f <VALUES_FILE>
  for d in web-outbound web-pivotal web-inbound trust-manager; do
    kubectl -n pivotal rollout status deploy/$d --timeout=5m
  done
  ```

- **Expected Result:** each rollout reports `successfully rolled out`.
- **If It Fails:** read the failing pod's log: `kubectl -n pivotal logs deploy/<NAME> --tail=50`.
  See [Troubleshooting](#troubleshooting) for the web-outbound startup errors of this profile.

### Step 6. Check trust-manager started its jobs

- **Purpose:** trust-manager drives every Hub-facing certificate. Confirm it works before going
  further.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/trust-manager --since=10m | grep -E \
    'scheduled every|DFSP CA will not|Enrolled a Hub-signed|Registered the Pivotal CA|failed|Could not register'
  ```

- **Expected Result:** the job start lines, `Enrolled a Hub-signed server certificate for
  '<HUB_CLIENT_CERT_COMMON_NAME>' into Secret 'pivotal-hub-client-cert'.` and `Registered the
  Pivotal CA with MCM for '<PIVOTAL_DFSP_ID>'.` The full list is in
  [Scheduled jobs](../../reference/scheduled-jobs.md).
- **If It Fails:** see [Troubleshooting: trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm).
  The Hub client certificate is checked only once a day. After fixing a failed first enrolment,
  run `kubectl -n pivotal rollout restart deploy/trust-manager` so it tries again now.

### Step 7. Check the profile is in effect

- **Purpose:** prove web-outbound signs through the HSM and holds no private key.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal exec deploy/web-outbound -- printenv KEY_PROVIDER HSM_CRED_PATH
  kubectl -n pivotal logs deploy/web-outbound | grep -E 'CloudHSM client configured|PKCS#11 ready|Signing through PKCS#11'
  ```

- **Expected Result:** `pkcs11` and `pivotal/hsmcred/web-outbound`, then these three log lines.
  web-outbound logs in to the HSM at startup because `HSM_CRED_PATH` is set, even while
  `FSPIOP_USE_JWS` is still off:

  ```text
  CloudHSM client configured for <HSM_IP>.
  PKCS#11 ready: 4 sessions on token '<TOKEN_LABEL>' via /opt/cloudhsm/lib/libcloudhsm_pkcs11.so (thread pool 4).
  Signing through PKCS#11 as 'cu_web_outbound', credential from Vault path 'pivotal/hsmcred/web-outbound'.
  ```

- **If It Fails:** the pod would not be running: web-outbound refuses to start rather than sign in
  software. See [Troubleshooting](#troubleshooting).

## Verification

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | Pods running | `kubectl -n pivotal get pods` | All `Running`, none restarting |
| 2 | Hub client certificate issued by the Hub CA | `kubectl -n pivotal get secret pivotal-hub-client-cert -o jsonpath='{.data.tls\.crt}' \| base64 -d \| openssl x509 -noout -subject -issuer -enddate` | Subject has your common name; issuer is the Hub CA; end date in the future |
| 3 | Hub CA bundle present | `kubectl -n pivotal get secret hub-ca-bundle -o jsonpath='{.data.hub-ca\.pem}' \| base64 -d \| openssl x509 -noout -subject` | The Hub CA's subject |
| 4 | Profile check | Step 7 | As described |
| 5 | Vault logins (in a shell with `VAULT_ADDR` and an admin token) | `vault write -field=token_policies auth/kubernetes/login role=pivotal-web-outbound jwt="$(kubectl -n pivotal create token web-outbound)"` | `[default pivotal-web-outbound]` |
| 6 | web-pivotal on the profile | `kubectl -n pivotal exec deploy/web-pivotal -- printenv KEY_PROVIDER` | `pkcs11` |

**Negative test (roles are not interchangeable):**

```bash
vault write -field=token_policies auth/kubernetes/login role=pivotal-trust-manager \
  jwt="$(kubectl -n pivotal create token web-outbound)"
```

Pass: Vault refuses with `service account name not authorized`.

The profile check for a tenant's key (its key record in Vault, its private key in the HSM and not in
the database) is part of [Onboard a DFSP (pkcs11)](../../runbooks/pkcs11/onboard-dfsp.md).

## Troubleshooting

web-outbound startup errors under `pkcs11`, from its log:

| Message | Cause | Fix |
|---|---|---|
| `KEY_PROVIDER is 'pkcs11' and HSM_CRED_PATH is set, but the device is not configured. Set PKCS11_MODULE_PATH.` | `PKCS11_MODULE_PATH` missing | Step 3 |
| `KEY_PROVIDER is 'pkcs11' but Vault is not configured.` | `VAULT_ADDRESS` or `VAULT_ROLE` missing | Step 3 |
| `KEY_PROVIDER is 'pkcs11' and FSPIOP_USE_JWS is true, so this service signs and needs its own crypto user. Set HSM_CRED_PATH …` | `HSM_CRED_PATH` missing on a signing web-outbound | Step 3 |
| `FSPIOP_USE_JWS is true but KEY_PROVIDER is not set. …` | `KEY_PROVIDER` missing on web-outbound | Step 3 |
| `No crypto-user password at Vault path 'pivotal/hsmcred/web-outbound' field 'password'.` | Credential not in Vault, wrong `VAULT_KV_MOUNT`, or policy does not allow the read | [Prepare the CloudHSM cluster](2-hsm.md), Step 8; [Configure Vault](4-vault.md) |
| `CLOUDHSM_IP is set but /opt/cloudhsm/etc/customerCA.crt is missing.` | ConfigMap not mounted | Steps 2 and 3 |
| `N PKCS#11 tokens are present … and no token label is configured.` | Not expected on CloudHSM | Check `PKCS11_MODULE_PATH` points at the CloudHSM library |
| Login to the HSM fails | Password in Vault does not match the HSM | Reset `cu_web_outbound`'s password as a Crypto Officer and store the new one in Vault ([Prepare the CloudHSM cluster](2-hsm.md), Step 8) |

More: [Helm and deployment](../../troubleshooting.md#helm-and-deployment),
[HSM](../../troubleshooting.md#hsm), [Vault](../../troubleshooting.md#vault).

## Rollback or Recovery

- **Undo the release:** `helm rollback pivotal-stack <PREVIOUS_REVISION> -n pivotal`, or
  `helm uninstall pivotal-stack -n pivotal` for a first install. This leaves Vault, the HSM, the
  ceremony output, the Secret from Step 1 and the `cloudhsm-customer-ca` ConfigMap in place. A
  rollback to before `hsmTools` was enabled also removes the HSM admin pod's Deployment.
- **Do not switch an environment from `pkcs11` to another profile** after DFSPs are onboarded. Their
  keys exist only inside the HSM and cannot be exported.
- **The Hub client certificate stays valid in MCM** after an uninstall. Pivotal cannot revoke it.

## References

- [Environment variables](../../reference/environment-variables.md)
- [Helm values](../../reference/helm-values.md)
- [Scheduled jobs](../../reference/scheduled-jobs.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- Next: onboard two test DFSPs with [Onboard a DFSP (pkcs11)](../../runbooks/pkcs11/onboard-dfsp.md), then [Enable the DFSP-facing side](../common/enable-dfsp-facing.md)
