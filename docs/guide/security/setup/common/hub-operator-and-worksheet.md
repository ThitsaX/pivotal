# Hub Operator Items and Setup Worksheet

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## Overview

Both key profiles need the same things from the Hub operator, and the same values on the Deploy
Pivotal page and the four shared pages. This page lists what to ask the Hub operator for, checks the
MCM access trust-manager will use, and gives one worksheet for every value those pages ask for. Your
profile's prerequisites page sends you here, and adds its own profile-specific values.

## Objective

Have every Hub-side item agreed and every shared value written down before you deploy Pivotal.

## Expected Outcome

- The Hub operator has confirmed items H1 to H8.
- The MCM token check in [Step 2](#step-2-check-the-mcm-client) passes.
- Every row of the worksheet in [Step 3](#step-3-fill-in-the-worksheet) is filled in.

## Prerequisites

### Mandatory

- A contact at the Hub operator who can change Keycloak, MCM and the Hub's gateways.
- `curl` and `jq` on your workstation.

### Optional

- A pod inside the cluster you can `kubectl exec` into, if MCM is reachable only from inside the
  cluster.

## Steps

### Step 1. Agree the Hub operator's items

- **Purpose:** Pivotal's Hub-facing legs depend on work only the Hub operator can do. Ask early: this
  is the step most likely to wait on someone else.
- **Action:** Send this list to the Hub operator and record each answer.

  | # | Item | Why | Needed from |
  |---|---|---|---|
  | H1 | An OIDC client in the Keycloak realm MCM trusts, for trust-manager: confidential, client credentials grant only. Its tokens must carry the audience `connection-manager-api` and a `groups` claim. | trust-manager calls MCM with this client. MCM rejects a token missing either. | Deploy Pivotal |
  | H2 | The MCM API base URL, reachable from the cluster | trust-manager's `MCM_BASE_URL` | Deploy Pivotal |
  | H3 | The Keycloak token URL for that realm | trust-manager's `MCM_TOKEN_URL` | Deploy Pivotal |
  | H4 | The Hub CA configured in MCM (`GET /hub/ca` returns a certificate) | trust-manager copies it into the Hub CA bundle, and MCM signs the Hub client certificate with it | Deploy Pivotal |
  | H5 | A Hub API gateway host that requires a client certificate signed by the Hub CA, and whose own server certificate chains to the Hub CA | Legs 2 and 3 | Enable the Hub-facing side: outbound |
  | H6 | If that gateway also requires an access token: a token URL, client ID and client secret | web-outbound and the connectors fetch the token | Enable the Hub-facing side: outbound |
  | H7 | The Hub's JWS public key (PEM), if the Hub signs the messages it sends. The Hub's own messages, such as error callbacks, may still arrive unsigned. | web-inbound verifies the Hub's signatures; you register the key on **Hub → Hub JWS Public Key** | Enable the Hub-facing side: inbound |
  | H8 | The Hub's egress gateway configured from MCM, and able to reach Pivotal's callback host | Leg 4 | Enable the Hub-facing side: inbound |

  Also ask whether MCM creates a Keycloak account for each DFSP it registers. If it does, trust-manager
  needs `MCM_DFSP_CONTACT_EMAIL` (worksheet below).

- **Expected Result:** Every item is either delivered or has an agreed date.
- **If It Fails:** Do not start Deploy Pivotal until H1 to H4 exist. trust-manager cannot enroll the
  Hub client certificate or register Pivotal's CA without them.

### Step 2. Check the MCM client

- **Purpose:** Find problems with the Hub side now, not after deploying.
- **Action:** Request a token with the trust-manager client (H1), check its claims, then read the Hub
  CA from MCM (H4).
- **Command or Configuration:**

  ```bash
  TOKEN=$(curl -s -X POST <MCM_TOKEN_URL> \
    -d grant_type=client_credentials \
    -d client_id=<MCM_CLIENT_ID> \
    -d client_secret='<MCM_CLIENT_SECRET>' | jq -r .access_token)

  # Decode the token body (JWTs drop base64 padding, so add it back) and check the claims
  p=$(echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+')
  while [ $(( ${#p} % 4 )) -ne 0 ]; do p="$p="; done
  echo "$p" | base64 -d | jq '{aud, groups}'

  # Run from a pod inside the cluster if MCM is only reachable there
  curl -s -H "Authorization: Bearer $TOKEN" <MCM_BASE_URL>/hub/ca | jq -r .rootCertificate | head -1
  ```

- **Expected Result:**
  - `aud` contains `connection-manager-api`, and `groups` is present.
  - The last command prints `-----BEGIN CERTIFICATE-----`.
- **If It Fails:**
  - No token: the client ID or secret is wrong, or the client credentials grant is off.
  - `aud` or `groups` missing: ask the Hub operator to add the Keycloak mappers.
  - MCM refuses a token that has both claims: request the token from the same Keycloak host name MCM
    uses as its issuer. A token is issued for the host it was requested from.
  - No Hub CA: the Hub operator has not set up the Hub CA in MCM. Stop until it exists.

> **Do not keep the token or client secret in shell history.** Run `unset TOKEN p` when you finish.

### Step 3. Fill in the worksheet

- **Purpose:** Collect every shared value later pages ask for, in one place. Your profile's
  prerequisites page lists the profile-specific values.
- **Action:** Copy this table into your change record and fill it in.

  | Placeholder | Meaning | Example | Used on |
  |---|---|---|---|
  | — | Pivotal namespace | `pivotal` | Every page |
  | `<VAULT_ADDRESS>` | Vault's address from inside the cluster | `http://vault.vault.svc.cluster.local:8200` | Vault, Deploy Pivotal, inbound |
  | `<VAULT_NAMESPACE>`, `<VAULT_POD>` | Where Vault runs, for `kubectl exec` | `vault`, `vault-0` | Vault, CA ceremony |
  | — | Vault KV v2 mount for Pivotal | `pivotal-kv` | Vault, Deploy Pivotal, onboarding |
  | `<GATEWAY_NAMESPACE>` | Namespace of the Istio ingress gateway DFSPs and the Hub reach | `istio-ingress-ext` | DFSP-facing, inbound, end-to-end |
  | `<GATEWAY_SELECTOR_KEY>: <GATEWAY_SELECTOR_VALUE>` | The label that selects that gateway's pods | `app: istio-external-ingress-gw` | DFSP-facing, inbound, end-to-end |
  | `<DFSP_FACING_HOST>` | Host name DFSPs call | `pivotal.example.com` | DFSP-facing |
  | `<DFSP_GATEWAY_CREDENTIAL>` | Secret in `<GATEWAY_NAMESPACE>` holding the DFSP-facing host's **server** certificate. Usually issued by cert-manager from a public CA. A DNS record for `<DFSP_FACING_HOST>` must point at the gateway. | `pivotal-dfsp-tls` | DFSP-facing |
  | `<PIVOTAL_CALLBACK_HOST>` | Host name the Hub calls back on (web-inbound's public host). A DNS record must point at the gateway. The CA ceremony scripts take the same value as `WEB_INBOUND_HOST`. | `web-inbound.example.com` | CA ceremony, inbound, end-to-end, onboarding |
  | `<HUB_API_HOST>` | Hub API gateway host (H5) | `hub-api.example.com` | Outbound |
  | `<HUB_TOKEN_URL>`, `<HUB_TOKEN_CLIENT_ID>` | Hub access token settings (H6), only if the Hub API gateway needs a token | — | Outbound |
  | `<CURRENT_HUB_PARTIES_URL>`, `<CURRENT_HUB_QUOTES_URL>`, `<CURRENT_HUB_TRANSFERS_URL>` | The Hub endpoints web-outbound and the connectors use **today**, before mTLS. Copy them from your current values. The outbound page moves them to `<HUB_API_HOST>`. | `http://ml-api-adapter.example.com` | Deploy Pivotal |
  | `<MCM_BASE_URL>` | MCM API base URL (H2) | `http://<MCM_SERVICE>.<MCM_NAMESPACE>.svc.cluster.local:3001/api` | Deploy Pivotal |
  | `<MCM_TOKEN_URL>` | Keycloak token URL (H3) | `https://keycloak.example.com/realms/<REALM>/protocol/openid-connect/token` | Deploy Pivotal |
  | `<MCM_CLIENT_ID>` | trust-manager's client (H1). The secret goes into a Kubernetes Secret, never into the values file. | `pivotal-trust-manager` | Deploy Pivotal |
  | — | `MCM_DFSP_CONTACT_EMAIL`, only if MCM creates a Keycloak account per DFSP (Step 1) | `ops@example.com` | Deploy Pivotal |
  | `<PIVOTAL_DFSP_ID>` | Pivotal's own participant ID in MCM | `pivotal` | Deploy Pivotal, inbound |
  | `<FSPIOP_SWITCH_ID>` | The Hub's FSPIOP ID | `hub` | Deploy Pivotal |
  | `<HUB_CLIENT_CERT_COMMON_NAME>` | Common name of the Hub client certificate trust-manager requests. Agree it with the Hub operator. | `pivotal` | Deploy Pivotal |
  | `<CERT_MANAGER_NAMESPACE>` | cert-manager's cluster resource namespace. A ClusterIssuer's `serviceAccountRef` must be in it. | `cert-manager` | Vault, inbound |
  | `<CERT_MANAGER_VAULT_SA>` | A ServiceAccount name you choose for cert-manager to log in to Vault. It is created on the inbound page. | `pivotal-vault-issuer` | Vault, inbound |
  | `<DFSP_ID>` | The participant IDs of the first DFSPs to onboard (at least two, for the shared pages' tests) | `dfsp1`, `dfsp2` | Vault, onboarding, shared pages |

- **Expected Result:** No empty cells, except H6 values when the Hub API gateway needs no token, and
  `MCM_DFSP_CONTACT_EMAIL` when MCM creates no Keycloak accounts.

### Step 4. Turn on gateway access logging

- **Purpose:** Several checks on the shared pages read the ingress gateway's access log. Istio writes
  no access log unless it is turned on.
- **Action:** Confirm access logging is on for the gateway in `<GATEWAY_NAMESPACE>`, for example with
  `meshConfig.accessLogFile: /dev/stdout` or an Istio `Telemetry` resource.
- **Command or Configuration:**

  ```bash
  kubectl -n <GATEWAY_NAMESPACE> logs -l <GATEWAY_SELECTOR_KEY>=<GATEWAY_SELECTOR_VALUE> --tail=5
  ```

- **Expected Result:** Recent request lines appear (send any request through the gateway first).
- **If It Fails:** Ask the cluster administrator to turn on access logging for that gateway.

## Verification

| Check | Pass |
|---|---|
| Step 2 | Token has `aud: connection-manager-api` and `groups`; Hub CA returned |
| Negative: call `<MCM_BASE_URL>/hub/ca` with no `Authorization` header | MCM refuses it. If it answers, MCM is not checking tokens; raise it with the Hub operator before you continue. |
| Step 3 | Every required cell filled |
| Step 4 | Gateway access log shows requests |

## Troubleshooting

- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)

## Rollback or Recovery

Not applicable. This page changes nothing except, optionally, gateway access logging, which you can
turn off again the same way.

## References

- [MCM endpoints](../../reference/mcm-endpoints.md)
- [Environment variables](../../reference/environment-variables.md)
- [Glossary](../../reference/glossary.md)
