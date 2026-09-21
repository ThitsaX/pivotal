# Services and Gateways — HSM-Backed

> **Applies to both backends** — CloudHSM and SoftHSM. Nothing in this document depends on which
> one you chose.

Wiring the platform to the certificate authorities: Vault auth roles per workload, cert-manager,
MCM, trust-manager, and both gateways.

Run **once per environment**, before onboarding any DFSP. Get here from
[`2-ca-ceremony.md`](./2-ca-ceremony.md) on the CloudHSM path, or straight from
[`1-softhsm-tokens.md`](./1-softhsm-tokens.md) on the SoftHSM one, where the certificate authorities
already exist.

Nothing here is specific to a DFSP. Per-DFSP steps are in
[`../runbooks/onboard-dfsp.md`](../runbooks/onboard-dfsp.md).

> **This section mirrors [`../../kms/setup/2-services-and-gateways.md`](../../kms/setup/2-services-and-gateways.md).**
> Everything except the Vault policies is the same under both profiles — cert-manager, MCM,
> trust-manager and both gateways do not know which profile is in use. If you change those parts
> here, change them there.

---


## 1. Give Vault a Kubernetes auth role for each workload

Pods authenticate to Vault with their own ServiceAccount token. Nothing to distribute, nothing to
rotate.

Enable Kubernetes auth if it is not already on, then create one policy and one role per workload.
The signing services need to read keys; web-pivotal needs to sign DFSP CSRs; trust-manager needs to
read the DFSP CA chain.

Under this profile the Vault path holds a **crypto-user credential and a key reference**, never a
private key — so every workload needs *two* paths rather than one, and the two have different
cardinality. web-outbound authenticates as a single crypto user but reaches every tenant's key
through sharing, so it needs one credential and *N* references.

```bash
# web-outbound: ONE crypto-user credential, and every tenant's keyRef
vault policy write pivotal-hsm-web-outbound - <<'EOF'
path "pivotal-kv/data/pivotal/hsmcred/web-outbound" { capabilities = ["read"] }
path "pivotal-kv/data/pivotal/keyref/*"             { capabilities = ["read"] }
path "sys/internal/ui/mounts/pivotal-kv"            { capabilities = ["read"] }
EOF

# each connector: exactly ONE credential and ONE keyRef, both its own
vault policy write pivotal-hsm-demodfsp1 - <<'EOF'
path "pivotal-kv/data/pivotal/hsmcred/DemoDFSP1" { capabilities = ["read"] }
path "pivotal-kv/data/pivotal/keyref/DemoDFSP1"  { capabilities = ["read"] }
path "sys/internal/ui/mounts/pivotal-kv"         { capabilities = ["read"] }
EOF

# trust-manager: reads every tenant's credential, because generating a key requires
# authenticating as that tenant's own crypto user. That is unavoidable, so the
# control is an alarm on reads of this prefix outside a provisioning window.
vault policy write pivotal-hsm-provision - <<'EOF'
path "pivotal-kv/data/pivotal/hsmcred/*" { capabilities = ["read"] }
path "pivotal-kv/data/pivotal/keyref/*"  { capabilities = ["create", "read", "update"] }
path "sys/internal/ui/mounts/pivotal-kv" { capabilities = ["read"] }
EOF

# web-pivotal: signs DFSP CSRs
vault policy write pivotal-dfsp-sign - <<'EOF'
path "pki_dfsp/sign/dfsp-client" { capabilities = ["create", "update"] }
EOF

# cert-manager: issues Pivotal's own hub-client leaves
vault policy write pivotal-hub-client-sign - <<'EOF'
path "pki_hub_client/sign/pivotal-client" { capabilities = ["create", "update"] }
EOF

# trust-manager: reads the DFSP CA chain to publish it as a trust anchor
vault policy write pivotal-dfsp-ca-read - <<'EOF'
path "pki_dfsp/ca_chain" { capabilities = ["read"] }
EOF
```

> **Give each connector its own policy and its own two paths.** A shared wildcard means compromising
> one connector hands over every tenant's crypto-user credential — and with it the ability to sign as
> any of them. The HSM does not save you here: the credential is what the HSM authenticates, so Vault
> path policy is still the boundary that has to hold.

Then bind each policy to the workload's ServiceAccount with a Kubernetes auth role, and create the
KV v2 mount that holds the signing keys:

