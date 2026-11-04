# Check Certificate Renewals

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## Overview

Most certificates on Pivotal's connections renew automatically. This procedure checks that they did,
shows how much time each one has left, and shows how to force a renewal when you need one. Run it
monthly, and after any change to trust-manager, cert-manager, Vault or MCM.

## Objective

Confirm that every certificate is valid and renewing on schedule, and force a renewal where needed.

## Expected Outcome

You know the expiry date of each certificate below, and each automatic renewal shows no errors.

| Certificate | Renewed by | Lifetime | Renewed when |
|---|---|---|---|
| Hub client certificate | trust-manager, through MCM | Set by the Hub | Less than 30 days left. Checked daily. |
| Hub callback certificate | trust-manager, through Vault and MCM | 1 year (`hub-callback-client` role) | Less than 30 days left. Checked daily. Only when `HUB_CALLBACK_CERT_COMMON_NAME` is set. |
| web-inbound server certificate | cert-manager | Set by its Certificate resource, at most 90 days (`web-inbound-server` role) | As set by the Certificate resource |
| DFSP client certificates | **Not renewed automatically.** The DFSP sends a new CSR before expiry. | 1 year (`dfsp-client` role) | — |
| DFSP CA and Pivotal Hub-client CA intermediates | Not renewed automatically. A manual re-key with Pivotal support; see [Pivotal CA re-key](pivotal-ca-rekey.md). | 5 years | — |

The 30-day renewal window is fixed in code. The Hub JWS signing keys and DFSP access keys do not
expire.

## Prerequisites

### Mandatory

- `kubectl` access to the Pivotal namespace and to the namespace of the Pivotal callback gateway.
- `openssl`.
- The names of your Secrets and Certificate resources. Defaults and examples are in
  [Kubernetes resources](../../reference/kubernetes-resources.md).

### Optional

- A portal account with **participant.certificate.view**, to check DFSP client certificates.
- `cmctl` (the cert-manager command-line tool), to force a cert-manager renewal.

## Steps

### Step 1. Check the Hub client certificate

- **Action:** Read the certificate from its Secret. Its name is trust-manager's
  `HUB_SERVER_CERT_SECRET_NAME`: `pivotal-hub-client-cert` if you followed this guide (the code
  default is `hub-server-cert`).
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal get secret <HUB_CLIENT_CERT_SECRET> \
    -o jsonpath='{.data.tls\.crt}' | base64 -d \
    | openssl x509 -noout -subject -issuer -enddate

  kubectl -n pivotal logs deploy/trust-manager --since=48h \
    | grep -iE "hub server certificate|Hub-signed server certificate"
  ```

- **Expected Result:** `notAfter` is more than 30 days away, or the log shows a recent
  `Enrolled a Hub-signed server certificate for '<COMMON_NAME>' into Secret '<NAME>'.` The issuer is
  the Hub's CA. (In code and settings this certificate is called the "Hub server certificate". It is
  Pivotal's client certificate to the Hub.)
- **If It Fails:** `Hub server certificate enrollment failed; retrying next tick: …` in the log. See
  [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm).

### Step 2. Check the Hub callback certificate

- **Purpose:** The Hub presents this certificate when it calls Pivotal. It is held by MCM, not in a
  Kubernetes Secret, so check it through trust-manager's log.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/trust-manager --since=48h \
    | grep -i "callback certificate"
  ```

- **Expected Result:** At startup: `Hub callback certificate for '<COMMON_NAME>' checked every 24h,
  renewed 30 days before expiry.` After a renewal:
  `Signed and published the Hub's callback certificate for '<COMMON_NAME>' (enrollment <ID>).`
  No `renewal failed` lines.
- **If It Fails:** The startup line appears only if trust-manager started within the time searched,
  and a running trust-manager with nothing to renew logs nothing. If there is no line, check whether
  `HUB_CALLBACK_CERT_COMMON_NAME` is set on the trust-manager Deployment
  (`kubectl -n pivotal get deploy trust-manager -o yaml | grep -A1 HUB_CALLBACK_CERT_COMMON_NAME`).
  If it is not set, this certificate is not managed by Pivotal. Other failures: see
  [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm).

### Step 3. Check the web-inbound server certificate

- **Command or Configuration:**

  ```bash
  kubectl -n <GATEWAY_NAMESPACE> get certificate <WEB_INBOUND_CERTIFICATE>
  kubectl -n <GATEWAY_NAMESPACE> describe certificate <WEB_INBOUND_CERTIFICATE> \
    | grep -E "Not After|Renewal Time|Ready"
  ```

- **Expected Result:** `READY` is `True`. `Renewal Time` is in the future.
- **If It Fails:** `kubectl -n <GATEWAY_NAMESPACE> describe certificaterequest` shows why cert-manager
  could not issue it. A refusal from Vault means cert-manager's Vault role cannot sign on
  `pki_hub_client/sign/web-inbound-server`. See [Vault](../../troubleshooting.md#vault).

### Step 4. Check DFSP client certificates

- **Action:** In the portal, open **Participant → Certificates** for each DFSP. Note the expiry date
  of each `active` certificate.
- **Expected Result:** No `active` certificate expires within the time a DFSP needs to send a new CSR.
- **If It Fails:** Ask the DFSP for a new CSR and issue a certificate as in
  [Enable the DFSP-facing side, Step 5](../../setup/common/enable-dfsp-facing.md#step-5-issue-a-client-certificate-to-each-test-dfsp).
  The step is the same on both profiles. The old certificate moves to `retiring` and stays accepted
  until it expires.

### Step 5. Force a renewal (only when needed)

- **Purpose:** Replace a certificate before its renewal window, for example after a key exposure or a
  CA change.
- **Action and Command or Configuration:**

  | Certificate | How to force a renewal |
  |---|---|
  | Hub client certificate | Delete its Secret and restart trust-manager straight away. trust-manager finds no certificate and enrolls a new one when it starts. See [Hub CA re-root](hub-ca-reroot.md), which uses the same steps. |
  | web-inbound server certificate | `cmctl renew <WEB_INBOUND_CERTIFICATE> -n <GATEWAY_NAMESPACE>` |
  | Hub callback certificate | Not possible in this version. It still renews automatically when less than 30 days are left, but nothing makes it renew sooner. See [Known limitations](../../known-limitations.md#the-hub-callback-certificate-cannot-be-renewed-early). |
  | DFSP client certificate | Issue a new one from a new CSR (Step 4). Revoke the old one if it must stop working at once. |

- **Expected Result:** The renewed certificate has a new `notAfter` date.

## Verification

- **Positive:** A transfer completes on every leg after the check (see
  [End-to-end check](../../setup/common/end-to-end-check.md)).
- **Negative:** No certificate has less than 30 days left without a renewal line in the logs.

## Troubleshooting

- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- [Legs 2 and 3: Hub-facing outbound](../../troubleshooting.md#legs-2-and-3-hub-facing-outbound)
- [Leg 4: Hub-facing inbound](../../troubleshooting.md#leg-4-hub-facing-inbound)
- **A renewed Hub client certificate is not used.** web-outbound and the connectors reload the mounted
  files every 60 seconds once Kubernetes has updated them. No restart is needed. If the old certificate
  is still presented after a few minutes, check the pods mount the right Secret.

## Rollback or Recovery

Checking changes nothing. A forced renewal cannot be undone, but the old certificate of the Hub
client certificate and the web-inbound server certificate stays valid until it expires, so the Hub
keeps accepting it while the new one rolls out.

## References

- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Scheduled jobs](../../reference/scheduled-jobs.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
