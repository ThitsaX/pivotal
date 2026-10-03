# Evidence — HSM-backed staging, every leg on one transfer

**Transfer:** `01M41YDEBX40PVMTQ0QN74YXFB` · `DemoDFSP2 → DemoDFSP1` · USD 1 · 2026-10-03 22:33:34–22:34:05 UTC
**Environment:** HSM-backed staging. Pivotal `v0.2.86`, connectors `pivotal-thitsawallet-connector:v0.0.17`
(framework `v0.0.36`). Keys held in AWS CloudHSM; trust domains rooted there by the ceremony.

One transfer in which every request between Pivotal and the Hub, in both directions, went over mutual
TLS, with a refused impersonation on the DFSP-facing endpoint forty minutes earlier. Collected from the
cluster after the fact; excerpts are quoted from the named pod, trimmed only where marked `…`.

`<domain>` is the staging domain and `<cluster-public-ip>` the cluster's public address.

A second transfer, `01M420F4PK3BF8NNZZXPQ10ADD` thirty-five minutes later, adds web-inbound
verifying the Hub-facing signatures (§6). Nothing else changed between the two.

**Read the limitations at the end before citing any of this.**

---

## What each control is, and where the evidence for it is

| Control | Direction | Evidence |
| --- | --- | --- |
| DFSP-facing mTLS + certificate binding | DFSP → web-outbound | §1 (refusal) — see limitations |
| DFSP-facing accessKey JWS | DFSP → web-outbound | §1 |
| Hub-facing mTLS + token, payer side | web-outbound → Hub | §2 |
| Hub-facing JWS, payer side, signed in the HSM | web-outbound → Hub | §2, §5 |
| Hub-facing mTLS + token, payee side | connector → Hub | §3 |
| Hub-facing JWS, payee side, signed in the HSM | connector → Hub | §3, §5 |
| Hub-facing mTLS, Hub calling back | Hub → web-inbound | §4 |
| Hub-facing JWS **verification** of peer signatures | Hub → web-inbound | §6 (second transfer) |

---

## The transfer, hop by hop

From the external ingress gateway. `extapi` is the Hub's mutual-TLS host; `web-inbound.<domain>` is
web-inbound's public host, reached only through the Hub's egress gateway.

| Time (UTC) | Status | Host | Request | Sent by |
| --- | --- | --- | --- | --- |
| 22:33:34.830 | 200 | pivotal | `POST /secured/sendmoney` | DFSP (Postman) |
| 22:33:34.865 | 202 | extapi | `GET /parties/MSISDN/1000931486390` | web-outbound (`axios`) |
| 22:33:34.943 | 202 | web-inbound | `GET /parties/MSISDN/1000931486390` | Hub, to the payee |
| 22:33:36.424 | 200 | extapi | `PUT /parties/MSISDN/1000931486390` | DemoDFSP1 connector (`okhttp`) |
| 22:33:36.446 | 200 | web-inbound | `PUT /parties/MSISDN/1000931486390` | Hub, to the payer |
| 22:33:50.008 | 200 | pivotal | `PUT /secured/sendmoney/…` (accept party) | DFSP |
| 22:33:50.044 | 202 | extapi | `POST /quotes` | web-outbound |
| 22:33:50.085 | 202 | web-inbound | `POST /quotes` | Hub, to the payee |
| 22:33:55.052 | 200 | extapi | `PUT /quotes/01M41YDEBX40PVMTQ0QN74YXFB` | DemoDFSP1 connector |
| 22:33:55.083 | 200 | web-inbound | `PUT /quotes/01M41YDEBX40PVMTQ0QN74YXFB` | Hub, to the payer |
| 22:34:01.482 | 200 | pivotal | `PUT /secured/sendmoney/…` (accept quote) | DFSP |
| 22:34:01.508 | 202 | extapi | `POST /transfers` | web-outbound |
| 22:34:01.640 | 202 | web-inbound | `POST /transfers` | Hub, to the payee |
| 22:34:04.781 | 200 | extapi | `PUT /transfers/01M41YDEBX40PVMTQ0QN74YXFB` | DemoDFSP1 connector |
| 22:34:04.972 | 200 | web-inbound | `PUT /transfers/01M41YDEBX40PVMTQ0QN74YXFB` | Hub, to the payer |
| 22:34:05.000 | 200 | web-inbound | `PATCH /transfers/01M41YDEBX40PVMTQ0QN74YXFB` | Hub, to the payee |

