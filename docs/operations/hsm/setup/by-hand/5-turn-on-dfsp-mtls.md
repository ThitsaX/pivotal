# 5. Turn On DFSP-Facing Mutual TLS

> Fifth of five. Runs after [`4-after-the-ceremony.md`](./4-after-the-ceremony.md). The generic
> runbook is [`../4-turn-it-on-and-verify.md`](../4-turn-it-on-and-verify.md); this records what was
> run.

Order matters: the trust anchor must exist **before** the gateway asks for certificates, or Istio
cannot validate one and the failure looks like a client problem.

---

## A. The trust anchor — by hand

Istio verifies client certificates against a Secret named after the gateway's `credentialName` with
`-cacert` appended, in the gateway's own namespace, under the key `cacert`. Nothing configures the
name; Istio derives it. trust-manager can `patch` it but not `create` it, so a missing one fails
visibly rather than letting a background service invent an anchor.

| # | Command | Purpose |
| --- | --- | --- |
| 30 | `kubectl -n istio-ingress-ext create secret generic lets-enc-external-tls-cacert --from-file=cacert=<pki_dfsp intermediate>.pem` | The anchor. Content is the **intermediate**, since `DFSP_CA_ROOT_PKI_MOUNT` is empty |
| 31 | `kubectl -n istio-ingress-ext get secret lets-enc-external-tls-cacert -o jsonpath='{.data.cacert}' \| base64 -d \| openssl x509 -noout -subject` | Expect the DFSP-facing intermediate |

**The name says `lets-enc` and the content is yours.** The prefix comes from the *server*
certificate's credential; the `-cacert` companion holds the CA used to verify *clients*. Opposite
directions, one name prefix.

## B. Gateway and sidecar — configuration

| Change | Why |
| --- | --- |
| DFSP-facing host → `mode: OPTIONAL_MUTUAL` | A caller presenting a certificate has it verified; one without is still served while DFSPs migrate |
| Portal hosts kept in a separate `SIMPLE` server block | `OPTIONAL_MUTUAL` makes the gateway *ask* for a certificate, and a browser asked for one prompts the user |
| `templates/istio-envoyfilter.yaml` + `envoyFilters` values, `forwardClientCertDetails: FORWARD_ONLY` on web-outbound | Istio sets this through ProxyConfig only for gateways. Without it the sidecar strips the forwarded header and web-outbound sees every caller as certificate-less — indistinguishable from working |

## C. Let web-pivotal issue certificates — configuration

`PARTICIPANT_CERT_ISSUER_NOT_CONFIGURED` on enrolment means the mount is unset.

| Setting | Value | Why |
| --- | --- | --- |
| `DFSP_CERT_PKI_MOUNT` | `pki_dfsp` | Absent means the deployment issues no DFSP certificates |
| `DFSP_CERT_PKI_ROLE` | `dfsp-client` | The issuing role |
| `DFSP_CERT_TTL` | unset | The role's own TTL applies, so validity lives in one place |
| `VAULT_ADDRESS`, `VAULT_AUTH_METHOD`, `VAULT_KUBERNETES_AUTH_PATH`, `VAULT_ROLE` | per deployment | web-pivotal may have none of these; it cannot reach the CA without them |
| `VAULT_KV_MOUNT` | `pivotal-kv` | Not the `secret` default — the wrong mount finds nothing, which reads as a missing key |

Check these land on **web-pivotal** and not a neighbouring component. Rendering the chart and
grepping the output finds the value wherever it is; list it per workload instead:

```bash
helm template . | ruby -ryaml -e 'YAML.load_stream(STDIN.read){|d| next unless d&&d["kind"]=="Deployment";
  e=(d.dig("spec","template","spec","containers",0,"env")||[]).map{|x| x["name"]}.grep(/DFSP_CERT|^VAULT_/)
  puts "#{d.dig("metadata","name")}: #{e.join(",")}" }'
```

## D. Enrol a DFSP — by hand

The participant must already exist, or enrolment fails with `UNKNOWN_PARTICIPANT`.

| # | Command | Purpose |
| --- | --- | --- |
| 32 | `openssl req -new -newkey rsa:2048 -nodes -keyout <fsp>.key -subj "/CN=<fspId>" -out <fsp>.csr` | Run by the DFSP. The private key never leaves it |
| 33 | Portal → Participant → Certificates, paste the CSR | Or `POST /participant/certificates` with `{fspId, csrPem, note}`. Needs `participant.certificate.enroll` |

`O` and `OU` come from the Vault role, and the CN from the request rather than the CSR
(`use_csr_common_name=false`) — so a DFSP cannot name itself by crafting its request.

## E. What the publisher's silence means

`DfspCaPublishScheduler` logs only on **change** or **error**; a correct no-op prints nothing.

Its Redis lock (`pivotal:trust:dfsp-ca-publish`) has a TTL of the interval plus 30s, and outlives a
pod restart — so restarting does **not** force a run. To check whether it is due:

```bash
kubectl -n redis exec redis-ha-server-0 -c redis -- \
  redis-cli -a <pw> --no-auth-warning TTL pivotal:trust:dfsp-ca-publish
```

## F. Only then make certificates mandatory

`DFSP_FACING_MTLS_MANDATORY=true` once every DFSP holds a certificate **and has been seen using
it**. Until then a presented certificate is still verified and bound to `fspiop-source`; the flag
only decides whether an absent one is fatal.
