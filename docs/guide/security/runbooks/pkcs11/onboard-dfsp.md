# Onboard a DFSP (pkcs11)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

This procedure adds one DFSP to a Pivotal deployment that uses the `pkcs11` profile. It has two
parts, done by different people:

1. **A custodian provisions the DFSP's key in the HSM.** In the
   [HSM admin pod](../../setup/pkcs11/hsm-admin-pod.md), the script `provision-hsm-tenant.sh`
   creates the DFSP's crypto user, generates its Hub JWS signing key inside the HSM as that user,
   shares the key with `cu_web_outbound`, and writes the key reference and the public key to Vault.
2. **An operator onboards the DFSP in the portal.** web-pivotal reads the key reference and public
   key from Vault and records the public key. It creates nothing in the HSM. trust-manager then
   publishes the public key to MCM and turns signing on. Finally you issue the DFSP's client
   certificate and add its connector.

Portal onboarding refuses a DFSP whose key has not been provisioned, **before** it creates anything
at the Hub.

**The crypto user's name** is `cu_` followed by the FSP ID, with every character other than a letter
or a digit turned into `_`. For example, `dfsp-a` gets `cu_dfsp_a`. The HSM shows names in lower
case, so FSP IDs that differ only in case, or only in `-` versus `_`, would share one crypto user:
avoid them. The script prints the name it uses (`Provisioning '<DFSP_ID>' (crypto user '…')`); this
page calls it `<CRYPTO_USER>`.

Use it in two situations:

- **During setup**, right after [Deploy Pivotal](../../setup/pkcs11/5-deploy-pivotal.md), to onboard
  the test DFSPs the shared setup pages need. The steps marked *during setup* below tell you which
  settings to leave off until the later setup pages turn them on.
- **After setup**, to add each new DFSP.

## Objective

Make a new DFSP able to call Pivotal over mTLS with signed requests, and have Pivotal sign the DFSP's
messages to the Hub with a key that exists only inside the HSM.

## Expected Outcome

- The DFSP's crypto user `<CRYPTO_USER>` owns a non-extractable signing key in the HSM, shared with
  `cu_web_outbound`.
- Vault holds the DFSP's crypto-user credential, key reference and public key.
- The DFSP is in the Hub and in MCM, and MCM holds its public key.
- Signing is enabled for the DFSP, and Pivotal's database holds no private key for it.
- The DFSP has a client certificate whose subject is `CN=<DFSP_ID>`.
- A first request from the DFSP is accepted.

## Prerequisites

### Mandatory

- [Deploy Pivotal (pkcs11)](../../setup/pkcs11/5-deploy-pivotal.md) completed and verified, with
  web-pivotal on `KEY_PROVIDER=pkcs11`.
- A custodian with a Crypto Officer login, and a Vault token carrying the `pivotal-hsm-provisioning`
  policy ([Configure Vault](../../setup/pkcs11/4-vault.md), Step 3).