No `401`, `403` or handshake failure on any of them.

---

## 1. DFSP-facing — the binding rule refused an impersonation

**21:53:43 — refused.** The same Postman client presented DemoDFSP1's certificate while claiming to be
DemoDFSP2, for the same parties:

```
web-outbound
2026-10-03 21:53:43 ERROR DfspCertificateGuard : Rejected: certificate belongs to 'DemoDFSP1' but the
  request claims fspiop-source 'DemoDFSP2'.
2026-10-03 21:53:43 ERROR OutboundExceptionFilter : Post Send Money error response for to.idValue
  1000931486390 and from.idValue 9883877142: errorCode=3105 {… "detailedDescription":"The client
  certificate does not belong to the participant na…
```

**22:33:34 — admitted.** The transfer above, as DemoDFSP2, through the same guards:

```
web-outbound
2026-10-03 22:33:34 INFO  SendMoneyLogInterceptor : Post Send Money request for to.idValue 1000931486390
  and from.idValue 9883877142: {…"from":{"fspId":"DemoDFSP2",…},"to":{…,"fspId":"DemoDFSP1"},
  "amountType":"SEND","currency":"USD","amount":"1"…
```

The accessKey JWS is checked on every `/secured/sendmoney` call (`ACCESS_JWT_ENABLED=true`; startup
logs `AccessGuard is enabled.`). All three calls of this transfer were admitted with `200`.

## 2. Pivotal → Hub, payer side — web-outbound

Every request went to `https://extapi.<domain>` with the Hub's token and, where there is a body, a
signature. Header names from web-outbound's request log, and the signature's protected header decoded:

```
web-outbound
2026-10-03 22:33:50 … HttpLoggerInterceptor : [REQ] POST https://extapi.<domain>/quotes headers=…
  Authorization,Content-Type,accept,date,fspiop-destination,fspiop-http-method,fspiop-signature,
  fspiop-source,fspiop-uri,traceparent
  {"alg":"RS256","FSPIOP-URI":"/quotes","FSPIOP-HTTP-Method":"POST","FSPIOP-Source":"DemoDFSP2",
   "FSPIOP-Destination":"DemoDFSP1","Date":"Sat, 03 Oct 2026 22:33:50 GMT"}
2026-10-03 22:33:50 … [RES] 202 POST https://extapi.<domain>/quotes durationMs=26

2026-10-03 22:34:01 … [REQ] POST https://extapi.<domain>/transfers headers=… (same headers)
  {"alg":"RS256","FSPIOP-URI":"/transfers","FSPIOP-HTTP-Method":"POST","FSPIOP-Source":"DemoDFSP2",
   "FSPIOP-Destination":"DemoDFSP1","Date":"Sat, 03 Oct 2026 22:34:01 GMT"}
2026-10-03 22:34:01 … [RES] 202 POST https://extapi.<domain>/transfers durationMs=37
```

`GET /parties` carries the token but no signature, correctly: a detached JWS signs the body and a GET
has none. `Authorization` is redacted in the log itself (`[redacted]`); only its presence is shown here.

The connection is mutual TLS with strict server verification (`FSPIOP_TLS_VERIFY_SERVER_CERT` and
`FSPIOP_TLS_VERIFY_DOMAIN` both `true` on web-outbound): the gateway answered `202`, which it does only
after the client certificate, the IP allowlist and the token's Oathkeeper rule have all passed.

## 3. Pivotal → Hub, payee side — the DemoDFSP1 connector

```
demodfsp1-java-connector
2026-10-03 21:43:53 … CloudHsmJwsKeyProvider : Signing for 'DemoDFSP1' through CloudHSM, key reference
  'DemoDFSP1-jws-20260929090802'
2026-10-03 21:43:53 … FspiopMutualTls : Hub-facing mutual TLS is enabled; material is re-read every 60000 ms.
2026-10-03 21:43:53 … FspiopAccessToken : Outbound callbacks will carry a Hub token for client
  'pivotal-trust-manager'.
2026-10-03 22:33:55 … QuotesListener : Quote Response from Payee cc to hub for TransferId 01M41YDEBX40PVMTQ0QN74YXFB
2026-10-03 22:34:04 … TransfersListener : Post transfer response from Payee cc to Hub for TransferId 01M41YDEBX40PVMTQ0QN74YXFB
```

