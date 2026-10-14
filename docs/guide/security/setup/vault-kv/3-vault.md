# 3. Vault (vault-kv)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: vault-kv · Document version 1.0 (draft)

## Overview

In the `vault-kv` profile, Vault holds three things for Pivotal:

- the two intermediate CAs (created by the ceremony on the previous page);
- each DFSP's Hub JWS signing key, in a KV version 2 mount;
- the access rules that decide which Pivotal service may read or write each of them.

Every Pivotal service logs in to Vault with its own Kubernetes ServiceAccount. Nothing else is
distributed, and nothing needs rotating by hand.

## Objective

Create the KV mount, one policy per service, and one Kubernetes auth role per service.

## Expected Outcome

| Service | Vault role | Can do | Cannot do |
|---|---|---|---|
| web-outbound | `pivotal-web-outbound` | Read every DFSP's signing key | Write keys; sign certificates |
| web-pivotal | `pivotal-web-pivotal` | Create a DFSP's signing key at onboarding; sign DFSP client certificates | Sign Hub-facing certificates |
| trust-manager | `pivotal-trust-manager` | Sign the Hub callback certificate; read the DFSP CA chain | Read any signing key |
| cert-manager | `pivotal-cert-manager` | Sign the web-inbound server certificate | Anything else |
| Each connector | `pivotal-<DFSP_ID>-connector` | Read **its own** DFSP's signing key only | Read any other key |

web-inbound needs no Vault access.

The connector roles are created per DFSP during onboarding, not on this page.

## Prerequisites

### Mandatory

