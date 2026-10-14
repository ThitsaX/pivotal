# Onboard a DFSP (vault-kv)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: vault-kv · Document version 1.0 (draft)

## Overview

This procedure adds one DFSP to a Pivotal deployment that uses the `vault-kv` profile. Onboarding
creates the DFSP in the Hub, records its access public key, and creates its Hub JWS signing key in
Vault. trust-manager then publishes the public key to MCM and turns signing on. Finally you issue the
DFSP's client certificate and add its connector.

Use it in two situations:

- **During setup**, right after [Deploy Pivotal](../../setup/vault-kv/4-deploy-pivotal.md), to
  onboard the test DFSPs the shared setup pages need. The steps marked *during setup* below tell you
  which settings to leave off until the later setup pages turn them on.
- **After setup**, to add each new DFSP.

## Objective

Make a new DFSP able to call Pivotal over mTLS with signed requests, and have Pivotal sign the DFSP's
messages to the Hub.

## Expected Outcome

- The DFSP is in the Hub and in MCM.
- The DFSP's Hub JWS signing key is in Vault, and its public key is in MCM.
- Signing is enabled for the DFSP.
- The DFSP has a client certificate whose subject is `CN=<DFSP_ID>`.
- A first request from the DFSP is accepted.

## Prerequisites

### Mandatory

- [Deploy Pivotal (vault-kv)](../../setup/vault-kv/4-deploy-pivotal.md) completed and verified.
- web-pivotal runs with `KEY_PROVIDER=vault-kv`, and its Vault role can create, read and update keys
  under the JWS key path and sign on the DFSP CA's `dfsp-client` role. See
  [Vault reference](../../reference/vault.md).
- trust-manager is running.
- The DFSP exists in MCM, **or** trust-manager runs with `MCM_AUTO_REGISTER_DFSPS=true`.
- A portal account with the permissions **participant.onboard**, **participant.certificate.enroll**
  and **participant.certificate.view**.
- From the DFSP:
  - its FSP ID (case-sensitive);
  - its currencies;
  - its **access public key** (PEM). The DFSP keeps the private key;
  - a **certificate signing request** (CSR, PEM, RSA key of at least 2048 bits). The DFSP keeps the
    private key.

### Optional

- `kubectl` access to the Pivotal namespace, to read logs.
- Vault CLI access with read access to key metadata, to confirm the key exists.

## Steps

### Step 1. Check that the DFSP can be registered in MCM

- **Purpose:** trust-manager cannot publish the DFSP's public key to MCM until the DFSP exists there.
- **Action:** Check whether trust-manager creates DFSPs in MCM itself.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal get deploy trust-manager \
    -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="MCM_AUTO_REGISTER_DFSPS")].value}'
  ```

- **Expected Result:** `true`. Otherwise, the Hub operator must create the DFSP in MCM before you
  continue.
- **If It Fails:** If MCM creates a Keycloak account for each DFSP, trust-manager also needs
  `MCM_DFSP_CONTACT_EMAIL`. See [Environment variables](../../reference/environment-variables.md).

### Step 2. Check the DFSP's access key and CSR

- **Purpose:** Catch a wrong file before it reaches the portal.
- **Action:** Check the access public key and the CSR.
- **Command or Configuration:**

  ```bash
  openssl pkey -pubin -in <ACCESS_PUBLIC_KEY_FILE> -noout -text | head -1
  openssl req -in <CSR_FILE> -noout -verify -text | grep "Public-Key"
  ```

- **Expected Result:** The key is an RSA public key. The CSR verifies and shows
  `Public-Key: (2048 bit)` or more.
- **If It Fails:** Ask the DFSP for new files. The subject of the CSR does not matter: Pivotal sets the
  certificate's subject to the FSP ID.

For a test DFSP only, you can create both yourself:

```bash
openssl genrsa -out <DFSP_ID>-access.key 2048
openssl rsa -in <DFSP_ID>-access.key -pubout -out <DFSP_ID>-access.pub
openssl req -new -newkey rsa:2048 -nodes -keyout <DFSP_ID>-client.key \
  -out <DFSP_ID>-client.csr -subj "/CN=<DFSP_ID>"
```

### Step 3. Onboard the DFSP

- **Purpose:** Create the DFSP in the Hub, record its access public key, and create its Hub JWS
  signing key.
- **Action:** In the portal, open **Participant → Onboard FSP**. Enter the FSP ID, currencies,
  endpoint and access public key. Submit.

  The **endpoint** is where the Hub sends this DFSP's callbacks, and it must reach web-inbound, never
  the DFSP's own system:

  - after setup: `https://<PIVOTAL_CALLBACK_HOST>`;
  - *during setup*, before [Enable the Hub-facing side: inbound](../../setup/common/enable-hub-facing-inbound.md):
    the address the Hub uses today to reach web-inbound. That page moves it to
    `https://<PIVOTAL_CALLBACK_HOST>`.
