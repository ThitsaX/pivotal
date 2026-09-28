# Evidence — all four controls, one transfer, dev2

**Transfer:** `01M217PBTTWJSH1QEN9PPMK06M` · `DemoDFSP3 → DemoDFSP4` · USD 10 · 2026-09-08 19:25–19:26 UTC
**Environment:** `dev2-hub`, Pivotal `v0.2.67`, connectors `pivotal-thitsawallet-connector:v0.0.8`

One transfer that exercises the DFSP-facing leg and both hub-facing legs, with a failed
impersonation attempt against the same endpoint twenty-four seconds earlier. Collected from the
cluster after the fact; every excerpt below is quoted verbatim and says which pod it came from.

**Read the limitations at the end before citing any of this.** Two of the four connectors cannot
do this at all, and the trust domains are rooted in rehearsal keys.

---

## What each control is, and where the evidence for it is

| Control | Direction | Evidence |
| --- | --- | --- |
| DFSP-facing mTLS + certificate binding | DFSP → web-outbound | §1 |
| DFSP-facing accessKey JWS | DFSP → web-outbound | §1 |
| Hub-facing mTLS, payer side (leg #2) | web-outbound → Hub | §2 |
| Hub-facing JWS, payer side (leg #2) | web-outbound → Hub | §2 |
| Hub-facing mTLS, payee side (leg #3) | connector → Hub | §3 |
| Hub-facing JWS, payee side (leg #3) | connector → Hub | §3 |

---

## 1. DFSP-facing — the binding rule refused an impersonation, then admitted the real caller

The strongest single piece of evidence here is a **failure**, because the two requests differ in
exactly one thing.

**19:25:21 — refused.** A caller presented a genuine, current certificate issued by this deployment
to `DemoDFSP3`, while claiming to be `DemoDFSP2`:

```
web-outbound
2026-09-08 19:25:21 ERROR DfspCertificateGuard :
  Rejected: certificate belongs to 'DemoDFSP3' but the request claims fspiop-source 'DemoDFSP2'.
```

```
istio-external-ingress-gw
[2026-09-08T19:25:21.700Z] "PUT /secured/sendmoney/01M217PBTTWJSH1QEN9PPMK06M HTTP/1.1" 401
  "PostmanRuntime/2.5.0" "pivotal.dev2.wynepayhubsanbox-pre.com"
  outbound|3200||web-outbound.pivotal.svc.cluster.local
```

**19:25:45 — admitted.** Same caller, same certificate, `fspiop-source` corrected to `DemoDFSP3`:

```
istio-external-ingress-gw
[2026-09-08T19:25:45.394Z] "PUT /secured/sendmoney/01M217PBTTWJSH1QEN9PPMK06M HTTP/1.1" 200
  "PostmanRuntime/2.5.0" "pivotal.dev2.wynepayhubsanbox-pre.com"
```

**What that proves.** The certificate alone was not enough, and the claimed identity alone was not
enough — only the pairing was. That is the property the leg exists for: a leaked accessKey is not
usable by whoever holds it unless they also hold that tenant's certificate.

Both requests arrived on `pivotal.dev2.wynepayhubsanbox-pre.com`, which is a `mode: MUTUAL` server,
so **neither request could have reached the application without a client certificate at all** — the
gateway refuses those at TLS, before any header is parsed.

The accessKey JWS was verified on the admitted request. `AccessGuard` runs immediately after the
certificate guard and logs only on rejection; it raised nothing, and the request proceeded to the
Hub, which it cannot do unless the signature verified.

> **On the guard's silence.** Neither guard logs a success. Absence of a rejection plus a 200 is the
> positive signal. The rejection above is what shows the check is live rather than absent.

---

## 2. Hub-facing, payer side (leg #2) — web-outbound → Hub, signed and over mutual TLS

**Transport.** Both calls went to the mutual-TLS host, and the gateway recorded them arriving there:

```
web-outbound
[REQ] POST https://extapi-mtls.dev2.wynepayhubsanbox-pre.com/quotes    → [RES] 202 durationMs=126
[REQ] POST https://extapi-mtls.dev2.wynepayhubsanbox-pre.com/transfers → [RES] 202 durationMs=55
```

```
istio-external-ingress-gw
[2026-09-08T19:25:45.436Z] "POST /quotes HTTP/1.1" 202 "axios/1.13.5"
  "extapi-mtls.dev2.wynepayhubsanbox-pre.com" outbound|80||moja-quoting-service.mojaloop.svc.cluster.local
[2026-09-08T19:26:13.373Z] "POST /transfers HTTP/1.1" 202 "axios/1.13.5"
  "extapi-mtls.dev2.wynepayhubsanbox-pre.com" outbound|80||moja-ml-api-adapter-service.mojaloop.svc.cluster.local
```

`extapi-mtls` is `mode: MUTUAL` anchored solely on `pki_hub_client`. A caller presenting no
certificate is refused with alert 116 (§5). These returned 202, so a certificate was presented and
accepted.

**Signing.** Both requests carried a detached JWS with a conformant protected header:

```
POST /quotes
  fspiop-source: DemoDFSP3   fspiop-destination: DemoDFSP4
  fspiop-uri: /quotes        fspiop-http-method: POST
  date: Tue, 08 Sep 2026 19:25:45 GMT
  fspiop-signature: present (601 bytes)
  protected header: {"alg":"RS256","FSPIOP-URI":"/quotes","FSPIOP-HTTP-Method":"POST",
                     "FSPIOP-Source":"DemoDFSP3","FSPIOP-Destination":"DemoDFSP4",
                     "Date":"Tue, 08 Sep 2026 19:25:45 GMT"}

POST /transfers
  fspiop-signature: present (605 bytes)
  protected header: {"alg":"RS256","FSPIOP-URI":"/transfers","FSPIOP-HTTP-Method":"POST",
                     "FSPIOP-Source":"DemoDFSP3","FSPIOP-Destination":"DemoDFSP4",
                     "Date":"Tue, 08 Sep 2026 19:26:13 GMT"}
```

The protected header decodes to exactly the six fields the FSPIOP scheme requires, and the
`FSPIOP-URI`, `FSPIOP-HTTP-Method` and `Date` values match the request they were sent on.

---

## 3. Hub-facing, payee side (leg #3) — connector → Hub, signed and over mutual TLS

**Transport.** The Java connector's callbacks went through the same mutual-TLS host, and are
distinguishable from web-outbound's traffic by user agent:

```
istio-external-ingress-gw
[2026-09-08T19:25:48.731Z] "PUT /quotes/01M217PBTTWJSH1QEN9PPMK06M HTTP/2" 200 "okhttp/4.10.0"
  "extapi-mtls.dev2.wynepayhubsanbox-pre.com" outbound|80||moja-quoting-service.mojaloop.svc.cluster.local
[2026-09-08T19:26:18.221Z] "PUT /transfers/01M217PBTTWJSH1QEN9PPMK06M HTTP/2" 200 "okhttp/4.10.0"
  "extapi-mtls.dev2.wynepayhubsanbox-pre.com" outbound|80||moja-ml-api-adapter-service.mojaloop.svc.cluster.local
```

The connector's material was loaded at startup and is re-read on a timer, so a renewal does not
require a restart:

```
demodfsp4-java-connector
2026-09-08 17:37:52 INFO  FspiopMutualTls : Hub-facing mutual TLS is enabled;
  material is re-read every 60000 ms.
2026-09-08 17:37:52 INFO  VaultJwsKeyProvider : Loaded the JWS signing key for 'DemoDFSP4'
  from Vault path 'pivotal/jwskey/...'
```

The certificate it presents identifies the workload and chains to the hub-facing intermediate:

```
subject = O=ThitsaWorks, OU=Pivotal, CN=demodfsp4-java-connector.pivotal
issuer  = CN=Pivotal hub-client Intermediate CA — dev2
valid   = Sep 6 18:36:04 2026 GMT .. Dec 5 18:36:34 2026 GMT
```

Note the signing key came from **Vault**, read under the connector's own Kubernetes ServiceAccount.
No private key is held in the database or in an environment variable.

---

## 4. Confirmed at the Hub, not from our own logs

The decisive evidence for both hub-facing legs is that the **switch's own service** recorded the
signatures arriving. From `moja-quoting-service`, for this transfer:

```
fspiop-source: "DemoDFSP3"   user-agent: "axios/1.13.5"    fspiop-signature: {"signature":"Up5Ikv6jUvkIQoXGX-G75wr-KMaH8t5IB6UuLyliId…
fspiop-source: "DemoDFSP4"   user-agent: "okhttp/4.10.0"   fspiop-signature: {"signature":"ilkjyKx0ek2DiXmPjyu9FT3bnw772VrbRkNT5kTXcx…
```

Two different senders, two different HTTP clients, two different signatures — the payer's request
and the payee's callback, both signed, both observed by the receiving party rather than by us.

---

## 5. The negative controls

Evidence that the enforcement is real rather than configured-and-inert.

**A caller with no client certificate is refused at TLS**, from outside the cluster:

```
* (304) (IN), TLS handshake, Request CERT (13):
* LibreSSL SSL_read: error:1404C45C:SSL routines:ST_OK:reason(1116)
```

`Request CERT` is the server asking for a certificate; alert **116** is `certificate_required`.
Under TLS 1.3 the handshake completes before the rejection, so it surfaces as a failed read rather
than a failed connect.

**The right listener answered.** The server certificate returned was
`CN=extapi-mtls.dev2.wynepayhubsanbox-pre.com`, not the `*.dev2` wildcard that shares those same
ingress pods on the same port. Had the wildcard's `SIMPLE` server matched instead, no certificate
would have been requested and the host would have looked enabled while enforcing nothing.

**A connector that cannot present a certificate is refused, and says so.** From a connector running
an image without the mTLS configuration (§6):

```
demodfsp1-java-connector
SSLHandshakeException: (certificate_required) Received fatal alert: certificate_required
```

---

## 6. Limitations — what this does not show

- **Two of the four connectors cannot do this.** `demodfsp1` and `demodfsp2` run
  `pivotal-thitsawallet-java-connector:v0.0.27`, whose entrypoint does not map the `FSPIOP_MTLS_*`
  environment variables to the JVM properties the component reads. Verified on the running process:
  five such properties on `v0.0.8`, zero on `v0.0.27`. They fail as shown in §5. `cibsbank` and
  `royalbank` run the same image. **A transfer between DemoDFSP1 and DemoDFSP2 will not reproduce
  this result.**
- **Leg #4 is not exercised.** The Hub reaches web-inbound over plain HTTP and presents a client
  certificate to nobody, so `FSPIOP_USE_MUTUAL_TLS` is deliberately `false` on web-inbound. That leg
  waits on Hub-side egress configuration.
- **Both trust domains are rooted in rehearsal KMS keys.** No production root exists. Nothing here
  should be read as evidence about a production trust chain.
- **The mutual-TLS host is not publicly resolvable.** Pivotal reaches it through a `ServiceEntry`
  that resolves the name in-mesh. The handshake is identical; the name simply is not published,
  deliberately, because that host sits outside the switch's bearer-token policy.
- **One transfer, one direction, one currency.** No load, no renewal-under-traffic, no revocation
  mid-flight.

---

## How this was collected

```bash
export KUBECONFIG=dev2-hub-kubeconfig.yaml
TX=01M217PBTTWJSH1QEN9PPMK06M

kubectl -n pivotal logs deploy/web-outbound -c web-outbound --since=24h | grep "$TX"
kubectl -n pivotal logs deploy/web-outbound -c web-outbound --since=24h | grep DfspCertificateGuard
kubectl -n pivotal logs demodfsp4-java-connector-… -c demodfsp4-java-connector | grep -iE "mutual|jws"
kubectl -n istio-ingress-ext logs -l istio=istio-external-ingress-gw --tail=6000 | grep "$TX"
kubectl -n mojaloop logs deploy/moja-quoting-service --all-containers --since=24h | grep "$TX"
kubectl -n pivotal get secret demodfsp4-java-connector-hub-client-tls \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -issuer -dates
```

Gateway access logs are the shortest-lived of these. Capture them first if this needs repeating.
