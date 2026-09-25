# Verify a CloudHSM Cluster by Hand

> ### ⚠ CloudHSM backend only
>
> A one-off check, not part of the once-per-environment sequence. Run it the first time a cluster
> is available, to prove the network path, the certificate and the crypto-user model before any
> script depends on them.

Everything here is done from a throwaway pod **inside** the cluster. CloudHSM has no public
endpoint — it is reached over private IP from within the VPC — so a laptop cannot do any of it.

**Substitute throughout:** `<HSM_IP>` the HSM's private IP, `<CO>` the Crypto Officer username,
`<pw>` the relevant password.

---

## A. Stand up a client

| # | Command | Purpose |
| --- | --- | --- |
| 1 | `kubectl -n pivotal run hsm-tools --image=ubuntu:24.04 --restart=Never --command -- sleep infinity` | A throwaway client pod. **Ubuntu, not Alpine** — the device library is built against glibc and will not load under musl |
| 2 | `kubectl -n pivotal cp customerCA.crt hsm-tools:/tmp/customerCA.crt` | The cluster's CA certificate, from activation. Without it the client cannot confirm it reached your cluster and refuses to connect |
| 3 | `kubectl -n pivotal exec -it hsm-tools -- bash` | A shell on the pod. Everything below runs here |
| 4 | `apt-get update && apt-get install -y wget` | The base image carries neither |

## B. Install the client SDK

| # | Command | Purpose |
| --- | --- | --- |
| 5 | `wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble/cloudhsm-cli_latest_u24.04_amd64.deb` | The management CLI. Pick the build matching the image's release |
| 6 | `apt-get install -y ./cloudhsm-cli_latest_u24.04_amd64.deb` | Installs into `/opt/cloudhsm`, not onto `PATH` |
| 7 | `cp /tmp/customerCA.crt /opt/cloudhsm/etc/customerCA.crt` | Where both the CLI and the library look for it |
| 8 | `/opt/cloudhsm/bin/configure-cli -a <HSM_IP>` | Points the CLI at the cluster |
| 9 | `export PATH=$PATH:/opt/cloudhsm/bin` | So the commands below can be typed unqualified |

## C. Prove the connection

| # | Command | Purpose |
| --- | --- | --- |
| 10 | `cloudhsm-cli cluster hsm-info` | **The first milestone.** Returns each HSM's model and firmware — proves network, certificate and client configuration together |
| 11 | `wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble/cloudhsm-pkcs11_latest_u24.04_amd64.deb` | The PKCS#11 library — what the services actually sign through |
| 12 | `apt-get install -y ./cloudhsm-pkcs11_latest_u24.04_amd64.deb` | Provides `/opt/cloudhsm/lib/libcloudhsm_pkcs11.so` |
| 13 | `/opt/cloudhsm/bin/configure-pkcs11 -a <HSM_IP>` | Points the library at the cluster, separately from the CLI |
| 14 | `apt-get install -y opensc` | `pkcs11-tool`, for exercising the library without application code |
| 15 | `pkcs11-tool --module /opt/cloudhsm/lib/libcloudhsm_pkcs11.so --list-slots` | **Records the token label and PIN limits.** The device names its single token itself; the label cannot be chosen |

## D. Check the account model

| # | Command | Purpose |
| --- | --- | --- |
| 16 | `cloudhsm-cli user list` | Who already exists, and whether **quorum** or **MFA** are configured. Both change what the scripts can do — quorum needs a second approver per user creation, MFA breaks the `user:password` credential shape |

> **Leave `kmsuser` and `app_user` alone.** The first belongs to a KMS custom key store, the second
> to AWS. Both are in use by something that will not tell you when you break it.

## E. Create the users

Usernames take only `a-z`, `A-Z`, `0-9` and underscore — a hyphen is rejected, and the message names
the character rather than the field. Passwords are 8–32 characters.

| # | Command | Purpose |
| --- | --- | --- |
| 17 | `export CLOUDHSM_ROLE=admin`<br>`export CLOUDHSM_PIN=<CO>:<pw>` | Authorises the two commands below. Prompted passwords are for the accounts being *created* |
| 18 | `cloudhsm-cli user create --username cu_web_outbound --role crypto-user` | The user that signs on every tenant's behalf. Owns nothing; keys are shared to it |
| 19 | `cloudhsm-cli user create --username cu_DemoDFSP1 --role crypto-user` | One tenant |
| 20 | `cloudhsm-cli user create --username cu_DemoDFSP2 --role crypto-user` | A second, unrelated tenant — needed to prove isolation in section G |

Record each password. There is no way to read one back; a Crypto Officer can only reset it, which
changes it.

