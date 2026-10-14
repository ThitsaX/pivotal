# Hub CA Re-root

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

## Overview

The Hub operator sometimes replaces the Hub's root certificate authority (a "re-root"). After a
re-root, the Hub API gateway trusts only certificates signed by the new CA. trust-manager copies the
new Hub CA into the Hub CA bundle on its own, but it renews Pivotal's Hub client certificate only near
its expiry date. Until that certificate is replaced, Pivotal's calls to the Hub fail. This procedure
replaces it straight away.

If the Hub only **renews** its CA with the same key, nothing needs to be done.

## Objective

Replace Pivotal's Hub client certificate with one signed by the Hub's new CA, and confirm that Pivotal
trusts the new CA.

## Expected Outcome

- The Hub CA bundle (`hub-ca-bundle`) holds the Hub's new CA.
- The Hub client certificate is issued by the Hub's new CA.
- web-outbound and the connectors use the new certificate, and calls to the Hub succeed.

## Prerequisites

### Mandatory

- The Hub operator has re-rooted the Hub CA, and MCM returns the new CA.
- An agreed time with the Hub operator. Pivotal's calls to the Hub fail from the moment the Hub API
  gateway stops trusting the old CA until Step 3 is done.
- `kubectl` access to the Pivotal namespace, with permission to delete a Secret and restart a
  Deployment.
- `openssl`.
- The name of the Hub client certificate Secret: trust-manager's `HUB_SERVER_CERT_SECRET_NAME`.
  It is `pivotal-hub-client-cert` if you followed this guide (the code default is `hub-server-cert`).

### Optional

- A test DFSP to run a transfer after the change.

## Steps

### Step 1. Record the current state

- **Purpose:** Gives you something to compare against.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal get secret <HUB_CLIENT_CERT_SECRET> \
    -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -issuer -enddate

  kubectl -n pivotal get secret hub-ca-bundle \
    -o jsonpath='{.data.hub-ca\.pem}' | base64 -d | openssl x509 -noout -subject -fingerprint -sha256
  ```

- **Expected Result:** The certificate's issuer and the bundle's subject both name the **old** Hub CA,
  unless trust-manager has already synced the bundle.

### Step 2. Delete the Hub client certificate Secret

- **Purpose:** trust-manager enrolls a new certificate only when there is none, or when the current one
  has less than 30 days left. Removing it makes trust-manager enroll now.
- **Action:** Delete the Secret, and go straight on to Step 3.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal delete secret <HUB_CLIENT_CERT_SECRET>
  ```

- **Expected Result:** `secret "<HUB_CLIENT_CERT_SECRET>" deleted`.

### Step 3. Restart trust-manager

- **Purpose:** On startup, trust-manager syncs the Hub CA bundle and enrolls a new Hub client
  certificate straight away.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal rollout restart deployment/trust-manager
  kubectl -n pivotal rollout status deployment/trust-manager
  kubectl -n pivotal logs deploy/trust-manager --since=5m \
    | grep -E "Hub CA changed|Enrolled a Hub-signed|Created Secret"
  ```

- **Expected Result:** Within a minute or two:

  ```text
  Hub CA changed and Secret 'hub-ca-bundle' was rewritten. …   (only if not synced already)
  Created Secret pivotal/<HUB_CLIENT_CERT_SECRET>.
  Enrolled a Hub-signed server certificate for '<COMMON_NAME>' into Secret '<HUB_CLIENT_CERT_SECRET>'.
  ```

- **If It Fails:** `Hub server certificate enrollment failed; retrying next tick: …` means MCM did not
  sign the request. The next automatic attempt is 24 hours later, so fix the cause (usually on the MCM
  side) and restart trust-manager again. See
  [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm).

### Step 4. Check the new certificate

- **Command or Configuration:** Run the two commands from Step 1 again.
- **Expected Result:** The certificate's issuer and the bundle's subject both name the **new** Hub CA.
  `notAfter` is about a year away (the lifetime is set by the Hub).
- **If It Fails:** If the issuer is still the old CA, MCM signed with the old CA. Ask the Hub operator
  to check MCM, then repeat Steps 2 and 3.

### Step 5. Wait for the services to pick up the new certificate

- **Purpose:** web-outbound and the connectors read the certificate and CA bundle from mounted files.
  They reload them every 60 seconds once Kubernetes has updated the files. No restart is needed.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/web-outbound --since=10m \
    | grep "Reloaded mutual TLS material"
  ```

- **Expected Result:** `Reloaded mutual TLS material; new connections will use it.` The connectors log
  the same line.
- **If It Fails:** If the line does not appear within a few minutes, check that the pods mount the
  Secret you deleted and re-created. A connector that still fails can be restarted.

## Verification

- **Positive:** Run a transfer from a test DFSP. Pivotal's requests to the Hub and the connectors'
  callbacks return success.
- **Negative:** Not practical: the old certificate is no longer in use. Confirm instead that no
  service logs a TLS handshake failure towards the Hub after the reload.

## Troubleshooting

- [Legs 2 and 3: Hub-facing outbound](../../troubleshooting.md#legs-2-and-3-hub-facing-outbound)
- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- **trust-manager cannot create the Secret (Kubernetes `403`).** Deploy with the chart, so its RBAC
  rules include the Secret name from your values.
- **The Hub still rejects Pivotal after the change.** The Hub API gateway may not trust the new CA yet,
  or the Hub's own server certificate may still be from the old CA. Both are on the Hub side; ask the
  Hub operator.

## Rollback or Recovery

There is no rollback: the Hub no longer trusts certificates from its old CA. If enrollment fails,
Pivotal cannot reach the Hub until it succeeds. Fix the cause and repeat Steps 2 and 3.

## References

- [Check certificate renewals](check-certificate-renewals.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Known limitations](../../known-limitations.md#a-ca-change-needs-manual-steps)
