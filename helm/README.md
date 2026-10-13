# Helm Chart: pivotal-stack

Deploys Pivotal on Kubernetes:

- **Services:** `web-outbound`, `web-inbound`, `web-pivotal`, `portal`, `app-auditor`, `report-worker`,
  `trust-manager`
- **DFSP connectors:** any number, from the `connectors` list
- **Optional Istio resources:** Gateways, VirtualServices, DestinationRules, AuthorizationPolicies,
  EnvoyFilters, ServiceEntries
- **Optional cert-manager resources:** ClusterIssuers and Certificates
- **Optional OpenTelemetry auto-instrumentation** for the Java connectors
- **Optional bundled MySQL, NATS and Redis:** for evaluation only

## Install

```bash
helm upgrade --install pivotal-stack ./helm -n pivotal --create-namespace -f my-values.yaml
```

`values.yaml` documents every setting. Start from it and override what your environment needs:
image tags, Hub URLs, Vault, MCM, and the database.

## How values are laid out

| Block | What it controls |
|---|---|
| `global` | Image registry and pull secrets, security contexts, resources, rollout strategy, database connection, shared FSPIOP env, connector label |
| `istio.*` | Istio resources. Each list is off by default and renders its items as written. An item with `enabled: false` is skipped. |
| `tracing` | OpenTelemetry Instrumentation for the connectors, off by default |
| `certManager.*` | cert-manager ClusterIssuers and Certificates, rendered as written |
| `mysql`, `nats`, `redis` | Bundled infrastructure, off by default |
| `webOutbound`, `webInbound`, `webPivotal`, `portal`, `appAuditor`, `reportWorker`, `trustManager` | One block per service: `enabled`, `image`, `replicaCount`, `serviceAccount`, `service`, `env`, `volumes`, `volumeMounts`, `resources`, probes, `podAnnotations`, `deploymentStrategy` |
| `connectors` | One list entry per DFSP connector, with the same keys as a service, plus `tracing.enabled` |

### Environment variables

- A service's `env` is merged over `global.commonFspiopEnv`. **A value set on the service wins.**
- `global.commonFspiopEnv` is rendered into web-outbound, web-inbound and every connector.
- An env value can be a plain string or a `valueFrom` block, for example:

```yaml
MCM_CLIENT_SECRET:
  valueFrom:
    secretKeyRef: {name: trust-manager-mcm, key: MCM_CLIENT_SECRET}
```

- The chart's defaults set only each service's port variable. Everything else is a commented
  example in `values.yaml`, so no default can override a value you set in the shared block.
- Services with a database get `DB_WRITE_*` and `DB_READ_*` from `global.database`. Set
  `writeHost` and `readHost` to split them; both fall back to `host`.
- The passwords come from the Secret named in `global.secrets.existingSecret`. If none is set, the
  chart creates one from `global.secrets.*Password`.

### Service accounts

Every service and connector gets its own ServiceAccount. Vault's Kubernetes auth binds roles to
these names. Set `serviceAccount.create: false` if the account is managed elsewhere.

### trust-manager

`trustManager.enabled` is `false` by default. Before you turn it on:

1. Create the Secret holding the MCM client secret (`trust-manager-mcm`).
2. Create the Secret holding Pivotal's Hub-facing root CA from the ceremony
   (`pivotal-hub-client-ca`, key `ca.pem`).
3. Fill in the MCM, Vault and certificate settings in `trustManager.env`.

The chart grants trust-manager write access to two named Secrets in its own namespace: the Hub CA
bundle and the Hub client certificate. If `DFSP_CA_GATEWAY_NAMESPACE` and
`DFSP_CA_GATEWAY_SECRET_NAME` are set, it also grants write access to that one Secret in the
gateway's namespace.

### Not created by this chart

Create these once, by hand:

| What | Why |
|---|---|
| The `<credentialName>-cacert` Secrets that Istio gateways read their trust anchors from | trust-manager keeps the DFSP-facing one up to date. A Helm-rendered Secret would be reset on every upgrade. |
| Vault mounts, roles and policies | Set up in the CA ceremony |

## Local k3d

```bash
helm upgrade --install pivotal-stack ./helm -f helm/values-local-k3d.yaml
```

The overlay runs only the Pivotal services under test; MySQL, NATS, Redis and Mojaloop stay in
Docker Compose. `cert-manager-issuers.yaml` is a separate sample for that cluster, applied with
`kubectl apply -f`. Helm does not render it.

## Changes from chart 0.1.x

The values layout changed. If you are upgrading, move your settings across:

| 0.1.x | 0.2.x |
|---|---|
| `wallet1Connector`, `wallet2Connector`, `wallet3Connector` | entries in `connectors` |
| `global.commonDbEnv` (including plaintext passwords) | `global.database`, plus `global.secrets` or an existing Secret |
| `global.hubCaSecretName`, `global.hubServerCertSecretName`, `global.hubClientCertSecretName` and the built-in mounts | `volumes` and `volumeMounts` on each service |
| `trustManager.dfspCaGateway.*` | `trustManager.env.DFSP_CA_GATEWAY_NAMESPACE` and `DFSP_CA_GATEWAY_SECRET_NAME` |
| `mysql`, `nats`, `redis` enabled by default | off by default |
| No trust-manager Deployment | `trustManager.enabled: true` deploys it |
| Many env defaults (Hub URLs, Vault, report and S3 settings) | Port variables only; set the rest yourself |

## Moving an environment from its own copy of the chart

The gitops repositories each carry a copy of this chart's earlier design. Their values files work
with this chart, with these differences:

| Difference | What to do |
|---|---|
| Every service gets its own ServiceAccount. Copies without `serviceAccount` settings ran as `default`. | Nothing, unless something is bound to `default`: Vault roles, pull secrets attached to the account. Move those bindings to the new account names first. |
| Connector pods carry the label `connector: dfsp`. | Set `global.connectorLabel` to the value your copy used, or to `""` for none. |
| A copy with built-in per-workload Hub client certificates (`hubClientCertificates`, `global.hubServerCa`) | Express them with `certManager.certificates.items` plus `volumes`, `volumeMounts` and env on each workload. |