```bash
vault secrets enable -path=pivotal-kv -version=2 kv
```

> ⚠ **The KV mount must be version 2.** Against a v1 mount everything appears to work while the
> service and the CLI read completely different locations, and a key written by hand is invisible
> to the service that needs it. Nothing reports an error; the tenant simply never signs.

## 2. Verify the Vault setup before going further

Check in **Vault**, not in Argo CD. Argo CD showing "Synced" only means the manifests were applied,
not that Vault has them yet.

```bash
vault read pki_dfsp/roles/dfsp-client | grep use_csr
```

Both `use_csr_common_name` and `use_csr_sans` must read **false**.

```bash
vault secrets list -detailed | grep pivotal-kv     # must show version 2
vault read pki_hub_client/roles/pivotal-client
```

**Stop here if any of these are wrong.** Nothing later in this guide is safe until they are right.

## 3. Wire cert-manager to the hub-client CA

Pivotal's own workloads (web-outbound and each connector) get their client certificates from
cert-manager, automatically, and renew without any Hub interaction.

Create a `ClusterIssuer` pointing at the hub-client mount:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: pivotal-hub-client-issuer
spec:
  vault:
    path: pki_hub_client/sign/pivotal-client
    server: http://vault.vault.svc.cluster.local:8200
    auth:
      kubernetes:
        role: pivotal-trust-issuer-role
        mountPath: /v1/auth/kubernetes
        serviceAccountRef:
          name: vault-k8s
```

Note it is `sign`, not `issue`. `issue` would have Vault generate the private key, which defeats the
point.

Then enable certificate issuance in the Pivotal chart values:

```yaml
hubClientCertificates:
  enabled: true
  issuerRef: pivotal-hub-client-issuer
  duration: 2160h0m0s      # 90 days
  renewBefore: 720h0m0s    # renew at 60 days
  workloads:
    - name: web-outbound
      commonName: web-outbound.pivotal
    - name: demodfsp1-java-connector
      commonName: demodfsp1-java-connector.pivotal
```

Turning this on is safe on its own — certificates get issued and mounted, and nothing reads them
until you switch mutual TLS on later.

Verify a certificate came out correctly:

```bash
kubectl -n pivotal get secret web-outbound-hub-client-tls \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -issuer -dates
```

> ⚠ **Ask cert-manager for PKCS#8 private keys** (`privateKey.encoding: PKCS8`). cert-manager writes
> PKCS#1 by default, which Node reads fine but which stops a Java connector dead at startup. An
> encoding change alone does not trigger re-issuance — you must delete the Secret so cert-manager
> makes a new one.

## 4. Register Pivotal itself in MCM, and give trust-manager credentials

**Create an OIDC client** for trust-manager in the realm MCM validates against. Confidential client,
client authentication on, service accounts on, every other flow off. Then:

```bash
kubectl -n pivotal create secret generic trust-manager-mcm \
  --from-literal=MCM_CLIENT_SECRET='<from Keycloak>'
```

Confirm it works before anything depends on it:

```bash
curl -s -X POST https://<keycloak>/realms/<realm>/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=pivotal-trust-manager \
  -d client_secret='<secret>' \
  | jq 'if .access_token then "OK" else . end'
```

**Give trust-manager the hub-client root** so it can register it with MCM:

```bash
kubectl -n pivotal create secret generic pivotal-hub-client-ca \
  --from-file=ca.pem=hub-client-root-ca.pem
```

**Register Pivotal as a participant in MCM:**

```bash
curl -s -X POST http://<mcm>/api/dfsps -H 'Content-Type: application/json' \
  -d '{"dfspId":"pivotal","name":"pivotal","monetaryZoneId":"USD"}'
