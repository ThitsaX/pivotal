# Onboard a DFSP (pkcs11)

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: pkcs11 · Document version 1.1 (draft)

Use this guide to add a new DFSP to Pivotal, or to upgrade a DFSP that was onboarded on an earlier
Pivotal version.

| Your situation | Follow |
|---|---|
| The DFSP is new to Pivotal | [Onboarding a new DFSP](#onboarding-a-new-dfsp) |
| The DFSP already sends payments through Pivotal | [Upgrading an existing DFSP](#upgrading-an-existing-dfsp) |

> **Doing the initial setup?** Use [Onboarding a new DFSP](#onboarding-a-new-dfsp) for each test
> DFSP, and follow the notes marked **During setup**.

## The example on this page

Every command on this page uses one example: we are onboarding a new DFSP called **MyGreenBank**.
Replace each example value with your own.

| What | Example value | Where it comes from |
|---|---|---|
| FSP ID | `MyGreenBank` | Agreed with the DFSP. Case-sensitive. |
| Currency | `USD` | Agreed with the DFSP. |
| Access public key file | `./mygreenbank-access.pub` | Sent by the DFSP. A path on your computer. |
| CSR file | `./mygreenbank-client.csr` | Sent by the DFSP. A path on your computer. |
| Kubeconfig file | `~/.kube/pivotal.yaml` | Your cluster access file. |
| Pivotal repository | `~/projects/pivotal` | Your clone of the Pivotal repository. |
| Vault address (inside the cluster) | `http://vault.vault.svc.cluster.local:8200` | The [shared worksheet](../../setup/common/hub-operator-and-worksheet.md). |
| Pivotal callback host | `web-inbound.example.com` | The [shared worksheet](../../setup/common/hub-operator-and-worksheet.md). |
| Crypto user | `cu_MyGreenBank` | Created by the script from the FSP ID. The HSM shows it as `cu_mygreenbank`. |
| Key reference | `MyGreenBank-jws-20261029093000` | Created by the script. The ending is the date and time it ran. |
| Connector name | `mygreenbank-java-connector` | Your choice. Kubernetes names must be lower case. |

## Onboarding a new DFSP

**What you'll do**

1. Create the DFSP's signing key in the HSM.
2. Onboard the DFSP in the portal.
3. Issue the DFSP's client certificate.
4. Add the DFSP's connector.
5. Check that payments work.

**Before you begin**

You need:

- A Crypto Officer account on the HSM.
- A Vault token with the `pivotal-hsm-provisioning` policy. See [Configure Vault](../../setup/pkcs11/4-vault.md).
- The HSM admin pod, deployed. See [Prepare the HSM admin pod](../../setup/pkcs11/hsm-admin-pod.md).
- `kubectl` access to the cluster.
- A portal account with the permissions **participant.onboard**, **participant.certificate.enroll**
  and **participant.certificate.view**.
- A Vault administrator, for the connector's Vault policy in Step 4.
- trust-manager running with `MCM_AUTO_REGISTER_DFSPS=true`. If it is off, ask the Hub operator to
  create the DFSP in MCM first.

From the DFSP:

- its FSP ID (letters, digits, `-` and `_`; 2 to 31 characters);
- its currencies;
- its access public key file;
- its certificate signing request (CSR) file.

**What the DFSP's two files must be**

The DFSP creates two separate key pairs, keeps both private keys, and sends you only the public
parts:

| File | Purpose | Key type and size | Format | Checked by Pivotal |
|---|---|---|---|---|
| Access public key (`mygreenbank-access.pub`) | Verifies the DFSP's signed requests to Pivotal (RS256) | RSA, 2048 bits or more | PEM, `-----BEGIN PUBLIC KEY-----` | Only when the DFSP's first request arrives. A wrong key is accepted at onboarding and then every request fails. |
| Certificate signing request (`mygreenbank-client.csr`) | Becomes the DFSP's client certificate for mTLS | RSA, 2048 bits or more | PEM, `-----BEGIN CERTIFICATE REQUEST-----` | At Step 3. Anything else is refused. |

Other key types, such as EC, don't work: a CSR with one is refused at Step 3, and requests signed
with one are refused. The CSR's subject and alternative names are ignored: Pivotal always issues the
certificate with `CN = <FSP ID>`.

Send these commands to the DFSP if it needs them. They create both files, using MyGreenBank as the
example:

```bash
# Access key pair: the DFSP keeps mygreenbank-access.key and sends mygreenbank-access.pub
openssl genrsa -out mygreenbank-access.key 2048
openssl rsa -in mygreenbank-access.key -pubout -out mygreenbank-access.pub

# Client certificate key and CSR: the DFSP keeps mygreenbank-client.key and sends mygreenbank-client.csr
openssl req -new -newkey rsa:2048 -nodes \
  -keyout mygreenbank-client.key -out mygreenbank-client.csr \
  -subj "/CN=MyGreenBank"
```

> **Tip:** Check the DFSP's two files before you start. MyGreenBank sent `mygreenbank-access.pub` and
> `mygreenbank-client.csr`, saved in the current folder:
>
> ```bash
> openssl pkey -pubin -in ./mygreenbank-access.pub -noout -text | head -1
> openssl req -in ./mygreenbank-client.csr -noout -verify -text | grep "Public-Key"
> ```
>
> You should see:
>
> ```text
> Public-Key: (2048 bit)
> Certificate request self-signature verify OK
>                 Public-Key: (2048 bit)
> ```
>
> If either command fails, ask the DFSP for new files.

### Step 1: Create the DFSP's signing key

A custodian does this step in the HSM admin pod. The script creates the DFSP's own crypto user,
generates its signing key inside the HSM, shares the key with web-outbound, and records the key
reference and public key in Vault.

Connect to the cluster:

```bash
export KUBECONFIG=~/.kube/pivotal.yaml
```

Open a shell in the HSM admin pod. How you do it depends on how the pod was deployed:

**If the pod was deployed with Helm** (`deploy/hsm-tools`), start a session as described in
[Start a session](../../setup/pkcs11/hsm-admin-pod.md#step-4-start-a-session). The script is already
in the pod, and `PATH` and `VAULT_ADDR` are already set:

```bash
kubectl -n pivotal scale deploy/hsm-tools --replicas=1
kubectl -n pivotal rollout status deploy/hsm-tools --timeout=180s
kubectl -n pivotal exec -it deploy/hsm-tools -- bash
```

**If the pod was built by hand** (a pod named `hsm-tools`), copy the script in from the Pivotal
repository, then open a shell and set up `PATH` and `VAULT_ADDR`:

```bash
cd ~/projects/pivotal
kubectl -n pivotal cp docs/operations/hsm/runbooks/scripts/provision-hsm-tenant.sh \
  hsm-tools:/usr/local/bin/provision-hsm-tenant.sh
kubectl -n pivotal exec hsm-tools -- chmod +x /usr/local/bin/provision-hsm-tenant.sh
kubectl -n pivotal exec -it hsm-tools -- bash
```

Then, in the pod:

```bash
export PATH=$PATH:/opt/cloudhsm/bin VAULT_ADDR=http://vault.vault.svc.cluster.local:8200
```

In the pod, check that the tools work:

```bash
cloudhsm-cli --version; vault version; which provision-hsm-tenant.sh openssl
cloudhsm-cli cluster hsm-info | grep -c '"serial-number"'
```

You should see the tool versions, the paths of the script and `openssl`, and the number of HSMs
(1 or more; 2 or more in a multi-device cluster).

Run the script with the FSP ID:

```bash
provision-hsm-tenant.sh MyGreenBank
```

When prompted, enter the Vault token, then the Crypto Officer username (press Enter for `admin`)
and password.

**Result:** the output looks like this:

```text
Provisioning 'MyGreenBank' (crypto user 'cu_MyGreenBank')
  credential written: pivotal-kv/pivotal/hsmcred/MyGreenBank
  crypto user created: cu_MyGreenBank
  key generated in the HSM: MyGreenBank-jws-20261029093000
  shared with cu_web_outbound
  key reference and public key recorded: pivotal-kv/pivotal/keyref/MyGreenBank
── verification ─────────────────────────────────
…
keyRef in Vault:     MyGreenBank-jws-20261029093000
publicKey in Vault:  matches the HSM
```

In the key details printed under `verification`, check that:

- the owner is `cu_mygreenbank` (the HSM shows names in lower case);
- the key is shared with `cu_web_outbound`;
- `extractable` is `false`.

Type `exit` to leave the pod, then
[end the session](../../setup/pkcs11/hsm-admin-pod.md#step-6-end-the-session).

The script is safe to run again. A DFSP that is already provisioned is reported and left alone.

> **Note:** The crypto user's name is `cu_` plus the FSP ID, with any character other than a letter
> or digit turned into `_`. For example, `My-GreenBank` would become `cu_My_GreenBank`. Avoid FSP
> IDs that differ only in case, or only in `-` versus `_`: they would share one crypto user.

**If something goes wrong**

| Message | What to do |
|---|---|
| `REFUSING: VAULT_ADDR is not set.` | Export `VAULT_ADDR` in the pod, as shown above. |
| `REFUSING: 'MyGreenBank' is not a safe fspId …` | Use only letters, digits, `-` and `_`, starting with a letter or digit. |
| `REFUSING: this Vault token is not valid, or Vault is not reachable …` | Get a new custodian token and run again. Nothing was changed. |
| `REFUSING: 'MyGreenBank' already has key '…' but no public key …` | The DFSP was keyed before this script recorded public keys. Do not provision it again. Nothing was changed. |
| `REFUSING: … already holds a credential, but no crypto user 'cu_MyGreenBank' exists.` | The DFSP's crypto user has another name, for example `cu_mygreenbank_old`. Run again with `CRYPTO_USER=cu_mygreenbank_old provision-hsm-tenant.sh MyGreenBank`. |
| `'MyGreenBank' is already provisioned with key '…'. Nothing to do.` | Not an error. Go to Step 2. |
| `crypto user 'cu_MyGreenBank' already exists; using its credential from Vault` | Not an error. An earlier run stopped part-way, and the script carries on. |
| `FAILED: no password readable at …` | The token cannot read the credential path. Check it has `pivotal-hsm-provisioning`. |
| A JSON error from `cloudhsm-cli` | Wrong Crypto Officer login, or an HSM problem. See [HSM troubleshooting](../../troubleshooting.md#hsm). |

### Step 2: Onboard the DFSP in the portal

1. Go to **Participant → Onboard FSP**.
2. Fill in the form:

   | Field | Example |
   |---|---|
   | FSP ID | `MyGreenBank` |
   | Currencies | `USD` |
   | Endpoint | `http://web-inbound.example.com` |
   | Access public key | The contents of `mygreenbank-access.pub`, from `-----BEGIN PUBLIC KEY-----` to `-----END PUBLIC KEY-----` |

   > **Important:** The endpoint is where the Hub sends this DFSP's callbacks. It must be Pivotal's
   > callback host, never the DFSP's own system.
   >
   > **Where to find it:** the callback host is web-inbound's public address on the Hub-facing
   > gateway. It is the same for every DFSP. It was chosen during setup
   > ([Enable the Hub-facing side: inbound](../../setup/common/enable-hub-facing-inbound.md)) and
   > recorded in the [shared worksheet](../../setup/common/hub-operator-and-worksheet.md). To read
   > it from the cluster:
   >
   > ```bash
   > kubectl -n pivotal get gateway pivotal-hub-callback-gateway \
   >   -o jsonpath='{.spec.servers[0].hosts[0]}{"\n"}'
   > ```
   >
   > It prints the host, for example `web-inbound.example.com`. Put `http://` in front of it.
   >
   > **Use `http://`, not `https://`.** The connection is still encrypted and uses mTLS. The Hub's
   > egress gateway turns a callback addressed to this host over `http` into an mTLS connection on
   > port 443, presenting the Hub's client certificate. With `https://`, the callback skips the
   > egress gateway, presents no certificate, and Pivotal's gateway refuses it.
   >
   > If it prints `NotFound`, the Hub-facing inbound side isn't set up yet. Use the address in the
   > **During setup** note below.
   >
   > **During setup:** before [Enable the Hub-facing side: inbound](../../setup/common/enable-hub-facing-inbound.md),
   > use the address the Hub uses today to reach web-inbound. That page moves it later.
3. Select **Submit**.

You don't enter a signing key. Pivotal reads the public key that Step 1 recorded in Vault.

**Result:** within a few seconds, **Participant → JWS Policy** shows signing as enabled for
MyGreenBank. Without NATS this can take up to an hour.

To see it in the logs:

```bash
kubectl -n pivotal logs deploy/trust-manager --since=10m | grep "MyGreenBank"
```

Look for:

```text
'MyGreenBank' is published to MCM and signing is now enabled.
```

> **Important:** Don't turn signing on by hand before this message appears. The Hub would reject
> every signed message.

**If something goes wrong**

| Message | What to do |
|---|---|
| `This DFSP has no signing key in the HSM yet …` | Step 1 was not done for this FSP ID. Nothing was created at the Hub. Do Step 1, then submit again. |
| `This DFSP's signing key record in Vault does not hold a valid public key …` | The Vault record was changed by hand. Contact Pivotal support. Do not overwrite it. |
| `… was refused by Vault …` | web-pivotal's Vault policy can't read `pivotal-kv/data/pivotal/keyref/*`. See [Configure Vault](../../setup/pkcs11/4-vault.md). |
| Signing is not enabled after an hour | See [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm). |

### Step 3: Issue the client certificate

> **During setup:** skip this step. [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md)
> issues the test DFSPs' certificates. Issuing one here too would move this one to `retiring`.

1. Go to **Participant → Certificates** and select **MyGreenBank**.
2. Paste the contents of `mygreenbank-client.csr`, from `-----BEGIN CERTIFICATE REQUEST-----` to
   `-----END CERTIFICATE REQUEST-----`, and select **Sign request**.
3. Select **Download** and send the file to MyGreenBank.

**Result:** the certificate shows as `active`. To check the downloaded file, for example
`MyGreenBank.pem` in your Downloads folder:

```bash
openssl x509 -in ~/Downloads/MyGreenBank.pem -noout -subject -issuer
```

The subject is `CN = MyGreenBank`. Pivotal sets the subject itself, whatever the CSR says.

### Step 4: Add the DFSP's connector

Each DFSP has one connector. It sends the DFSP's callbacks to the Hub and signs them in the HSM.

1. Give the connector access to MyGreenBank's records in Vault, and nothing else. You add two
   things: a **policy** (what it may read) and a **role** (who may log in with that policy).

   The connector can read only MyGreenBank's own records:

   | Vault path | Why the connector needs it |
   |---|---|
   | `pivotal-kv/data/pivotal/hsmcred/MyGreenBank` | The password it uses to log in to the HSM as `cu_MyGreenBank` |
   | `pivotal-kv/data/pivotal/keyref/MyGreenBank` | The label of the signing key it uses |
   | `sys/internal/ui/mounts/pivotal-kv` | Lets the Vault client confirm the store is KV v2 before reading |

   Read-only and exact paths, with no wildcard: if one connector is compromised, no other DFSP's
   key is exposed.

   **With GitOps (recommended).** In your gitops repository, open
   `apps/vault-pki-setup/pivotal-trust-pki.yaml`. Copy an existing connector's `Policy` and
   `KubernetesAuthEngineRole` (for example DemoDFSP1's), and rename them for MyGreenBank:

   ```yaml
   apiVersion: redhatcop.redhat.io/v1alpha1
   kind: Policy
   metadata:
     name: pivotal-hsm-mygreenbank
   spec:
     authentication:
       path: kubernetes
       role: policy-admin
       serviceAccount:
         name: default
     policy: |
       path "pivotal-kv/data/pivotal/hsmcred/MyGreenBank" {
         capabilities = ["read"]
       }
       path "pivotal-kv/data/pivotal/keyref/MyGreenBank" {
         capabilities = ["read"]
       }
       path "sys/internal/ui/mounts/pivotal-kv" {
         capabilities = ["read"]
       }
     type: acl
   ---
   apiVersion: redhatcop.redhat.io/v1alpha1
   kind: KubernetesAuthEngineRole
   metadata:
     name: pivotal-mygreenbank-connector-role
   spec:
     authentication:
       path: kubernetes
       role: policy-admin
       serviceAccount:
         name: default
     path: kubernetes
     tokenTTL: 3600
     policies:
       - pivotal-hsm-mygreenbank
     targetServiceAccounts:
       - mygreenbank-java-connector
     targetNamespaces:
       targetNamespaces:
         - pivotal
   ```

   Commit, and let ArgoCD sync `vault-pki-setup` **before** `pivotal`.

   **Without GitOps.** A Vault administrator runs the same thing with the `vault` CLI:

   ```bash
   vault policy write pivotal-hsm-mygreenbank - <<'EOF'
   path "pivotal-kv/data/pivotal/hsmcred/MyGreenBank" { capabilities = ["read"] }
   path "pivotal-kv/data/pivotal/keyref/MyGreenBank"  { capabilities = ["read"] }
   path "sys/internal/ui/mounts/pivotal-kv"           { capabilities = ["read"] }
   EOF

   vault write auth/kubernetes/role/pivotal-mygreenbank-connector-role \
     bound_service_account_names=mygreenbank-java-connector \
     bound_service_account_namespaces=pivotal \
     policies=pivotal-hsm-mygreenbank ttl=1h
   ```

   > **Note:** The Vault paths use the FSP ID exactly (`MyGreenBank`). Kubernetes and Vault names
   > are lower case. The service account must be the connector's own name,
   > `mygreenbank-java-connector`, or the connector can't log in to Vault.

2. Add the connector to the `connectors` list in your values file. Use the settings in
   [Deploy Pivotal](../../setup/pkcs11/5-deploy-pivotal.md#step-4-know-the-connector-settings),
   with:

   | Setting | Example value |
   |---|---|
   | `name` | `mygreenbank-java-connector` |
   | `serviceAccount.name` | `mygreenbank-java-connector` |
   | `CONNECTOR_ID` | `MyGreenBank` |
   | `VAULT_ROLE` | `pivotal-mygreenbank-connector-role` |
   | `FSPIOP_USE_JWS` | `"true"` |

   Add the Hub mTLS mounts and settings in
   [Enable the Hub-facing side: outbound](../../setup/common/enable-hub-facing-outbound.md#step-3-configure-each-connector-for-mtls).

   > **During setup:** set `FSPIOP_USE_JWS: "false"`, and leave out the Hub mTLS settings, until
   > [Enable the Hub-facing side: outbound](../../setup/common/enable-hub-facing-outbound.md) turns them on.

3. Deploy. Create the Vault role before the connector starts, or it fails to log in to Vault.

**Result:** the connector pod is running, and its log shows:

```text
Signing for 'MyGreenBank' through CloudHSM, key reference 'MyGreenBank-jws-20261029093000'
```

**If something goes wrong**

| Message | What to do |
|---|---|
| `No key reference at Vault path '…' …` | Step 1 didn't finish, or `CONNECTOR_ID` isn't exactly `MyGreenBank`. Fix it, then restart the connector: it reads its key only at startup. |
| `Failed to open the CloudHSM key for 'MyGreenBank'.` | See [HSM troubleshooting](../../troubleshooting.md#hsm). |

### Step 5: Check that payments work

> **During setup:** the setup pages and the [end-to-end check](../../setup/common/end-to-end-check.md)
> cover this.

Check that:

- **A request from MyGreenBank is accepted.** Send it with the new certificate and a signed
  `authorization` header.
- **A transfer from MyGreenBank completes.** The Hub accepts Pivotal's signed requests for it.
- **No private key is stored in the database.** In the Pivotal database:

  ```sql
  SELECT fsp_id, role, jws_private_key IS NULL AS no_private_key_in_db
  FROM participant_key WHERE fsp_id = 'MyGreenBank';
  ```

  `role` is `self`, and `no_private_key_in_db` is `1`.
- **A mismatched request is refused.** A request with MyGreenBank's certificate but another DFSP's
  `FSPIOP-Source` is refused with `3105`.

If web-outbound's requests for MyGreenBank fail with `No private key labelled '…' on this token`
while its connector signs correctly, the key isn't shared with `cu_web_outbound`. Contact Pivotal
support.

## Upgrading an existing DFSP

Use this section for a DFSP that already sends payments through Pivotal, onboarded on an earlier
Pivotal version. The example here is an existing DFSP called **MyBlueBank**.

> **Important:** Don't use **Onboard FSP** for an existing DFSP. It asks the Hub to create the
> DFSP, its currency accounts and its limits again, and the DFSP already has them.

**Before you begin**

- You need the same access and tools as for a new DFSP.
- Agree a cutover window with the DFSP.
- Check whether the DFSP already has a Hub-facing signing key. In the Pivotal database:

  ```sql
  SELECT fsp_id, role, jws_public_key IS NOT NULL AS has_key
  FROM participant_key WHERE fsp_id = 'MyBlueBank';
  ```

  | Result | What it means |
  |---|---|
  | `has_key` is `1` | Moving the DFSP to the HSM is a key rotation. Follow [Rotate a tenant's signing key](../../../../operations/hsm/runbooks/rotate-signing-key.md) instead of Step 1. |
  | No row, or `has_key` is `0` | Follow Step 1. Then see the note under Step 1 below. |

### Step 1: Create the DFSP's signing key

Follow [Step 1 for a new DFSP](#step-1-create-the-dfsps-signing-key), with
`provision-hsm-tenant.sh MyBlueBank`.

> **Note:** This version has no supported way to record the new public key for an existing DFSP
> without **Onboard FSP**. Contact Pivotal support before you continue.

### Step 2: Point the Hub's callbacks to Pivotal

Change MyBlueBank's callback endpoint to Pivotal's callback host. Call `PUT /participant/endpoint`
on web-pivotal:

```json
{"name": "MyBlueBank", "endpoint": "http://web-inbound.example.com"}
```

The Hub caches endpoints, so the change can take a few minutes to be used.

### Step 3: Issue the client certificate

Follow [Step 3 for a new DFSP](#step-3-issue-the-client-certificate), with MyBlueBank's CSR. The DFSP
keeps working without the certificate until mTLS becomes mandatory.

### Step 4: Upgrade the DFSP's connector

Follow [Step 4 for a new DFSP](#step-4-add-the-dfsps-connector), but update MyBlueBank's existing
connector entry instead of adding a new one: the new image, the Vault policy and role, the Hub mTLS
settings and `FSPIOP_USE_JWS: "true"`.

### Step 5: Check that payments work

Run the [same checks as for a new DFSP](#step-5-check-that-payments-work), during the cutover window.

## Undo an onboarding

There is no offboarding command in this version. See
[Known limitations](../../known-limitations.md#no-dfsp-offboarding).

**After Step 1, before Step 2.** Nothing exists outside the HSM and Vault yet. To remove it, in an
[HSM admin pod session](../../setup/pkcs11/hsm-admin-pod.md):

1. Delete the key pair as its owner. The owner's password is in Vault:

   ```bash
   CU_PASS=$(vault kv get -field=password pivotal-kv/pivotal/hsmcred/MyGreenBank)
   export CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN="cu_MyGreenBank:$CU_PASS"; unset CU_PASS
   cloudhsm-cli key delete --filter attr.label=MyGreenBank-jws-20261029093000
   cloudhsm-cli key delete --filter attr.label=MyGreenBank-jws-20261029093000-pub
   unset CLOUDHSM_ROLE CLOUDHSM_PIN
   ```

2. A Crypto Officer deletes the crypto user, with `CLOUDHSM_ROLE=admin`:

   ```bash
   cloudhsm-cli user delete --username cu_MyGreenBank --role crypto-user
   ```

3. A Vault administrator removes the two records:

   ```bash
   vault kv metadata delete pivotal-kv/pivotal/hsmcred/MyGreenBank
   vault kv metadata delete pivotal-kv/pivotal/keyref/MyGreenBank
   ```

**After Step 2.** Don't delete the key or its Vault records. MCM holds the public key, and a new key
needs a rotation.

**Other fixes**

- **Certificate issued to the wrong DFSP, or from the wrong CSR:** revoke it. See
  [Revoke a DFSP certificate](../common/revoke-dfsp-certificate.md).
- **Wrong access public key:** replace it with `PUT /participant/access-key`.
- **Signing must stop for this DFSP:** turn it off in **Participant → JWS Policy**. trust-manager
  doesn't turn it back on.

## Related pages

- [Prepare the HSM admin pod](../../setup/pkcs11/hsm-admin-pod.md)
- [Configure Vault (pkcs11)](../../setup/pkcs11/4-vault.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Vault reference](../../reference/vault.md)
- [Scheduled jobs](../../reference/scheduled-jobs.md)
- [Troubleshooting](../../troubleshooting.md)
