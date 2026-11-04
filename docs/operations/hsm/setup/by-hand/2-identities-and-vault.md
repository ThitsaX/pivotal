# 2. Workload Identities and the Vault Foundation

> Second of four. Runs after [`1-verify-cluster.md`](./1-verify-cluster.md) and before
> [`3-prepare-for-ceremony.md`](./3-prepare-for-ceremony.md). See [`README.md`](./README.md) for
> the sequence.

Everything here depends only on the chart and Vault. **No certificate authority is involved**,
which is why it can land — and be proven — long before the ceremony. Nothing in it changes
behaviour: accounts with no roles attached, and Vault roles nothing has logged into yet.

---

## A. Where each piece lives

Nothing here is applied by hand. Each directory is owned by an ArgoCD Application that syncs it
automatically, and knowing which is which saves reaching for a manual sync that does nothing.

| What you change | Directory | Application | Wave |
| --- | --- | --- | --- |
| Vault mounts, policies, auth roles, cert-manager issuers | `apps/vault-pki-setup/` | `vault-pki-app` | -5 |
| Secrets the chart mounts | `apps/pivotal/secrets/` | `pivotal-secrets-app` | -1 |
| The workloads themselves | `apps/pivotal/` | `pivotal` | 0 |

**The waves order the bootstrap, not ongoing reconciliation.** The Applications are applied one at
a time when the cluster is first built; after that each polls and syncs independently, and the
annotation has no effect. Where order genuinely matters, sync by hand in that order — do not rely
on the numbers.

Every one of these Applications has `automated` with `selfHeal`, so **merging is deploying**.
There is no separate step, and a feature branch deploys nothing: they track the default branch.

## B. Give every workload its own Kubernetes identity

Vault binds an auth role to a ServiceAccount name and namespace. While every pod runs as `default`
that binding is namespace-wide — any workload could read any other's private keys — so per-tenant
scoping cannot even be expressed. Nothing else is worth doing first.

Three changes in the chart:

- `templates/serviceaccounts.yaml` — one account per component, and one per connector
- `templates/apps.yaml` — `serviceAccountName` in both the workload loop and the connector loop
- `values.yaml` — a `serviceAccount: {create, name}` block per component and per connector

**Include the connectors.** Each is a participant that signs as itself, and they are the reason
per-tenant scoping exists. A port that covers only the platform services is cosmetic.

This is inert on its own: an account with no Vault role attached grants nothing. The pods roll
once and come back identical. Proved by **Confirm it landed** below.

## C. Vault policies and auth roles — the KV half

One file, `apps/vault-pki-setup/pivotal-trust-pki.yaml`: the KV v2 mount, one policy per workload,
one `KubernetesAuthEngineRole` per workload bound to the account from B.

The shape that matters is the narrowness. `web-outbound` reads the whole `jwskey` prefix because it
signs for every tenant it fronts; `web-pivotal` writes it because it provisions; **each connector
reads exactly one path, its own**. A shared wildcard for connectors would mean compromising one
participant's connector yields every participant's signing key.

Declare the mount as **version 2** explicitly. Against a version 1 mount the clients round-trip
perfectly while storing everything at a literal `data/...` path, so the services work and
`vault kv` commands address somewhere else entirely — a key written by hand is invisible to the
service that needs it, and nothing reports a fault.

Split this from the PKI half deliberately. It depends on nothing but Vault, so it can land — and be
proven — long before a certificate authority exists.

---

## Confirm it landed

The resources existing in Kubernetes proves only that Argo created them. The operator reconciles
them into Vault separately, and that can fail while the objects sit there looking healthy.

### The workloads

| # | Command | Purpose |
| --- | --- | --- |
| 1 | `kubectl -n pivotal get pods` | The workloads are running, and their age reflects the roll that added the accounts |
| 2 | `kubectl -n pivotal get pods -o 'custom-columns=POD:.metadata.name,SA:.spec.serviceAccountName'` | **The check that matters.** Every workload on an account of its own. A pod still showing `default` did not pick up the chart change |

A hand-made pod such as `hsm-tools` stays on `default`, correctly — it is not chart-managed and
Vault grants it nothing.

### Vault

| # | Command | Purpose |
| --- | --- | --- |
| 3 | `kubectl get secretenginemount,policy,kubernetesauthenginerole -A \| grep pivotal` | The objects exist. Expect the KV mount, one policy per workload, one auth role per workload |
| 4 | `kubectl -n argocd get policy,kubernetesauthenginerole,secretenginemount -o 'custom-columns=NAME:.metadata.name,STATUS:.status.conditions[-1].reason' \| grep pivotal` | **Whether Vault actually took them.** Every row must read `LastReconcileCycleSucceded` |

Quote the `-o` argument. `zsh` treats `[-1]` as a glob and refuses the command before `kubectl`
sees it.

---

**Next:** [`3-prepare-for-ceremony.md`](./3-prepare-for-ceremony.md).

Nothing above needed the device or a certificate authority. Everything from here does — so if the
cluster is not yet activated, this is the point to stop and wait, with the foundation already
proven.
