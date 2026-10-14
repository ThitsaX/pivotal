# Configure Vault

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

In the HSM-backed profile, Vault holds:

- the two intermediate CAs (created by the [CA ceremony](3-ca-ceremony.md));
- crypto-user credentials (`pivotal-kv/pivotal/hsmcred/<NAME>`, fields `username` and `password`);
- key references (`pivotal-kv/pivotal/keyref/<DFSP_ID>`, field `keyRef`): the label of each
  tenant's key inside the HSM.

Vault holds **no private key** in this profile. But a crypto-user credential lets its holder sign
inside the HSM, so the Vault policies are still the boundary between tenants.

This page writes one policy and one Kubernetes auth role per Pivotal service. Every service logs in
with its own Kubernetes ServiceAccount; nothing is distributed by hand.

## Objective

Create the policies and Kubernetes auth roles that let each service read only what it needs.

## Expected Outcome

| Service | Vault role | Can do | Cannot do |
|---|---|---|---|
| web-outbound | `pivotal-web-outbound` | Read its own crypto-user credential (`hsmcred/web-outbound`) and every tenant's keyRef | Read any tenant's credential; sign certificates |
| web-pivotal | `pivotal-web-pivotal` | Sign DFSP client certificates | See the note on web-pivotal below |
| trust-manager | `pivotal-trust-manager` | Sign the Hub callback certificate; read the DFSP CA chain | Read any credential or keyRef |
| cert-manager | `pivotal-cert-manager` | Sign the web-inbound server certificate | Anything else |
| Each connector | `pivotal-<DFSP_ID>-connector` | Read **its own** credential and keyRef only | Read any other tenant's |

web-inbound needs no Vault access.

