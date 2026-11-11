# Running with `DFSP_FACING_MTLS_MANDATORY=false`

Applies to every key-custody profile. Read this before leaving the flag off in a deployed
environment.

## What the flag decides

One thing only: **what an arriving request without a client certificate means.**

| Client certificate | `false` | `true` |
| --- | --- | --- |
| presented | verified in full | verified in full |
| absent | admitted | rejected |

It does **not** turn mutual TLS on or off, and it does not gate the certificate checks. A presented
certificate is always resolved by fingerprint, checked for revocation and validity, and bound to
`fspiop-source` — whatever the flag says. See [`architecture.md`](../internal/design/architecture.md)
§6.1.

## What is true while it is off

**The endpoint is only as protected as the network in front of it.** Any caller can reach it
without a certificate. The JWS signature check still applies, so it is not open — but the transport
identity guarantee is gone, and a leaked access key is enough on its own.

Keep the endpoint behind the network control it relies on, and do not publish it more widely than
that control reaches.

## Three things must line up

The flag only behaves as documented when the layers below it agree.

**1. The gateway must not require a certificate.** With Envoy `mode: MUTUAL` the handshake fails
before a request exists, so the flag is unreachable and the caller sees a TLS alert
(`TLSV1_ALERT_CERTIFICATE_REQUIRED`), not an application error. Use `OPTIONAL_MUTUAL` — it asks for
a certificate, verifies one that is offered, and completes the handshake when none is.

**2. The sidecar must not append to `x-forwarded-client-cert`.** An injected proxy defaults to
`APPEND_FORWARD`, which adds an entry describing the *mesh* peer — the ingress gateway's own
workload certificate. The header is then never absent, so the guard reads a certificate no DFSP
presented, fails to find its fingerprint, and rejects the caller with *"The client certificate
presented is not recognised."* The flag can never take effect, because the branch it governs is
unreachable.

Set the workload's inbound proxy to `FORWARD_ONLY`. This cannot be done with the
`proxy.istio.io/config` annotation — `ProxyConfig` exposes `forwardClientCertDetails` for gateways
only, and the annotation is accepted on the pod and then ignored. It needs an `EnvoyFilter` on the
inbound HTTP connection manager.

The symptom of getting this wrong is distinctive: **the same certificate fingerprint rejected for
several different DFSPs, changing over time.** That is one shared workload certificate being
rotated, not any DFSP's.

**3. Nothing may forge the header.** Both ingress gateways must run `SANITIZE_SET`, which replaces
any caller-supplied `x-forwarded-client-cert` with their own. `FORWARD_ONLY` means the sidecar stops
rewriting it, so the edge is the only place it is sanitised.

> **Gap.** A caller already inside the mesh bypasses both gateways and can set the header itself.
> An `AuthorizationPolicy` restricting inbound traffic to the ingress gateways' service accounts is
> not yet in place.

## Verifying

Startup log line, confirming which mode the service came up in:

```
DFSP-facing mutual TLS is not mandatory. Callers presenting a client certificate are still
verified in full; callers presenting none are admitted, so this endpoint must stay behind the
network control that protects them.
```

Sidecar XFCC handling — expect `FORWARD_ONLY`:

```
POD=$(kubectl -n pivotal get pods -l app.kubernetes.io/component=web-outbound \
  -o jsonpath='{.items[0].metadata.name}')
kubectl -n pivotal exec $POD -c istio-proxy -- \
  curl -s localhost:15000/config_dump | grep -o '"forward_client_cert_details"[^,]*' | sort -u
```

Then check both paths behave: a call with no certificate is admitted, and a call with a valid
certificate whose `fspiop-source` names a different DFSP is rejected.

## Turning it back on

The flag is the final hardening step, flipped once every DFSP has enrolled and migrated. Move both
together, gateway first:

1. Gateway `mode: OPTIONAL_MUTUAL` → `MUTUAL`
2. `DFSP_FACING_MTLS_MANDATORY` → `true`

Leaving the gateway permissive while the flag is on is safe but pointless — the guard rejects what
the gateway already let through. The reverse, gateway strict while the flag is off, is what makes
the flag look broken.

The `FORWARD_ONLY` setting stays correct in both states and should not be reverted.