## F. Generate and share, as the tenant

| # | Command | Purpose |
| --- | --- | --- |
| 21 | `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_DemoDFSP1:<pw> \`<br>`cloudhsm-cli key generate-asymmetric-pair rsa \`<br>`  --public-label DemoDFSP1-jws-1-pub --private-label DemoDFSP1-jws-1 \`<br>`  --modulus-size-bits 2048 --public-exponent 65537 \`<br>`  --private-attributes sign=true extractable=false` | **Generated as the tenant, never as a service identity.** Ownership is conferred at creation and cannot be transferred, so whoever generates a key can always use it |
| 22 | `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_DemoDFSP1:<pw> \`<br>`cloudhsm-cli key share --filter attr.label=DemoDFSP1-jws-1 \`<br>`  --username cu_web_outbound --role crypto-user` | Lets the signing user sign as this tenant. Takes the **owner's** credential — no Crypto Officer needed |

> **Both attributes in step 21 are mandatory.** Omit `sign=true` and the key lists, shares and
> carries the right label, then fails at the first signature with `CKR_KEY_FUNCTION_NOT_PERMITTED` —
> which reads like a permissions problem rather than an attribute nobody set. Omit
> `extractable=false` and the key signs perfectly while also being exportable, which removes the
> reason for the profile and nothing reports it.

## G. Prove isolation

Three listings, three different answers. This is the check that cannot be done on SoftHSM.

| # | Command | Expected |
| --- | --- | --- |
| 23 | `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_DemoDFSP1:<pw> cloudhsm-cli key list` | Both keys — it owns them |
| 24 | `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_web_outbound:<pw> cloudhsm-cli key list` | Both keys — the private one was shared to it |
| 25 | `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_DemoDFSP2:<pw> cloudhsm-cli key list` | **The public key only.** If the private key appears here, per-tenant isolation is not what the design assumes and nothing else should proceed |

The public half is visible to every crypto user. That is correct and harmless — it is public — but
it means "the key is listed" is not evidence of access. Only the private label matters.

## H. Prove signing, end to end

| # | Command | Purpose |
| --- | --- | --- |
| 26 | `echo -n "test payload" > /tmp/data` | Anything; only the round trip matters |
| 27 | `pkcs11-tool --module /opt/cloudhsm/lib/libcloudhsm_pkcs11.so \`<br>`  --login --login-type user --pin cu_web_outbound:<pw> \`<br>`  --sign --mechanism SHA256-RSA-PKCS --label DemoDFSP1-jws-1 \`<br>`  --input-file /tmp/data --output-file /tmp/sig` | Signs as the **shared** user, through the same calls the services make. A warning about `ALWAYS_AUTHENTICATE` is benign — the device does not implement that attribute |
| 28 | `ls -l /tmp/sig` | 256 bytes for RSA-2048. Seeing a key and being allowed to use it are different rights; this proves the second |
| 29 | `pkcs11-tool --module /opt/cloudhsm/lib/libcloudhsm_pkcs11.so \`<br>`  --login --login-type user --pin cu_web_outbound:<pw> \`<br>`  --read-object --type pubkey --label DemoDFSP1-jws-1-pub \`<br>`  --output-file /tmp/pub.der` | The public half, to verify against |
| 30 | `openssl rsa -pubin -inform DER -in /tmp/pub.der -outform PEM -out /tmp/pub.pem` | DER to PEM |
| 31 | `openssl dgst -sha256 -verify /tmp/pub.pem -signature /tmp/sig /tmp/data` | **`Verified OK` closes the loop** — a signature made inside the device, verified in software, which is what a peer does |

## I. Check what sharing does not grant

| # | Command | Expected |
| --- | --- | --- |
| 32 | `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu_web_outbound:<pw> \`<br>`cloudhsm-cli key delete --filter attr.label=DemoDFSP1-jws-1` | **Refused.** A shared user signs but must not destroy — otherwise the component signing for every tenant could take any tenant offline permanently |

## J. Clean up

| # | Command | Purpose |
| --- | --- | --- |
| 33 | `kubectl -n pivotal delete pod hsm-tools` | The pod holds the cluster certificate and a configured client. Remove it when the check is done |

Test crypto users and keys can stay — they are useful for the next round. Delete them as their
owner when they are not.

---

**Next:** [`1-cloudhsm-cluster.md`](./1-cloudhsm-cluster.md) for the real once-per-environment setup,
then [`2-ca-ceremony.md`](./2-ca-ceremony.md). Per-DFSP provisioning is
[`../runbooks/onboard-dfsp.md`](../runbooks/onboard-dfsp.md), which scripts what section F does here
by hand.