> **web-pivotal under `pkcs11` is completed with the next release.** Its key-reference access depends
> on the DFSP onboarding procedure for this profile, which changes in that release. Until then this
> page gives web-pivotal only certificate signing. See
> [Known limitations](../../known-limitations.md#pkcs11-dfsp-onboarding-is-not-available-yet).

## Prerequisites

### Mandatory

| Item | Notes |
|---|---|
| [Run the CA ceremony](3-ca-ceremony.md) completed and verified | The PKI policies name its mounts and roles |
| The KV v2 mount `pivotal-kv` | Created in [Prepare the CloudHSM cluster](2-hsm.md), Step 8 |
| The credential `pivotal-kv/pivotal/hsmcred/web-outbound` | Same step |
| A Vault token that can enable auth methods and write policies and auth roles | |
| `VAULT_ADDR` and `VAULT_TOKEN` set in your shell | Any shell that reaches Vault; the HSM admin pod works |
| `<CERT_MANAGER_NAMESPACE>` and `<CERT_MANAGER_VAULT_SA>` | The [shared worksheet](../common/hub-operator-and-worksheet.md#step-3-fill-in-the-worksheet). The ServiceAccount is created later, on the inbound page. |

### Optional

None.

## Steps

### Step 1. Check the KV mount

- **Purpose:** the services read KV version 2 paths. A version 1 mount fails silently.
- **Command or Configuration:**

  ```bash
  vault secrets list -detailed | grep '^pivotal-kv/'
  ```

- **Expected Result:** the line shows `version:2`.
- **If It Fails:** if the mount is missing, create it: `vault secrets enable -path=pivotal-kv
  -version=2 kv`. If it is version 1, stop and use a new version 2 mount.

### Step 2. Enable Kubernetes authentication

- **Purpose:** let each pod log in with its ServiceAccount token.
- **Action:** run only if `vault auth list` does not show `kubernetes/`. The configuration below is
  for a Vault running inside the same cluster and runs inside the Vault pod. For a Vault outside the
  cluster, follow HashiCorp's Kubernetes auth documentation.
- **Command or Configuration:**

  ```bash
  vault auth enable kubernetes

  kubectl -n <VAULT_NAMESPACE> exec -it <VAULT_POD> -- sh -c \
    'VAULT_TOKEN=<ADMIN_TOKEN> vault write auth/kubernetes/config \
       kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443"'
  ```

- **Expected Result:** `Success! Enabled kubernetes auth method at: kubernetes/` and
  `Success! Data written to: auth/kubernetes/config`.
- **If It Fails:** `path is already in use` means it is already enabled. Skip this step.

### Step 3. Write the policies

- **Purpose:** give each service the narrowest access it needs.
- **Command or Configuration:**

  ```bash
  vault policy write pivotal-web-outbound - <<'EOF'
  path "pivotal-kv/data/pivotal/hsmcred/web-outbound" { capabilities = ["read"] }
  path "pivotal-kv/data/pivotal/keyref/*"             { capabilities = ["read"] }
  path "sys/internal/ui/mounts/pivotal-kv"            { capabilities = ["read"] }
  EOF

  vault policy write pivotal-web-pivotal - <<'EOF'
  path "pki_dfsp/sign/dfsp-client" { capabilities = ["create", "update"] }
  EOF

  vault policy write pivotal-trust-manager - <<'EOF'
  path "pki_hub_client/sign/hub-callback-client" { capabilities = ["create", "update"] }
  path "pki_dfsp/ca_chain"                       { capabilities = ["read"] }
  EOF

  vault policy write pivotal-cert-manager - <<'EOF'
  path "pki_hub_client/sign/web-inbound-server" { capabilities = ["create", "update"] }
  EOF
  ```

  - web-outbound reads **one** credential (its own) and **every** keyRef: it logs in to the HSM as
    `cu_web_outbound`, and reaches each tenant's key because the key is shared with that user.
  - `sys/internal/ui/mounts/pivotal-kv` lets a service confirm the mount is version 2. Without it
    the service logs a warning and continues.

- **Expected Result:** `Success! Uploaded policy: <name>` four times.
- **If It Fails:** a syntax error names the line. Check the heredoc was pasted unchanged.

### Step 4. Create the Kubernetes auth roles

- **Purpose:** bind each policy to exactly one ServiceAccount in one namespace.
- **Action:** create one role per service. The ServiceAccount names are the chart defaults.
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
- **If It Fails:** if you changed a ServiceAccount name in the Helm values, use that name here.
  Never bind a role to the `default` ServiceAccount: every pod in the namespace could then use it.

### Step 5. Know the per-DFSP connector policy

- **Purpose:** each connector signs as its own DFSP only. It gets its own policy and role, created
  when the DFSP is onboarded, not now.
- **Action:** nothing to run now. This is the shape used at onboarding:

  ```bash
  vault policy write pivotal-<DFSP_ID>-connector - <<'EOF'
  path "pivotal-kv/data/pivotal/hsmcred/<DFSP_ID>" { capabilities = ["read"] }
  path "pivotal-kv/data/pivotal/keyref/<DFSP_ID>"  { capabilities = ["read"] }
  path "sys/internal/ui/mounts/pivotal-kv"         { capabilities = ["read"] }
  EOF

  vault write auth/kubernetes/role/pivotal-<DFSP_ID>-connector \
    bound_service_account_names=<CONNECTOR_SERVICE_ACCOUNT> bound_service_account_namespaces=pivotal \
    policies=pivotal-<DFSP_ID>-connector ttl=1h
  ```

> **Never give a connector a wildcard path.** The crypto-user credential is what the HSM checks. A
> connector that could read every `hsmcred/*` could sign as every DFSP.

## Verification

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | KV mount is version 2 | `vault secrets list -detailed \| grep '^pivotal-kv/'` | `version:2` |
| 2 | Policies exist | `vault policy list` | All four `pivotal-*` names |
| 3 | Roles are bound correctly | `vault read auth/kubernetes/role/pivotal-web-outbound` (and the others) | `bound_service_account_names` and `bound_service_account_namespaces` as written |

**Capability tests.** These use a short-lived token carrying one policy, so no pod is needed yet:

```bash
T=$(vault token create -policy=pivotal-web-outbound -ttl=5m -field=token)
vault token capabilities "$T" pivotal-kv/data/pivotal/hsmcred/web-outbound   # expect: read
vault token capabilities "$T" pivotal-kv/data/pivotal/keyref/ANY             # expect: read
vault token capabilities "$T" pivotal-kv/data/pivotal/hsmcred/ANY_DFSP       # expect: deny
vault token revoke "$T"

T=$(vault token create -policy=pivotal-trust-manager -ttl=5m -field=token)
vault token capabilities "$T" pki_hub_client/sign/hub-callback-client        # expect: create, update
vault token capabilities "$T" pivotal-kv/data/pivotal/hsmcred/web-outbound   # expect: deny
vault token revoke "$T"
unset T
```

The two `deny` lines are the negative tests: web-outbound cannot read a tenant's crypto-user
credential, and trust-manager cannot read any.

The login test for each service runs after deployment, in
[Deploy Pivotal](5-deploy-pivotal.md#verification).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A service logs that it could not determine the KV version | Its policy lacks `sys/internal/ui/mounts/pivotal-kv` | Add the line (Step 3). Harmless otherwise |
| A service logs `permission denied` from Vault | The role is bound to a different ServiceAccount or namespace, or the policy path is wrong | Verification 3, then compare with the pod's `serviceAccountName` |

More: [Troubleshooting: Vault](../../troubleshooting.md#vault).

## Rollback or Recovery

Each object can be removed on its own:

```bash
vault delete auth/kubernetes/role/<ROLE_NAME>
vault policy delete <POLICY_NAME>
```

Do **not** disable `pivotal-kv` once any DFSP is onboarded. It holds every crypto-user credential.
Without a credential, no service can use that tenant's key, even though the key is still in the HSM,
until a Crypto Officer resets the crypto user's password.

## References

- [Vault reference](../../reference/vault.md)
- [Environment variables](../../reference/environment-variables.md)
- [Prepare the CloudHSM cluster](2-hsm.md)
- Next: [Deploy Pivotal](5-deploy-pivotal.md)