```

Note the `/api` prefix, and call MCM **in-cluster** — the public host sends `/api/*` to an
authorization proxy that expects a browser session.

## 5. Publish the DFSP trust anchor to the gateway

Istio finds a gateway's trust anchor in a Secret named after the credential with `-cacert` added,
in the **gateway workload's** namespace:

```bash
kubectl -n istio-ingress-ext create secret generic <credential-name>-cacert \
  --from-file=cacert=dfsp-intermediate.pem
```

> ⚠ **Publish the intermediate, not the root.** Publishing the root would make certificates from
> every other environment rooted in the same key verify here too.

> ⚠ **Give this host its own credential name.** Istio derives the trust anchor from the credential
> name, so two hosts sharing a credential share an anchor. If the DFSP-facing host and the
> hub-facing host share one, a DFSP's certificate would authenticate on the hub-facing host and the
> two trust domains collapse into each other.

## 6. Enable trust-manager

Set `trustManager.enabled: true` and deploy. It keeps the trust anchor in step from here on; you
created it by hand because the gateway needs it before trust-manager can start.

```bash
kubectl -n pivotal logs deploy/trust-manager --tail=40
```

You should see five jobs start: Hub CA sync, Peer JWS sync, Hub server certificate, MCM CA
registration, DFSP CA publish. A 403 in the first second is the Istio sidecar not being ready yet;
it clears on the next tick.

## 7. Configure the DFSP-facing gateway

Set the host DFSPs will call to `mode: MUTUAL` in your gitops chart, using the credential name from
step 5.

Check it is demanding a certificate:

```bash
curl -sv https://<dfsp-facing-host>/health 2>&1 | tail -5
```

Look for `Request CERT` in the handshake and then a TLS alert about a required certificate. Under
TLS 1.3 this shows up as a **failed read**, not a failed connect, because the handshake completes
before the server rejects you.

## 8. Configure the Hub-facing gateway

This is on the switch's side. You need a host that demands a client certificate from Pivotal.

Add a second host to the switch's existing ingress gateway rather than changing the one everyone
else uses:

```yaml
- hosts:
  - 'extapi-mtls.<your-domain>'
  port:
    name: https-interop-mtls
    number: 443
    protocol: HTTPS
  tls:
    credentialName: extapi-mtls-tls     # its own name, see the warning in step 5
    mode: MUTUAL
```

Then:

**Create the server certificate** for that hostname. A publicly-trusted certificate (Let's Encrypt
via cert-manager) is the easiest option.

> ⚠ **Check the CA can be parsed by Java.** Some internal CAs are built with an empty issuer field,
> which the JVM refuses to parse at all — the connectors then cannot load the trust anchor and fail
> before they reach a handshake. Test it before you rely on it:
> `openssl x509 -in ca.pem -noout -issuer` should not be blank.

**Create the trust anchor** so the gateway accepts Pivotal's certificates:

```bash
kubectl -n istio-ingress-ext create secret generic extapi-mtls-tls-cacert \
  --from-file=cacert=hub-client-intermediate.pem
```

**Add the hostname to the routing rules** so requests do not arrive and then 404.

**Give Pivotal the CA that signed the gateway's server certificate**, as a mounted file:

```yaml
hubServerCa:
  enabled: true
  configMapName: pivotal-hub-server-ca
  pem: |
    -----BEGIN CERTIFICATE-----
    ...
    -----END CERTIFICATE-----
```

> ⚠ **Use a file path, not an inline environment variable.** The Java connectors read the trust
> anchor from disk only, and they build their trust store from that anchor alone — they never fall
> back to the JVM's built-in public authorities. With no file configured they trust nothing, and
> even a publicly-trusted server certificate fails.

> If the certificate chain does not end in a self-signed root, include **both** the served top and
> the self-signed root in this file. OpenSSL will not stop at a trust anchor that is not
> self-signed; the JVM will. Anchoring on only one of them passes in one language and fails in the
> other.

**If Pivotal runs in the same cluster as the switch**, the public hostname may not resolve inside
the cluster. You can resolve it in-mesh instead of publishing it, with a ServiceEntry:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: ServiceEntry
metadata:
  name: extapi-mtls-internal
  namespace: pivotal
spec:
  hosts:
    - extapi-mtls.<your-domain>
  location: MESH_EXTERNAL
  resolution: STATIC
  ports:
    - number: 443
      name: https
      protocol: HTTPS
  endpoints:
    - address: <ingress load balancer IP>
```

> ⚠ Use `MESH_EXTERNAL`, not `MESH_INTERNAL`. Internal makes the sidecar wrap the connection in
> Istio's own mTLS, which the gateway rejects — you get a connection reset before TLS starts.

> ⚠ Point at the **load balancer address**, not the gateway's ClusterIP, if the gateway has a
> `proxy_protocol` listener filter. Every connection then has to arrive with a PROXY protocol
> header, which the load balancer adds and a direct connection does not.

---

---

**Next:** [`4-turn-it-on-and-verify.md`](./4-turn-it-on-and-verify.md) — the environment variables, the order to switch the controls on in, and how to prove each one works.