```
istio-external-ingress-gw
[2026-10-03T22:33:55.052Z] "PUT /quotes/01M41YDEBX40PVMTQ0QN74YXFB HTTP/2" 200 … "<cluster-public-ip>"
  "okhttp/4.10.0" … "extapi.<domain>" … outbound|80||moja-quoting-service.mojaloop.svc.cluster.local
```

## 4. Hub → Pivotal — the Hub calling back over mutual TLS

Both demo tenants' callback endpoints point at `http://web-inbound.<domain>`. The Hub's egress gateway
upgrades each call to mutual TLS, presenting the client certificate Pivotal's CA signed for it, and our
gateway verifies that against Pivotal's CA before routing to web-inbound:

```
callback-egress-gateway (Hub)
[2026-10-03T22:33:34.937Z] "GET /parties/MSISDN/1000931486390 HTTP/1.1" 202 … "web-inbound.<domain>"
  "<cluster-public-ip>:443" outbound|443||web-inbound.<domain>
[2026-10-03T22:34:04.971Z] "PUT /transfers/01M41YDEBX40PVMTQ0QN74YXFB HTTP/1.1" 200 … "<cluster-public-ip>:443"
[2026-10-03T22:34:04.999Z] "PATCH /transfers/01M41YDEBX40PVMTQ0QN74YXFB HTTP/1.1" 200 … "<cluster-public-ip>:443"
```

```
web-inbound
2026-10-03 22:33:50 … QuotesController : Post Quote Request for TransferId 01M41YDEBX40PVMTQ0QN74YXFB
2026-10-03 22:33:55 … QuotesController : Put Quote Request for TransferId 01M41YDEBX40PVMTQ0QN74YXFB
2026-10-03 22:34:01 … TransfersController : Post Transfer Request for TransferId 01M41YDEBX40PVMTQ0QN74YXFB
2026-10-03 22:34:05 … TransfersController : Patch Transfer Request for TransferId 01M41YDEBX40PVMTQ0QN74YXFB
```

The ingress log records these as HTTP requests on `web-inbound.<domain>`, which exist only after the
`MUTUAL` handshake has succeeded in both directions.

## 5. HSM custody

```
web-outbound (both replicas)
CloudHSM client configured for <HSM_IP>.
… Pkcs11SessionPool : PKCS#11 ready: 4 sessions on token 'hsm1' via /opt/cloudhsm/lib/libcloudhsm_pkcs11.so
… Pkcs11Bootstrap : Signing through PKCS#11 as 'cu_web_outbound', credential from Vault path
  'pivotal/hsmcred/web-outbound'.
```

```
demodfsp2-java-connector
… CloudHsmJwsKeyProvider : Signing for 'DemoDFSP2' through CloudHSM, key reference 'DemoDFSP2-…'
```

`KEY_PROVIDER=pkcs11` on web-outbound. No private signing key exists in any process or Secret: Vault
holds a crypto-user credential and a key reference, and the signature is produced in the device.

---

## 6. Hub → Pivotal — web-inbound verifying the signatures

**Transfer:** `01M420F4PK3BF8NNZZXPQ10ADD` · `DemoDFSP2 → DemoDFSP1` · 2026-10-03 23:09:27–23:09:50 UTC

Two changes after the first transfer, and nothing else:

- web-inbound `FSPIOP_USE_JWS` `false` → `true`, which installs the guard
- `participant_key.jws_verify_mode` `off` → `verify-if-present` for DemoDFSP1 and DemoDFSP2 only

```
participant_key (non-off rows)
[{"fsp_id":"DemoDFSP1","jws_verify_mode":"verify-if-present"},
 {"fsp_id":"DemoDFSP2","jws_verify_mode":"verify-if-present"}]
```

Every other sender, `hub` included, stays `off` and is not checked.