- `kubectl` access to start an [HSM admin pod](../../setup/pkcs11/hsm-admin-pod.md) session.
- A Vault administrator, for the connector's policy and role in Step 7. The custodian's
  `pivotal-hsm-provisioning` token cannot write policies or roles. The `vault` CLI must reach Vault;
  see [Prerequisites](../../setup/pkcs11/1-prerequisites.md#step-3-check-your-workstation-tools).
- trust-manager is running.
- The DFSP exists in MCM, **or** trust-manager runs with `MCM_AUTO_REGISTER_DFSPS=true`.
- A portal account with the permissions **participant.onboard**, **participant.certificate.enroll**
  and **participant.certificate.view**.
- From the DFSP:
  - its FSP ID (case-sensitive; letters, digits, `-` and `_`, starting with a letter or digit, 2 to
    31 characters);
  - its currencies;
  - its **access public key** (PEM). The DFSP keeps the private key;
  - a **certificate signing request** (CSR, PEM, RSA key of at least 2048 bits). The DFSP keeps the
    private key.

### Optional

None. Step 3 checks the key's owner and sharing itself.

## Steps

### Step 1. Check that the DFSP can be registered in MCM

- **Purpose:** trust-manager cannot publish the DFSP's public key to MCM until the DFSP exists there.
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

- **Purpose:** catch a wrong file before it reaches the portal.
- **Command or Configuration:**

  ```bash
  openssl pkey -pubin -in <ACCESS_PUBLIC_KEY_FILE> -noout -text | head -1
  openssl req -in <CSR_FILE> -noout -verify -text | grep "Public-Key"
  ```

- **Expected Result:** the key is an RSA public key. The CSR verifies and shows
  `Public-Key: (2048 bit)` or more.
- **If It Fails:** ask the DFSP for new files. The subject of the CSR does not matter: Pivotal sets the
  certificate's subject to the FSP ID.

For a test DFSP only, you can create both yourself:

```bash
openssl genrsa -out <DFSP_ID>-access.key 2048
openssl rsa -in <DFSP_ID>-access.key -pubout -out <DFSP_ID>-access.pub
openssl req -new -newkey rsa:2048 -nodes -keyout <DFSP_ID>-client.key \
  -out <DFSP_ID>-client.csr -subj "/CN=<DFSP_ID>"
```

### Step 3. Provision the DFSP's key in the HSM (custodian)

- **Purpose:** create the key where only the DFSP's own crypto user owns it, and record what
  onboarding needs.
- **Action:** start an [HSM admin pod session](../../setup/pkcs11/hsm-admin-pod.md#step-4-start-a-session),
  then run the script. It prompts for the Vault token (unless `VAULT_TOKEN` is already set) and for
  the Crypto Officer login.
- **Command or Configuration (in the pod):**

  ```bash
  provision-hsm-tenant.sh <DFSP_ID>
  ```

  Use `CRYPTO_USER=<NAME> provision-hsm-tenant.sh <DFSP_ID>` only for a DFSP whose crypto user was
  created before this script existed under a different name.
- **Expected Result:**

  ```text
  Provisioning '<DFSP_ID>' (crypto user '<CRYPTO_USER>')
    credential written: pivotal-kv/pivotal/hsmcred/<DFSP_ID>
    crypto user created: <CRYPTO_USER>
    key generated in the HSM: <DFSP_ID>-jws-<TIMESTAMP>
    shared with cu_web_outbound
    key reference and public key recorded: pivotal-kv/pivotal/keyref/<DFSP_ID>
  ── verification ─────────────────────────────────
  …
  keyRef in Vault:     <DFSP_ID>-jws-<TIMESTAMP>
  publicKey in Vault:  matches the HSM
  ```

  In the `key list` output above the last lines, confirm the key's owner is `<CRYPTO_USER>` (the HSM shows it in lower case), it is
  shared with `cu_web_outbound`, and `extractable` is `false`. Then end the session
  ([Step 6 of the HSM admin pod page](../../setup/pkcs11/hsm-admin-pod.md#step-6-end-the-session)).
- **If It Fails:**
  - `REFUSING: VAULT_ADDR is not set.`: the script was run outside the admin pod, or the pod has no
    `hsmTools.vaultAddress`.
  - `REFUSING: '<DFSP_ID>' is not a safe fspId …`: the FSP ID has a character other than letters,
    digits, `-` and `_`, or does not start with a letter or digit.
  - `REFUSING: this Vault token is not valid, or Vault is not reachable at <VAULT_ADDRESS>.`: the token
    has expired or was mistyped, or the pod cannot reach Vault. Get a new custodian token and run
    again. Nothing was changed.
  - `REFUSING: '<DFSP_ID>' already has key '<KEY_REF>' but no public key in pivotal-kv/pivotal/keyref/<DFSP_ID>.`:
    the DFSP was provisioned before the script recorded public keys. It already has a key, which its
    connector and web-outbound sign with. Nothing was changed; do not provision it again.
  - `REFUSING: pivotal-kv/pivotal/hsmcred/<DFSP_ID> already holds a credential, but no crypto user '<CRYPTO_USER>' exists.`:
    the DFSP's crypto user has another name, for example one created before this script. Run again
    with `CRYPTO_USER=<EXISTING_NAME>`. Nothing was changed.
  - `'<DFSP_ID>' is already provisioned with key '<KEY_REF>'. Nothing to do.`: not an error. Go on to
    Step 4.
  - `crypto user '<CRYPTO_USER>' already exists; using its credential from Vault`: an earlier run
    stopped part-way. The script carries on with the existing user.
  - `FAILED: no password readable at …`: the Vault token cannot read the credential path (check it
    carries `pivotal-hsm-provisioning`), or the crypto user was created by hand with no credential in
    Vault. In the second case, use `CRYPTO_USER=` for the right user, or have a Crypto Officer reset its
    password and write it to that path.
  - A JSON error from `cloudhsm-cli`: a wrong Crypto Officer login, or an HSM problem. The script
    prints the device's own message. See [HSM](../../troubleshooting.md#hsm).

The script is safe to re-run. It never creates a second crypto user for a DFSP, and a DFSP that is
already provisioned is left alone.

### Step 4. Onboard the DFSP

- **Purpose:** create the DFSP in the Hub, record its access public key, and record the public half of
  the key the custodian provisioned.
- **Action:** in the portal, open **Participant → Onboard FSP**. Enter the FSP ID, currencies,
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

  You do not supply a signing key. web-pivotal reads the public key from
  `pivotal-kv/pivotal/keyref/<DFSP_ID>`.
- **Expected Result:** the portal reports success. web-pivotal logs:

  ```bash
  kubectl -n pivotal logs deploy/web-pivotal --since=10m | grep "<DFSP_ID>"
  ```

  ```text
  Recorded the HSM key '<DFSP_ID>-jws-<TIMESTAMP>' that a custodian provisioned for '<DFSP_ID>'.
  Provisioned '<DFSP_ID>' as a signing tenant. Signing stays off until its public key is published to MCM.
  Announced '<DFSP_ID>' as a signing tenant awaiting publication.
  ```

  Without NATS on web-pivotal, the last line reads instead:
  `No NATS connection; '<DFSP_ID>' will be published by the periodic reconcile.`

- **If It Fails:**
  - `This DFSP has no signing key in the HSM yet. A custodian must provision it before the DFSP can be onboarded.`
    (code `PARTICIPANT_HSM_KEY_NOT_FOUND`, HTTP 404). web-pivotal logs
    `No key reference and public key at Vault path '<PATH>'. Provision '<DFSP_ID>' with the custodian script before onboarding it.`
    Step 3 has not been done for this FSP ID, or it stopped before writing the key record. Nothing was
    created at the Hub. Do Step 3, then submit again.
  - `This DFSP's signing key record in Vault does not hold a valid public key. A custodian must check the provisioning run.`
    (code `PARTICIPANT_HSM_KEY_RECORD_INVALID`, HTTP 400). web-pivotal logs
    `The public key at Vault path '<PATH>' could not be read as a public key.` The record was not
    written by the script, or was changed by hand. Nothing was created at the Hub. Contact Pivotal
    support; do not overwrite the record.
  - `… was refused by Vault …`: web-pivotal's Vault policy does not allow reading
    `pivotal-kv/data/pivotal/keyref/*`. See [Configure Vault](../../setup/pkcs11/4-vault.md).
  - `Could not announce signing tenant '<DFSP_ID>' …`: not an error. trust-manager publishes the key on
    its next hourly run instead.
  - If the DFSP already has a public key on record, onboarding keeps it and logs
    `'<DFSP_ID>' already holds a signing key; leaving it in place. Rotate deliberately rather than by re-onboarding.`

### Step 5. Confirm that the key is published and signing is on

- **Purpose:** signing starts only after MCM confirms it holds the DFSP's public key.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/trust-manager --since=10m | grep "<DFSP_ID>"
  ```

- **Expected Result:** within seconds (or within an hour without NATS):

  ```text
  Registered '<DFSP_ID>' as a DFSP in MCM.            (only when MCM_AUTO_REGISTER_DFSPS=true)
  '<DFSP_ID>' is published to MCM and signing is now enabled.
  ```

  On the hourly run, the second line reads instead:
  `'<DFSP_ID>' was published to MCM but never switched on; signing is now enabled. Its provisioning announcement was missed.`

  In the portal, **Participant → JWS Policy** for the DFSP shows signing enabled.
- **If It Fails:** see [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm). Do not
  turn signing on by hand before the key is in MCM: the Hub would reject every signed message.

### Step 6. Issue the DFSP client certificate

*During setup*: skip this step. [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md),
Step 5, issues each test DFSP's certificate. Issuing one here as well would move this one to
`retiring`.

- **Purpose:** the DFSP needs a certificate from the DFSP CA to connect to the DFSP-facing gateway.
- **Action:** follow
  [Enable the DFSP-facing side, Step 5](../../setup/common/enable-dfsp-facing.md#step-5-issue-a-client-certificate-to-each-test-dfsp)
  for this one DFSP: **Participant → Certificates**, paste the CSR, **Sign request**, then
  **Download**.
- **Expected Result:** the new certificate is `active` and its subject contains `CN = <DFSP_ID>`.
- **If It Fails:** see that page's If It Fails.

Send the downloaded file to the DFSP.

### Step 7. Add the DFSP's connector

- **Purpose:** each DFSP has one connector. It sends the DFSP's callbacks to the Hub (leg 3) and signs
  them inside the HSM, as the DFSP's own crypto user.
- **Action:**
  1. **Vault administrator:** create the connector's Vault policy and role. They read **only its
     own** credential and key reference ([Configure Vault](../../setup/pkcs11/4-vault.md#step-5-know-the-per-dfsp-connector-policy)):

     ```bash
     vault policy write pivotal-<DFSP_ID>-connector - <<'EOF'
     path "pivotal-kv/data/pivotal/hsmcred/<DFSP_ID>" { capabilities = ["read"] }
     path "pivotal-kv/data/pivotal/keyref/<DFSP_ID>"  { capabilities = ["read"] }
     path "sys/internal/ui/mounts/pivotal-kv"         { capabilities = ["read"] }
     EOF

     vault write auth/kubernetes/role/pivotal-<DFSP_ID>-connector \
       bound_service_account_names=<DFSP_ID>-connector bound_service_account_namespaces=pivotal \
       policies=pivotal-<DFSP_ID>-connector ttl=1h
     ```

  2. Add the connector entry from
     [Deploy Pivotal, Step 4](../../setup/pkcs11/5-deploy-pivotal.md#step-4-know-the-connector-settings)
     to the `connectors` list, with `FSPIOP_USE_JWS: "true"` (*during setup*: `"false"` until
     [Enable the Hub-facing side: outbound](../../setup/common/enable-hub-facing-outbound.md) turns
     it on). Add the Hub mTLS mounts and settings from that page once it has been completed.
  3. Deploy with Helm. Create the Vault role **before** the connector starts.
- **Expected Result:** the connector pod is `Running`. With `FSPIOP_USE_JWS: "true"`, it logs
  `Signing for '<DFSP_ID>' through CloudHSM, key reference '<DFSP_ID>-jws-<TIMESTAMP>'`.
- **If It Fails:**
  - `No key reference at Vault path '<PATH>'. The crypto user exists but no key has been provisioned. Outbound FSPIOP callbacks will be sent unsigned.`:
    Step 3 did not finish, or `CONNECTOR_ID` does not match the FSP ID. Fix, then restart the
    connector: it reads its key only at startup.
  - `Failed to open the CloudHSM key for '<DFSP_ID>'.`: see [HSM](../../troubleshooting.md#hsm).

## Verification

*During setup*, Steps 3 to 7 are the checks; the shared setup pages and the
[end-to-end check](../../setup/common/end-to-end-check.md) then prove the rest. After setup:

- **Positive:**
  - The DFSP sends a request to the DFSP-facing gateway with its new certificate and a signed
    `authorization` header. It is accepted.
  - A transfer from the DFSP completes. The Hub accepts Pivotal's signed requests for it.
  - The database holds no private key for the DFSP. In the Pivotal database:

    ```sql
    SELECT fsp_id, role, jws_private_key IS NULL AS no_private_key_in_db
    FROM participant_key WHERE fsp_id = '<DFSP_ID>';
    ```

    Pass: `role` is `self` and `no_private_key_in_db` is `1`.
- **Negative:**
  - **An unprovisioned DFSP is refused, and nothing is created at the Hub.** Submit
    **Participant → Onboard FSP** with an FSP ID that has not been through Step 3. The portal shows
    `This DFSP has no signing key in the HSM yet. …`. Ask the Hub operator to confirm the ID does not
    exist in the Hub's ledger.
  - A request with this DFSP's certificate but another DFSP's `FSPIOP-Source` is refused with `3105`
    `The client certificate does not belong to the participant named in fspiop-source.`

## Troubleshooting

- [HSM](../../troubleshooting.md#hsm)
- [Vault](../../troubleshooting.md#vault)
- [Leg 1: DFSP-facing](../../troubleshooting.md#leg-1-dfsp-facing)
- [Legs 2 and 3: Hub-facing outbound](../../troubleshooting.md#legs-2-and-3-hub-facing-outbound)
- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- **web-outbound's requests for this DFSP fail with `No private key labelled '<KEY_REF>' on this token. …`,
  while its connector signs correctly:** the key is not shared with `cu_web_outbound`. Step 3 shares it
  and shows the sharing; if Step 3 reported success, contact Pivotal support.

## Rollback or Recovery

There is no offboarding command in this version. See
[Known limitations](../../known-limitations.md#no-dfsp-offboarding).

- **Step 3 done, Step 4 not yet:** nothing exists outside the HSM and Vault. To discard it, in an
  [HSM admin pod session](../../setup/pkcs11/hsm-admin-pod.md):
  1. The custodian deletes the key pair **as its owner**. The owner's password is at
     `pivotal-kv/pivotal/hsmcred/<DFSP_ID>`:

     ```bash
     CU_PASS=$(vault kv get -field=password pivotal-kv/pivotal/hsmcred/<DFSP_ID>)
     export CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN="<CRYPTO_USER>:$CU_PASS"; unset CU_PASS
     cloudhsm-cli key delete --filter attr.label=<KEY_REF>
     cloudhsm-cli key delete --filter attr.label=<KEY_REF>-pub
     unset CLOUDHSM_ROLE CLOUDHSM_PIN
     ```

  2. A Crypto Officer deletes the crypto user:
     `cloudhsm-cli user delete --username <CRYPTO_USER> --role crypto-user` (with `CLOUDHSM_ROLE=admin`).
  3. A **Vault administrator** removes the two records. The custodian's policy cannot delete:

     ```bash
     vault kv metadata delete pivotal-kv/pivotal/hsmcred/<DFSP_ID>
     vault kv metadata delete pivotal-kv/pivotal/keyref/<DFSP_ID>
     ```

- **After Step 4, do not delete the key or its Vault records.** MCM holds its public key, and the HSM
  key cannot be recreated: a new key needs a rotation, which this version does not support.
- **Certificate issued to the wrong DFSP or from the wrong CSR:** revoke it. See
  [Revoke a DFSP certificate](../common/revoke-dfsp-certificate.md).
- **Wrong access public key:** replace it with `PUT /participant/access-key`.
- **Signing must stop for this DFSP:** turn signing off in **Participant → JWS Policy**. trust-manager
  does not turn it back on.

## References

*During setup*, next: [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md), once both
test DFSPs are onboarded.

- [Prepare the HSM admin pod](../../setup/pkcs11/hsm-admin-pod.md)
- [Configure Vault (pkcs11)](../../setup/pkcs11/4-vault.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Vault reference](../../reference/vault.md)
- [Scheduled jobs](../../reference/scheduled-jobs.md)