- [2. CA ceremony](./2-ca-ceremony.md) completed and verified.
- A Vault token that can enable secrets engines and auth methods, write policies and write auth roles.
- `VAULT_ADDR` set in your shell to a reachable Vault address.
- From the [shared worksheet](../common/hub-operator-and-worksheet.md#step-3-fill-in-the-worksheet):
  the Pivotal namespace, `<CERT_MANAGER_NAMESPACE>` and `<CERT_MANAGER_VAULT_SA>`. The ServiceAccount
  does not need to exist yet; it is created on the inbound page.

### Optional

- None.

## Steps

### Step 1. Create the KV version 2 mount

- **Purpose:** Hold the Hub JWS signing keys.
- **Action:** Enable a KV engine at `pivotal-kv`, version 2.
- **Command or Configuration:**

  ```bash
  vault secrets enable -path=pivotal-kv -version=2 kv
  ```

- **Expected Result:** `Success! Enabled the kv secrets engine at: pivotal-kv/`
- **If It Fails:** `path is already in use` means it exists. Check its version (Verification 1). If
  it is version 1, use a different path for Pivotal; do not convert a mount that holds other data.

> **It must be version 2.** The services refuse a mount they can confirm is version 1, because
> reads and writes would land at paths no `vault kv` command shows.

### Step 2. Enable Kubernetes authentication

- **Purpose:** Let each pod log in with its ServiceAccount token.
- **Action:** Enable the method if `vault auth list` does not show `kubernetes/`, then configure it.
  The configuration below is for a Vault running inside the same cluster; it is run inside the Vault
  pod. For a Vault outside the cluster, follow HashiCorp's Kubernetes auth documentation.
- **Command or Configuration:**

  ```bash
  vault auth enable kubernetes

  kubectl -n <VAULT_NAMESPACE> exec -it <VAULT_POD> -- sh -c \
    'VAULT_TOKEN=<ADMIN_TOKEN> vault write auth/kubernetes/config \
       kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443"'
  ```

- **Expected Result:** `Success! Enabled kubernetes auth method at: kubernetes/` and
  `Success! Data written to: auth/kubernetes/config`.
- **If It Fails:** `path is already in use` means it is already enabled; skip to the configuration
  only if logins later fail.

### Step 3. Write the policies

- **Purpose:** Give each service the narrowest access it needs.
- **Action:** Write the four service policies.
- **Command or Configuration:**

  ```bash
  vault policy write pivotal-web-outbound - <<'EOF'
  path "pivotal-kv/data/pivotal/jwskey/*"  { capabilities = ["read"] }
  path "sys/internal/ui/mounts/pivotal-kv" { capabilities = ["read"] }
  EOF

  vault policy write pivotal-web-pivotal - <<'EOF'
  path "pivotal-kv/data/pivotal/jwskey/*"  { capabilities = ["create", "read", "update"] }
  path "sys/internal/ui/mounts/pivotal-kv" { capabilities = ["read"] }
  path "pki_dfsp/sign/dfsp-client"         { capabilities = ["create", "update"] }
  EOF

  vault policy write pivotal-trust-manager - <<'EOF'
  path "pki_hub_client/sign/hub-callback-client" { capabilities = ["create", "update"] }
  path "pki_dfsp/ca_chain"                       { capabilities = ["read"] }
  EOF

  vault policy write pivotal-cert-manager - <<'EOF'
  path "pki_hub_client/sign/web-inbound-server" { capabilities = ["create", "update"] }
  EOF
  ```

  - `sys/internal/ui/mounts/pivotal-kv` lets a service confirm the mount is version 2. Without it
    the service logs a warning and continues.
  - web-pivotal needs `read` on the key path because it reads before it writes, so a write never
    removes other fields.

- **Expected Result:** `Success! Uploaded policy: <name>` four times.
- **If It Fails:** A syntax error names the line. Check that the heredoc was pasted without changes.

### Step 4. Create the Kubernetes auth roles

- **Purpose:** Bind each policy to exactly one ServiceAccount in one namespace.
- **Action:** Create one role per service. The ServiceAccount names are the chart defaults.
- **Command or Configuration:**

  ```bash
  vault write auth/kubernetes/role/pivotal-web-outbound \
    bound_service_account_names=web-outbound bound_service_account_namespaces=pivotal \
    policies=pivotal-web-outbound ttl=1h

  vault write auth/kubernetes/role/pivotal-web-pivotal \
    bound_service_account_names=web-pivotal bound_service_account_namespaces=pivotal \
    policies=pivotal-web-pivotal ttl=1h

  vault write auth/kubernetes/role/pivotal-trust-manager \
    bound_service_account_names=trust-manager bound_service_account_namespaces=pivotal \
    policies=pivotal-trust-manager ttl=1h

  vault write auth/kubernetes/role/pivotal-cert-manager \
    bound_service_account_names=<CERT_MANAGER_VAULT_SA> \
    bound_service_account_namespaces=<CERT_MANAGER_NAMESPACE> \
    policies=pivotal-cert-manager ttl=1h
  ```

- **Expected Result:** `Success! Data written to: auth/kubernetes/role/<name>` four times.
- **If It Fails:** If you changed a ServiceAccount name in the Helm values, use that name here.

> **Connectors:** each DFSP's connector gets its own policy and role, reading only
> `pivotal-kv/data/pivotal/jwskey/<DFSP_ID>`. Never give a connector the wildcard path: one
> compromised connector could then sign as every DFSP. This is done per DFSP in
> [Onboard a DFSP (vault-kv)](../../runbooks/vault-kv/onboard-dfsp.md).

## Verification

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | KV mount is version 2 | `vault secrets list -detailed \| grep '^pivotal-kv/'` | The options column shows `version:2` |
| 2 | Policies exist | `vault policy list` | All four `pivotal-*` names |
| 3 | Roles are bound correctly | `vault read auth/kubernetes/role/pivotal-web-outbound` (and the others) | `bound_service_account_names` and `bound_service_account_namespaces` as written |

**Capability tests.** These use a short-lived token carrying one policy, so no pod is needed yet:

```bash
T=$(vault token create -policy=pivotal-web-outbound -ttl=5m -field=token)
vault token capabilities "$T" pivotal-kv/data/pivotal/jwskey/ANY      # expect: read
vault token capabilities "$T" pki_dfsp/sign/dfsp-client               # expect: deny
vault token revoke "$T"

T=$(vault token create -policy=pivotal-trust-manager -ttl=5m -field=token)
vault token capabilities "$T" pki_hub_client/sign/hub-callback-client # expect: create, update
vault token capabilities "$T" pivotal-kv/data/pivotal/jwskey/ANY      # expect: deny
vault token revoke "$T"
unset T
```

The two `deny` lines are the negative tests: web-outbound cannot issue certificates, and
trust-manager cannot read signing keys.

The login test for each service runs after deployment, in
[4. Deploy Pivotal](./4-deploy-pivotal.md#verification).

## Troubleshooting

- [Vault](../../troubleshooting.md#vault)

## Rollback or Recovery

Each object can be removed on its own. Nothing on this page holds key material yet.

```bash
vault delete auth/kubernetes/role/<ROLE_NAME>
vault policy delete <POLICY_NAME>
vault secrets disable pivotal-kv      # only before any DFSP is onboarded: this deletes every key in it
```

## References

- [Vault reference](../../reference/vault.md)
- [Security model](../../concepts/security-model.md)
- Next: [4. Deploy Pivotal](./4-deploy-pivotal.md)