```
web-inbound (both replicas)
2026-10-03 23:06:53 INFO  Bootstrap : FspInboundGuard is enabled.
2026-10-03 23:07:21 INFO  Bootstrap : FspInboundGuard is enabled.
```

The Hub's calls to web-inbound for the transfer, all accepted:

| Time (UTC) | Status | Request | fspiop-source | Signed by |
| --- | --- | --- | --- | --- |
| 23:09:27.729 | 202 | `GET /parties/MSISDN/1000931486390` | DemoDFSP2 | — (no body; never signed) |
| 23:09:31.740 | 200 | `PUT /parties/MSISDN/1000931486390` | DemoDFSP1 | connector, CloudHSM |
| 23:09:39.064 | 202 | `POST /quotes` | DemoDFSP2 | web-outbound, PKCS#11 |
| 23:09:40.188 | 200 | `PUT /quotes/01M420F4PK3BF8NNZZXPQ10ADD` | DemoDFSP1 | connector, CloudHSM |
| 23:09:45.977 | 202 | `POST /transfers` | DemoDFSP2 | web-outbound, PKCS#11 |
| 23:09:49.981 | 200 | `PUT /transfers/01M420F4PK3BF8NNZZXPQ10ADD` | DemoDFSP1 | connector, CloudHSM |
| 23:09:49.997 | 200 | `PATCH /transfers/01M420F4PK3BF8NNZZXPQ10ADD` | hub | — (`off`) |

```
web-inbound
2026-10-03 23:09:39 … QuotesController : Post Quote Request for TransferId 01M420F4PK3BF8NNZZXPQ10ADD
2026-10-03 23:09:40 … QuotesController : Put Quote Request for TransferId 01M420F4PK3BF8NNZZXPQ10ADD
2026-10-03 23:09:45 … TransfersController : Post Transfer Request for TransferId 01M420F4PK3BF8NNZZXPQ10ADD
2026-10-03 23:09:50 … TransfersController : Patch Transfer Request for TransferId 01M420F4PK3BF8NNZZXPQ10ADD
```

**Why acceptance here means verification.** Under `verify-if-present` a request with a body from
DemoDFSP1 or DemoDFSP2 can go only three ways:

1. signature present, valid, and its protected header matching this request — accepted
2. signature present but invalid or not matching — rejected, always
3. no signature — accepted, and the guard logs, the first time for each sender,
   `Accepting unsigned FSPIOP requests from '<source>' under verify-if-present.`

Every one was accepted, neither replica logged a rejection, and **neither logged the unsigned-accepted
warning**. So each carried a signature, and each verified against the sender's public key in
`participant_key` — the public half of the key held in CloudHSM.

That also shows the Hub forwards the signature headers intact: had it stripped or altered them, these
would have been counted as unsigned or rejected.

---

## Limitations

- **DFSP-facing certificate on the admitted request is not shown.** `DfspCertificateGuard` logs
  refusals, not admissions, and the endpoint runs `OPTIONAL_MUTUAL` (`DFSP_FACING_MTLS_MANDATORY=false`)
  — a caller without a certificate is admitted too. §1 proves the binding is enforced when a
  certificate is presented, not that one was presented at 22:33:34.
- **Verification on web-inbound is `verify-if-present`, not `require`,** and only for the two demo
  tenants. An unsigned request from them would still be accepted (and logged); none was. The guard
  logs refusals and the first unsigned acceptance, not each successful verification, so §6 proves
  verification by elimination rather than by a per-request line.
- **The Hub's own verification of Pivotal's signatures is not shown.** Nothing in the logs records the
  Hub checking them.
- **The connector's signature is inferred, not logged.** The connector logs that it signs through
  CloudHSM and that signing is on; it does not log outgoing headers.
- **Same cluster.** Pivotal and the Hub share a cluster, so every hop goes out and back in through
  `<cluster-public-ip>`. This proves the mechanism, not a control across a real network boundary.
- **Demo tenants only.** Other tenants' callbacks are still on the internal address, and connectors on
  client-owned images still call the Hub internally.
- **One HSM.** Staging runs a single device with the availability check disabled; production runs two.
- **Token client reused.** Pivotal authenticates to the Hub with trust-manager's Keycloak client
  rather than one of its own.
