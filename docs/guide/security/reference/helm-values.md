# Helm Values

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

Only the chart values that affect mutual TLS, JWS and key custody are listed. Every other value is
documented in `helm/values.yaml`.

The chart's defaults set only each service's port variable. Everything on this page is **off or
empty until you set it**. Environment variable meanings are in
[environment-variables.md](./environment-variables.md).

---

## How environment variables reach a service

Source: `helm/templates/apps.yaml`.

| Value | Rendered into | Rule |
|---|---|---|
| `global.commonFspiopEnv` | web-outbound, web-inbound, every connector | Merged **under** the service's own `env`. A value set on the service wins. |
| `<service>.env` | that service | A value is a string, or a `valueFrom` block (for example `secretKeyRef`). |
| `connectors[].env` | that connector | Same merge as a service. |
| `global.database.*`, `global.secrets.*` | services with a database (not the portal) | Produces `DB_WRITE_*` and `DB_READ_*`. Not related to mTLS or JWS. |

Services: `webOutbound`, `webInbound`, `webPivotal`, `portal`, `appAuditor`, `reportWorker`,
`trustManager`.

---

## Per-service keys used for mTLS and JWS

Source: `helm/templates/apps.yaml`; `helm/templates/serviceaccounts.yaml`.

| Key | Default | Purpose |
|---|---|---|
| `<service>.enabled` | `true`, except `reportWorker` and `trustManager` (`false`) | Renders the Deployment. |
| `<service>.serviceAccount.create` | `true` | Creates the ServiceAccount. |
| `<service>.serviceAccount.name` | the service name, for example `web-outbound` | The name Vault's Kubernetes auth role must be bound to. |
| `<service>.volumes` | unset | Secrets holding certificate files, for example the Hub client certificate and Hub CA bundle. |
| `<service>.volumeMounts` | unset | Where those files appear. Point the `FSPIOP_MTLS_*_PATH` variables at them. |
| `connectors[].name` | — | Deployment name. |
| `connectors[].enabled` | — | Renders the connector. |
| `connectors[].serviceAccount` | unset: the pod runs as `default` and no account is created | **Set `{create: true, name: <name>}`.** Each connector needs its own account, because each signs as its own tenant and Vault binds its role to that name. `name` defaults to the connector name. |
| `connectors[].volumes`, `connectors[].volumeMounts`, `connectors[].env` | unset | As for a service. |
| `global.connectorLabel` | `dfsp` | Value of the `connector` label on connector pods. `""` leaves it off. |

---

## trust-manager

Source: `helm/values.yaml` (`trustManager`); `helm/templates/trust-manager-rbac.yaml`.

