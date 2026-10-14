# DFSP Request Signing

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

How a DFSP signs its requests to Pivotal's DFSP-facing endpoints (leg 1) with its **DFSP access key**.
Pivotal checks the signature against the access public key registered for the DFSP named in
`fspiop-source`. Give this page to each DFSP's developers.

## Which requests must be signed

Source: `apps/web-outbound/main.ts` (global guards), `apps/web-outbound/controllers/`,
`apps/web-outbound/component/access.guard.ts`.

| Endpoint | Signed | Rules |
|---|---|---|
| `POST /secured/sendmoney`, `PUT /secured/sendmoney/:transferId`, `POST /secured/registry/msisdn` | Yes, while `ACCESS_JWT_ENABLED` is `true` (the default) | [Body requests](#body-requests) |
| `GET /secured/transferStatus/:transferId` | Always, whatever `ACCESS_JWT_ENABLED` says | [Transfer status requests](#transfer-status-requests) |
| `GET /dfsps-with-prefixes-and-count…`, `GET /dfsp-list-with-prefixes…` | No | Public |

## Headers on every signed request

Source: `apps/web-outbound/component/access.guard.ts`.

| Header | Value |
|---|---|
| `fspiop-source` | The DFSP's own FSP ID. It selects the public key Pivotal checks against. |
| `authorization` | A compact JWS: `<header>.<payload>.<signature>`, each part base64url. **No `Bearer` prefix.** Exactly one value. |
| `date` | Required for transfer status requests. Optional otherwise (see [body-less requests](#body-requests)). |

The signature algorithm is **RS256** (RSA with SHA-256), using the DFSP's access private key. Pivotal
accepts no other algorithm.

## Body requests

Source: `apps/web-outbound/component/access.guard.ts` (`verifyPayloadSignature`, `resolvePayload`,
`toCanonicalJson`).

| Part | Rule |
|---|---|
| Protected header | `{"alg":"RS256"}` at least. Other fields (for example `typ`) are allowed. |
| Payload | **The request body itself**, as a JSON object. Pivotal compares it with the body after sorting keys at every level, so key order and whitespace do not matter, but values must be identical. |
| Extra claims | **None.** Do not add `iat`, `exp` or any other claim: the payload would no longer equal the body. Many JWT libraries add `iat` by default; turn it off. |
| A request with no body (or an empty object) | The payload must be `{"date": "<the date header's value>"}`, or `{"date": ""}` when no `date` header is sent. |

Failures return HTTP 401 with `errorInformation.statusCode` `3105`. The reason is in
`errorInformation.detailedDescription`:

| `detailedDescription` | Cause |
|---|---|
| `Authorization signature verification failed.` | Wrong key, wrong algorithm, or the token was changed |
| `Authorization payload does not match request body.` | Payload and body differ, or an extra claim such as `iat` is present |
| `No trusted access public key registered for fspiop-source: '<FSP_ID>'.` | No access public key on record for that FSP ID |

A missing or malformed `authorization` header returns `statusCode` `3102` or `3101` (HTTP 417).

## Transfer status requests

Source: `apps/web-outbound/component/access.guard.ts` (`verifySignedTransferStatus`,
`validateFreshDate`).

| Part | Rule |
|---|---|
| `date` header | An HTTP date in exactly this form: `Wed, 14 Oct 2026 08:00:00 GMT`. Must be within **±5 minutes** of Pivotal's clock. |
| Protected header `alg` | `RS256` |
| Protected header `typ` | `JWT` |
| Protected header `uri` | The request path and query exactly as sent, for example `/secured/transferStatus/01JABCDEFGHJKMNPQRSTVWXYZ0` |
| Protected header `method` | `GET` |
| Protected header `date` | Exactly the `date` header's value |
| Protected header `nonce` | A unique string of 1 to 128 characters. Each nonce can be used **once** per FSP ID within 10 minutes. |
| Payload | The empty JSON object `{}`, encoded exactly as `e30` |

Failures return `statusCode` `3105` (HTTP 401) with a `detailedDescription` naming the field, for
example
`Authorization nonce has already been used.` or `Header date is outside the allowed clock window.`

## Example

A minimal Node.js signer (any JOSE library works the same way):

```js
const crypto = require('crypto');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function sign(privateKeyPem, header, payload) {
  const input = `${b64u(header)}.${b64u(payload)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKeyPem).toString('base64url');
  return `${input}.${sig}`;
}

// Body request: the payload is the body
const body = { /* the sendmoney request body */ };
const authorization = sign(KEY, { alg: 'RS256' }, body);

// Transfer status request
const date = new Date().toUTCString();
const uri = `/secured/transferStatus/${transferId}`;
const statusAuth = sign(KEY,
  { alg: 'RS256', typ: 'JWT', uri, method: 'GET', date, nonce: crypto.randomUUID() },
  {});   // encodes to e30
// send headers: fspiop-source, date, authorization (no "Bearer")
```

## References

- [Security model](../concepts/security-model.md)
- [Enable the DFSP-facing side](../setup/common/enable-dfsp-facing.md)
- [Troubleshooting: Leg 1](../troubleshooting.md#leg-1-dfsp-facing)
