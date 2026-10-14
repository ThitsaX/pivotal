# 4. Deploy Pivotal (vault-kv)

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: vault-kv · Document version 1.0 (draft)

## Overview

This page installs Pivotal with the Helm chart, configured for the `vault-kv` profile, with
trust-manager enabled. Every security control stays **off** at this point. The pages that follow turn
them on one leg at a time.

The values shown here are only the ones this guide depends on. Every other setting a service needs
(database, Redis, NATS, ledger and oracle URLs) is listed in
[Environment variables](../../reference/environment-variables.md) and
[Helm values](../../reference/helm-values.md).

## Objective

Run all Pivotal services with signing keys held in Vault KV, and prove the profile is in effect.

## Expected Outcome

- All Pivotal pods are `Running`.
- web-outbound and web-pivotal run with `KEY_PROVIDER=vault-kv` and can log in to Vault.
- trust-manager has enrolled the Hub client certificate into Secret `pivotal-hub-client-cert`,
  written the Hub CA bundle into Secret `hub-ca-bundle`, and registered the Pivotal Hub-client CA
  with MCM.
- After the first DFSP is onboarded, its signing key is in Vault and **not** in the database.

## Prerequisites

### Mandatory

- [3. Vault](./3-vault.md) completed and verified.
- Secret `pivotal-hub-client-ca` exists in the Pivotal namespace ([CA ceremony, Step 7](./2-ca-ceremony.md#step-7-check-the-pivotal-hub-client-ca-secret)).
- The Hub operator's items H1 to H4 are in place ([Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md#step-1-agree-the-hub-operators-items)).
- The Pivotal Helm chart 0.3.0 and the image tags for your release.
- The non-security settings for each service (database, Redis, NATS, ledger and oracle URLs).

### Optional

- None.

## Steps

### Step 1. Create the MCM credential Secret

- **Purpose:** trust-manager reads its MCM client secret from a Secret, never from the values file.
- **Action:** Create the Secret. Type the secret at the prompt so it does not enter shell history.
- **Command or Configuration:**

  ```bash
  read -r -s -p "MCM client secret: " S; echo
  kubectl -n pivotal create secret generic trust-manager-mcm --from-literal=MCM_CLIENT_SECRET="$S"
  unset S
  ```

- **Expected Result:** `secret/trust-manager-mcm created`
- **If It Fails:** `already exists`: replace it only if the value has changed.

### Step 2. Write the security settings into your values file

- **Purpose:** Select the `vault-kv` profile and give each service its Vault identity.
- **Action:** Add these blocks to your values file, alongside your other settings. Values in
  `<ANGLE_CAPS>` come from your worksheet.
- **Command or Configuration:**

  ```yaml
  global:
    commonFspiopEnv:
      FSPIOP_SWITCH_ID: <FSPIOP_SWITCH_ID>

  webOutbound:
    env:
      # Key profile. Unset means no keys; with FSPIOP_USE_JWS "true", web-outbound refuses to start.
      KEY_PROVIDER: vault-kv
      VAULT_ADDRESS: <VAULT_ADDRESS>
      VAULT_AUTH_METHOD: kubernetes
      VAULT_ROLE: pivotal-web-outbound
      VAULT_KV_MOUNT: pivotal-kv               # the default, "secret", is not Pivotal's mount
      VAULT_JWS_KEY_PATH_PREFIX: pivotal/jwskey
      # Off for now. Pages 5 and 6 turn these on.
      FSPIOP_USE_JWS: "false"
      FSPIOP_USE_MUTUAL_TLS: "false"
      FSPIOP_TLS_VERIFY_SERVER_CERT: "true"
      FSPIOP_TLS_VERIFY_DOMAIN: "true"
      DFSP_FACING_MTLS_MANDATORY: "false"
      # The Hub endpoints you use today. Page 7 (outbound) moves them to the Hub API gateway.
      FSPIOP_PARTIES_URL: <CURRENT_HUB_PARTIES_URL>
      FSPIOP_QUOTES_URL: <CURRENT_HUB_QUOTES_URL>
      FSPIOP_TRANSFERS_URL: <CURRENT_HUB_TRANSFERS_URL>

  webPivotal:
    env:
      # Onboarding creates each DFSP's signing key here. Must match web-outbound.
      KEY_PROVIDER: vault-kv
      VAULT_ADDRESS: <VAULT_ADDRESS>
      VAULT_AUTH_METHOD: kubernetes
      VAULT_ROLE: pivotal-web-pivotal
      VAULT_KV_MOUNT: pivotal-kv
      VAULT_JWS_KEY_PATH_PREFIX: pivotal/jwskey
      # DFSP client certificate issuance (leg 1).
      DFSP_CERT_PKI_MOUNT: pki_dfsp
      DFSP_CERT_PKI_ROLE: dfsp-client

  webInbound:
    env:
      FSPIOP_USE_JWS: "false"          # page 8 (inbound) turns verification on
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

  - `HUB_SERVER_CERT_*` configure the **Hub client certificate**. The names say "server" for
    historical reasons; the certificate is the one Pivotal presents to the Hub.
  - `<HUB_CLIENT_CERT_COMMON_NAME>` is the name on that certificate. Agree it with the Hub operator.
    Pivotal's public host name is a common choice.
  - `MCM_AUTO_REGISTER_DFSPS: "true"` makes trust-manager create Pivotal and each DFSP in MCM. Only
    `true` or `false` are accepted; anything else stops trust-manager from starting. If the Hub's
    MCM creates a Keycloak account per DFSP, also set `MCM_DFSP_CONTACT_EMAIL`.
  - trust-manager and web-inbound ignore `KEY_PROVIDER`. Do not add it to them.

- **Expected Result:** A values file that renders. Check it with
  `helm template pivotal-stack <CHART> -n pivotal -f <VALUES_FILE> > /dev/null`.
- **If It Fails:** Helm names the missing value. `image.repository is required` or
  `image.tag is required` means an image block is incomplete.

### Step 3. Install or upgrade the release

- **Purpose:** Deploy the services.
- **Action:** Run Helm.
- **Command or Configuration:**

  ```bash
  helm upgrade --install pivotal-stack <CHART> -n pivotal -f <VALUES_FILE>
  for d in web-outbound web-pivotal web-inbound trust-manager; do
    kubectl -n pivotal rollout status deploy/$d --timeout=5m
  done
  ```

- **Expected Result:** Each rollout reports `successfully rolled out`.
- **If It Fails:** Read the failing pod's log: `kubectl -n pivotal logs deploy/<NAME> --tail=50`.
  A line starting `Missing required environment variable:` names the setting to add.

### Step 4. Check trust-manager started its jobs

- **Purpose:** trust-manager drives every Hub-facing certificate. Confirm it is working before you go
  further.
- **Action:** Read its log.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/trust-manager --since=10m | grep -E \
    'scheduled every|DFSP CA will not|Enrolled a Hub-signed|Registered the Pivotal CA|failed|Could not register'
  ```

- **Expected Result:** These lines, in any order:

  ```text
  Hub CA sync scheduled every 60m.
  Peer JWS sync scheduled every 300s.
  Hub server certificate check scheduled every 24h, renewing 30 days before expiry.
  MCM CA registration reconcile scheduled every 60m.
  JWS key publish scheduled every 60m.
  No DFSP-facing gateway configured; the DFSP CA will not be published.
  Enrolled a Hub-signed server certificate for '<HUB_CLIENT_CERT_COMMON_NAME>' into Secret 'pivotal-hub-client-cert'.
  Registered the Pivotal CA with MCM for '<PIVOTAL_DFSP_ID>'.
  ```

  The "DFSP CA will not be published" line is expected until page 6 (DFSP-facing).

- **If It Fails:**
  - A line ending `was rejected. Three things make MCM answer this way: …` (for example after
    `Hub CA sync failed; retrying next tick:`): the token lacks the `connection-manager-api` audience
    or the `groups` claim, or its issuer does not match the one MCM expects.
  - `Could not register the Pivotal CA for '<ID>': …`: MCM refused the CA registration. A `404`
    usually means the participant does not exist in MCM; check `MCM_AUTO_REGISTER_DFSPS`.
  - `Hub CA sync failed` or `MCM did not sign enrollment`: the Hub CA is missing in MCM (item H4).
  - **The Hub client certificate is checked only once a day.** After you fix a failed first
    enrollment, run `kubectl -n pivotal rollout restart deploy/trust-manager` so it tries again now.
  - More entries: [Trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm).

### Step 5. Check the profile is in effect

- **Purpose:** Prove that signing keys will be read from and written to Vault, not the database.
- **Action:** Check the setting in the running pods, then prove each service can log in to Vault with
  its own role.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal exec deploy/web-outbound -- printenv KEY_PROVIDER VAULT_KV_MOUNT
  kubectl -n pivotal exec deploy/web-pivotal  -- printenv KEY_PROVIDER VAULT_KV_MOUNT

  for pair in web-outbound:pivotal-web-outbound web-pivotal:pivotal-web-pivotal trust-manager:pivotal-trust-manager; do
    sa=${pair%%:*}; role=${pair##*:}
    echo "$sa -> $(vault write -field=token_policies auth/kubernetes/login role=$role \
      jwt="$(kubectl -n pivotal create token $sa)")"
  done
  ```

- **Expected Result:** `vault-kv` and `pivotal-kv` for both services, then each ServiceAccount listed
  with its policy, for example `web-outbound -> [default pivotal-web-outbound]`.
- **If It Fails:**
  - `printenv` shows nothing for `KEY_PROVIDER`: the value is not in the rendered Deployment. Check
    indentation under `env:`.
  - `service account name not authorized`: the role's bound ServiceAccount or namespace does not
    match. Compare with `kubectl -n pivotal get sa`.
  - `could not load backend configuration` on login: Kubernetes auth is enabled but not configured
    ([Vault, Step 2](./3-vault.md#step-2-enable-kubernetes-authentication)).
  - `permission denied` on login: Vault could not validate the ServiceAccount token (a TokenReview
    failure). Check the reviewer rights and Kubernetes host set in
    [Vault, Step 2](./3-vault.md#step-2-enable-kubernetes-authentication).

The login commands print only the policy list, never the token. Each login creates a token that
expires after the role's TTL.

## Verification

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | Pods running | `kubectl -n pivotal get pods` | All `Running`, none restarting |
| 2 | Hub client certificate issued by the Hub CA | `kubectl -n pivotal get secret pivotal-hub-client-cert -o jsonpath='{.data.tls\.crt}' \| base64 -d \| openssl x509 -noout -subject -issuer -enddate` | Subject has your common name; issuer is the Hub CA; end date in the future |
| 3 | Hub CA bundle present | `kubectl -n pivotal get secret hub-ca-bundle -o jsonpath='{.data.hub-ca\.pem}' \| base64 -d \| openssl x509 -noout -subject` | The Hub CA's subject |
| 4 | Profile check | Step 5 | As described |

**Negative test (roles are not interchangeable):**

```bash
vault write -field=token_policies auth/kubernetes/login role=pivotal-trust-manager \
  jwt="$(kubectl -n pivotal create token web-outbound)"
```

Pass: Vault refuses with `service account name not authorized`.

**Profile check after the first DFSP.** Complete this after you onboard the first DFSP with
[Onboard a DFSP (vault-kv)](../../runbooks/vault-kv/onboard-dfsp.md):

1. web-pivotal logged the key's location:

   ```bash
   kubectl -n pivotal logs deploy/web-pivotal --since=1h | grep 'Provisioned a signing key'
   ```

   Pass: `Provisioned a signing key for '<DFSP_ID>' at Vault path 'pivotal/jwskey/<DFSP_ID>'.`

2. The key exists in Vault. This reads metadata only; it does not print the key:

   ```bash
   vault kv metadata get pivotal-kv/pivotal/jwskey/<DFSP_ID>
   ```

   Pass: a `current_version` of 1 or more.

3. The database holds no private key for it. In the Pivotal database:

   ```sql
   SELECT fsp_id, role, jws_private_key IS NULL AS no_private_key_in_db
   FROM participant_key WHERE fsp_id = '<DFSP_ID>';
   ```

   Pass: `role` is `self` and `no_private_key_in_db` is `1`. A `0` means the DFSP was onboarded with
   the `database` profile: stop, and check `KEY_PROVIDER` on web-pivotal.

## Troubleshooting

- [Helm and deployment](../../troubleshooting.md#helm-and-deployment)
- [Trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- [Vault](../../troubleshooting.md#vault)

## Rollback or Recovery

- **Undo the release:** `helm rollback pivotal-stack <PREVIOUS_REVISION> -n pivotal`, or
  `helm uninstall pivotal-stack -n pivotal` for a first install. This leaves Vault, the ceremony
  output and the Secrets from Step 1 and the ceremony in place.
- **The Hub client certificate stays valid in MCM** after an uninstall. Pivotal cannot revoke it.
  Deleting the Secret `pivotal-hub-client-cert` makes trust-manager enrol a new one on its next start.

## References

- [Environment variables](../../reference/environment-variables.md)
- [Helm values](../../reference/helm-values.md)
- [Scheduled jobs](../../reference/scheduled-jobs.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- Next: [5. Onboard test DFSPs](../../runbooks/vault-kv/onboard-dfsp.md), then [6. Enable DFSP-facing mTLS and JWS](../common/enable-dfsp-facing.md)