| Key | Default | Purpose |
|---|---|---|
| `trustManager.enabled` | `false` | Deploys trust-manager. Needs the MCM Secret and the `pivotal-hub-client-ca` Secret to exist first. |
| `trustManager.serviceAccount.name` | `trust-manager` | Bound to trust-manager's Vault role and to the Roles below. |
| `trustManager.env` | `{}` | See [environment-variables.md](./environment-variables.md#trust-manager). |
| `trustManager.volumes`, `trustManager.volumeMounts` | unset | Mount Secret `pivotal-hub-client-ca` and point `PIVOTAL_CA_PATH` at `ca.pem` in it. |

The chart creates these RBAC objects when `trustManager.enabled` is `true`:

| Object | Namespace | Grants |
|---|---|---|
| Role and RoleBinding `<sa>-certs` | release namespace | `get`, `patch` on the Secrets named by `HUB_CA_SECRET_NAME` (default `hub-ca-bundle`) and `HUB_SERVER_CERT_SECRET_NAME` (default `hub-server-cert`); `create` on Secrets |
| Role and RoleBinding `<sa>-dfsp-ca` | `DFSP_CA_GATEWAY_NAMESPACE` | `get`, `patch` on the one Secret `DFSP_CA_GATEWAY_SECRET_NAME`. Rendered only when both variables are set. No `create`: the Secret must already exist. |

The names come from `trustManager.env`. Set them there, not elsewhere, or the Role names the
wrong Secret.

---

## HSM admin pod (`pkcs11` only)

Source: `helm/values.yaml` (`hsmTools`), `helm/templates/hsm-tools.yaml`.

| Key | Default | Meaning |
|---|---|---|
| `hsmTools.enabled` | `false` | Renders the `hsm-tools` Deployment and its ServiceAccount. |
| `hsmTools.replicaCount` | `0` | Kept at zero; a custodian scales it to 1 for a session. Under ArgoCD self-heal, ignore differences on `/spec/replicas`. |
| `hsmTools.image.repository`, `hsmTools.image.tag` | `ghcr.io/thitsax/pivotal-hsm-tools`, tag `""` (required when enabled: set it to your Pivotal release, or rendering fails with `hsmTools image.tag is required`) | The image with the pinned CloudHSM and Vault tools and both custodian scripts. |
| `hsmTools.cloudhsmIp` | `""` | Required when enabled. IP address of one HSM; becomes `CLOUDHSM_IP`. |
| `hsmTools.vaultAddress` | `""` | Required when enabled. Vault's in-cluster address; becomes `VAULT_ADDR`. |
| `hsmTools.customerCaConfigMap` | `cloudhsm-customer-ca` | ConfigMap with the key `customerCA.crt`, mounted at `/opt/cloudhsm/etc/customerCA.crt`. |
| `hsmTools.resources` | `global.defaultResources` | |

Fixed in the template: no ServiceAccount token, Istio sidecar off, runs as user 10001, `/tmp` is an
`emptyDir` that goes with the pod.

---

## Istio

Source: `helm/templates/istio-*.yaml`. Each list is off by default (`enabled: false`) and renders
its items as written.

| Key | Renders | Used for |
|---|---|---|
| `istio.gateways` | `Gateway` | DFSP-facing gateway (`tls.mode: OPTIONAL_MUTUAL`, later `MUTUAL`); Pivotal callback gateway (`tls.mode: MUTUAL`, `credentialName: pivotal-web-inbound-hub-tls`). An item with `enabled: false` is skipped. |
| `istio.virtualServices` | `VirtualService` | Route each gateway host to web-outbound (port 3200) or web-inbound (port 3201). An item with `enabled: false` is skipped. |
| `istio.destinationRules` | `DestinationRule` | Renders only `host`, `trafficPolicy.tls.mode`, `insecureSkipVerify` and the `connectionPool` keep-alive and idle settings. Other fields (`credentialName`, `sni`, `subjectAltNames`) are dropped. |
| `istio.authorizationPolicies` | `AuthorizationPolicy` | As written. |
| `istio.serviceEntries` | `ServiceEntry` | Hosts resolved inside the mesh. |
| `istio.envoyFilters` | `EnvoyFilter` | Item keys: `name`, `namespace`, `enabled`, `workloadLabels`, `forwardClientCertDetails`. Needed on web-outbound with `forwardClientCertDetails: FORWARD_ONLY`, so the DFSP's verified certificate reaches it in the `x-forwarded-client-cert` header. Only items with `enabled: true` render. |

The chart does **not** create a gateway's `<credentialName>-cacert` Secret. See
[kubernetes-resources.md](./kubernetes-resources.md).

---

## cert-manager

Source: `helm/templates/cert-manager.yaml`. Each `spec` is rendered as written.

| Key | Renders | Used for |
|---|---|---|
| `certManager.clusterIssuers.enabled`, `.items[]` (`name`, `spec`) | `ClusterIssuer` | The issuer that signs the web-inbound server certificate on `pki_hub_client/sign/web-inbound-server`. |
| `certManager.certificates.enabled`, `.items[]` (`name`, `namespace`, `spec`) | `Certificate` | The web-inbound server certificate, written to Secret `pivotal-web-inbound-hub-tls` in the gateway's namespace. |

---

## Values examples in `values.yaml`

These commented examples in `helm/values.yaml` show the mTLS and JWS settings for each service.
Copy them into your own values file and replace the example host names.

| Section | Shows |
|---|---|
| `webOutbound.env`, `webOutbound.volumes` | JWS signing, Hub mutual TLS from mounted Secrets `pivotal-hub-client-cert` and `hub-ca-bundle`, `DFSP_FACING_MTLS_MANDATORY`, `KEY_PROVIDER` and Vault |
| `webInbound.env` | `FSPIOP_USE_JWS`, `FSPIOP_JWS_VERIFY_MODE`, `FSPIOP_USE_MUTUAL_TLS` |
| `webPivotal.env` | DFSP certificate issuance, `KEY_PROVIDER` and Vault |
| `trustManager.env`, `trustManager.volumes` | MCM, `PIVOTAL_CA_PATH`, Hub client and callback certificates, Vault, DFSP CA publishing |
| `connectors` | A connector with JWS, mutual TLS and `VAULT_URL` |
| `istio.gateways`, `istio.virtualServices`, `istio.envoyFilters` | The two gateways, their routes, and the `FORWARD_ONLY` filter |
| `certManager.clusterIssuers`, `certManager.certificates` | The web-inbound server certificate issuer and certificate |