- **Command or Configuration (API alternative):** `POST /participant/onboard` on web-pivotal:

  ```json
  {
    "name": "<DFSP_ID>",
    "currencies": ["<CURRENCY>"],
    "endpoint": "https://<PIVOTAL_CALLBACK_HOST>",
    "accessPublicKey": "<ACCESS_PUBLIC_KEY_PEM>"
  }
  ```

  You do not supply a signing key. web-pivotal creates it and writes the private key to Vault. The
  private key is never returned.
- **Expected Result:** The portal reports success. web-pivotal logs:

  ```bash
  kubectl -n pivotal logs deploy/web-pivotal --since=10m | grep "<DFSP_ID>"
  ```

  ```text
  Provisioned a signing key for '<DFSP_ID>' at Vault path '<PATH>'.
  Provisioned '<DFSP_ID>' as a signing tenant. Signing stays off until its public key is published to MCM.
  Announced '<DFSP_ID>' as a signing tenant awaiting publication.
  ```

- **If It Fails:**
  - `Writing 'privateKey' to Vault path '<PATH>' failed …` or `… was refused by Vault …`: web-pivotal's
    Vault policy does not allow writing the key. See [Vault](../../troubleshooting.md#vault).
  - `Could not announce signing tenant '<DFSP_ID>' …`: not an error. trust-manager publishes the key on
    its next hourly run instead.
  - If the DFSP already has a public key on record, onboarding keeps it and logs
    `'<DFSP_ID>' already holds a signing key; leaving it in place. Rotate deliberately rather than by re-onboarding.`

### Step 4. Confirm that the key is published and signing is on

- **Purpose:** Signing starts only after MCM confirms it holds the DFSP's public key.
- **Action:** Check trust-manager's log.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/trust-manager --since=10m | grep "<DFSP_ID>"
  ```

- **Expected Result:** Within seconds (or within an hour without NATS):

  ```text
  Registered '<DFSP_ID>' as a DFSP in MCM.            (only when MCM_AUTO_REGISTER_DFSPS=true)
  '<DFSP_ID>' is published to MCM and signing is now enabled.
  ```

  On the hourly run, the second line reads instead:
  `'<DFSP_ID>' was published to MCM but never switched on; signing is now enabled. Its provisioning announcement was missed.`

  In the portal, **Participant → JWS Policy** for the DFSP shows signing enabled.
- **If It Fails:** See [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm). Do not
  turn signing on by hand before the key is in MCM: the Hub would reject every signed message.

Optionally, confirm the key exists in Vault without printing it:

```bash
vault kv metadata get <VAULT_KV_MOUNT>/<VAULT_JWS_KEY_PATH_PREFIX>/<DFSP_ID>
```

Expected: metadata with `current_version` 1 or higher. Do not run `vault kv get` on this path: it
prints the private key.

### Step 5. Issue the DFSP client certificate

*During setup*: skip this step. [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md),
Step 5, issues each test DFSP's certificate. Issuing one here as well would move this one to
`retiring`.

- **Purpose:** The DFSP needs a certificate from the DFSP CA to connect to the DFSP-facing gateway.
- **Action:** In the portal, open **Participant → Certificates**. Enter the FSP ID, paste the CSR,
  optionally add a note, and select **Sign request**. Then select **Download** on the new row.
- **Command or Configuration (API alternative):** `POST /participant/certificates` on web-pivotal:

  ```json
  {"fspId": "<DFSP_ID>", "csrPem": "<CSR_PEM>", "note": "<NOTE>"}
  ```

- **Expected Result:** The new certificate is listed as `active`. The downloaded file holds the
  certificate and its CA chain. Check the subject:

  ```bash
  openssl x509 -in <DOWNLOADED_FILE> -noout -subject -issuer -enddate
  ```

  The subject contains `CN = <DFSP_ID>`. The certificate is valid for one year.
- **If It Fails:**
  - `No participant is registered with that identifier.`: onboard the DFSP first (Step 3), and check
    the FSP ID's case.
  - `The certificate signing request could not be read. …`: the CSR is not a PEM PKCS#10 request.
  - `The certificate signing request uses a key that is too small. …`: the DFSP must use RSA 2048 or
    larger.
  - `This deployment does not issue DFSP certificates. Configure the DFSP-facing CA first.`: web-pivotal
    has no DFSP CA settings. See [Environment variables](../../reference/environment-variables.md).
  - `The certificate could not be issued. …`: check web-pivotal's log. A message that the CA
    `issued a certificate for '<NAME>' when '<DFSP_ID>' was requested` means the `dfsp-client` role
    does not set `use_csr_common_name=false`. Fix the role (see your CA ceremony page). The
    certificate was not recorded.

Send the downloaded file to the DFSP. If the DFSP already had a certificate, the old one moves to
`retiring` and stays accepted until it expires.

### Step 6. Add the DFSP's connector

- **Purpose:** Each DFSP has one connector. It sends the DFSP's callbacks to the Hub (leg 3) and signs
  them with the DFSP's key.
- **Action:**
  1. Create a Vault policy that lets the connector read **only its own** key, and a Kubernetes auth
     role bound to the connector's ServiceAccount. The names match
     [Configure Vault](../../setup/vault-kv/3-vault.md):

     ```bash
     vault policy write pivotal-<DFSP_ID>-connector - <<'EOF'
     path "pivotal-kv/data/pivotal/jwskey/<DFSP_ID>" { capabilities = ["read"] }
     EOF

     vault write auth/kubernetes/role/pivotal-<DFSP_ID>-connector \
       bound_service_account_names=<DFSP_ID>-connector \
       bound_service_account_namespaces=pivotal \
       policies=pivotal-<DFSP_ID>-connector
     ```

  2. Add an entry to the `connectors` list in your Helm values:

     ```yaml
     connectors:
       - name: <DFSP_ID>-connector
         enabled: true
         serviceAccount: {create: true, name: <DFSP_ID>-connector}
         env:
           CONNECTOR_ID: <DFSP_ID>
           KEY_PROVIDER: vault-kv
           VAULT_URL: <VAULT_ADDRESS>                # VAULT_URL, not VAULT_ADDRESS
           VAULT_ROLE: pivotal-<DFSP_ID>-connector
           VAULT_KV_MOUNT: pivotal-kv
           VAULT_JWS_KEY_PATH_PREFIX: pivotal/jwskey
           FSPIOP_USE_JWS: "true"                    # during setup: "false" until outbound Step 5
     ```

     Without the `serviceAccount` line the pod runs as `default`, and the Vault role above never
     matches. Add the Hub mTLS mounts and settings from
     [Enable the Hub-facing side: outbound, Step 3](../../setup/common/enable-hub-facing-outbound.md#step-3-configure-each-connector-for-mtls)
     once that page has been completed (*during setup*: leave them out until you reach that step).
     The connector's other, non-security settings are outside this guide.
  3. Deploy with Helm. Create the Vault role **before** the connector starts.
- **Expected Result:** The connector pod is `Running`. With `FSPIOP_USE_JWS: "true"`, it logs
  `Loaded the JWS signing key for '<DFSP_ID>' from Vault path '<PATH>'`.
- **If It Fails:**
  - `No JWS signing key at Vault path '<PATH>'. Outbound FSPIOP callbacks will be sent unsigned.`: no
    key exists at that path. Check `CONNECTOR_ID` and the prefix, then restart the connector: it reads
    the key only at startup.
  - The connector stops with `fspiopUseJws is enabled but Vault is not configured. Set vaultUrl and vaultRole.`:
    set `VAULT_URL` and `VAULT_ROLE`.

## Verification

*During setup*, Steps 3 to 6 are the checks; the shared setup pages and the
[end-to-end check](../../setup/common/end-to-end-check.md) then prove the rest. After setup:

- **Positive:**
  - The DFSP sends a request to the DFSP-facing gateway with its new certificate and a signed
    `authorization` header. It is accepted.
  - A transfer from the DFSP completes. The Hub accepts Pivotal's signed requests for it.
- **Negative:**
  - A request with this DFSP's certificate but another DFSP's `FSPIOP-Source` is refused with `3105`
    `The client certificate does not belong to the participant named in fspiop-source.`
  - A request whose `authorization` header is signed with a different key is refused with `3105`
    `Authorization signature verification failed.`

## Troubleshooting

- [Leg 1: DFSP-facing](../../troubleshooting.md#leg-1-dfsp-facing)
- [Legs 2 and 3: Hub-facing outbound](../../troubleshooting.md#legs-2-and-3-hub-facing-outbound)
- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- [Vault](../../troubleshooting.md#vault)
- **Onboarding succeeded but the DFSP was never published.** Check MCM has the DFSP (Step 1), then
  wait for trust-manager's hourly run or restart trust-manager.

## Rollback or Recovery

There is no offboarding command in this version. See
[Known limitations](../../known-limitations.md#no-dfsp-offboarding).

- **Certificate issued to the wrong DFSP or from the wrong CSR:** revoke it. See
  [Revoke a DFSP certificate](../common/revoke-dfsp-certificate.md).
- **Wrong access public key:** replace it with `PUT /participant/access-key`.
- **Signing must stop for this DFSP:** turn signing off in **Participant → JWS Policy**. trust-manager
  does not turn it back on.
- **Wrong endpoint or missing currency:** use **Participant → Register Endpoint** or
  **Participant → Add Currency**. Neither changes the signing key.

## References

*During setup*, next: [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md), once both
test DFSPs are onboarded.

- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Vault reference](../../reference/vault.md)
- [Scheduled jobs](../../reference/scheduled-jobs.md)
- [Revoke a DFSP certificate](../common/revoke-dfsp-certificate.md)
