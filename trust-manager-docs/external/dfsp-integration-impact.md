# DFSP Integration Impact — Trust-Manager Rollout

## Payer-side — what the DFSP must do

### Phase 1 — accessKey (unchanged)

1. The DFSP generates an asymmetric keypair for its accessKey and keeps the private half inside its own systems.
2. The DFSP provides Pivotal with the **public half only**. Today this is sent to the hub operator, who registers it during onboarding. Once portal self-service is available, the DFSP's authorized users will be able to upload a new key directly.
3. The DFSP continues signing the body of every `POST /secured/sendmoney` and `PUT /secured/sendmoney/{transferId}` request with its accessKey private key and sending the result in the `authorization` header — exactly as today.
4. **Key rotation is now zero-downtime.** When a new accessKey is registered, the previous one stays valid for a short overlap period, so the DFSP can roll the new key across its systems at its own pace. No coordination with Pivotal is required, and no change to the DFSP's signing code.

### Phase 2 — TLS client certificate (new)

1. The DFSP generates a **second, separate** keypair for TLS client authentication, distinct from the accessKey. This private key must never be sent to Pivotal, and Pivotal will never ask for it.
2. The DFSP creates a Certificate Signing Request using its FSPIOP identifier as the Common Name — e.g. `CN=BIGBANKGN`. **The CN must match the `FSPIOP-Source` the DFSP sends**, or requests will be rejected.
3. The DFSP submits the CSR through the portal, or to the hub operator where enrollment is operator-mediated.
4. Pivotal returns two artefacts for the DFSP to download: the **signed certificate** and the **issuing CA chain**.
5. The DFSP installs the certificate, the chain, and the private key from step 1 into its HTTP client. The TLS handshake requires the DFSP to present the certificate *and* prove it holds the matching private key. Java and .NET stacks should bundle all three into a PKCS#12 keystore.

The DFSP ends up with three files: `dfsp-client.key` (its own, from step 1), `dfsp-client.crt` and `chain.pem` (from Pivotal).

```bash
# Step 1 — DFSP generates keypair + CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout dfsp-client.key \      # private key — never leaves the DFSP
  -out    dfsp-client.csr \      # this goes to Pivotal
  -subj   "/CN=BIGBANKGN"

# Step 4 — Pivotal returns dfsp-client.crt and chain.pem

# Step 5 — DFSP presents both on every call
curl --cert dfsp-client.crt --key dfsp-client.key \
     https://mtls.pivotal.<env>/secured/sendmoney
```

### Phase 3 — cutover

1. The DFSP repoints its client to the mTLS endpoint. It is published as a separate hostname, so each DFSP migrates at its own pace rather than on a fixed date.
2. The DFSP tests in a non-production environment first.
3. **The DFSP updates any scripts calling `/dfsp-list-with-prefixes` or `/dfsp-list-with-prefixes-by-usecase/{usecase}`.** These require no authentication today but will require a client certificate once the DFSP moves to the mTLS endpoint.

### Phase 4 — ongoing

1. The DFSP registers a technical contact with Pivotal to receive certificate-expiry alerts, and keeps it current.
2. The DFSP renews before expiry by repeating the CSR flow, installing the new certificate alongside the old one, and reloading gracefully. Both remain valid during the overlap, so there is no downtime.
3. If a private key is ever compromised, the DFSP reports it to Pivotal immediately. Pivotal revokes within seconds, after which the DFSP must enroll a new CSR before it can transact again.

---

## Payee-side — what the DFSP must do

**Nothing.** The connection from Pivotal's connector to the DFSP's backend is out of scope for this work. The DFSP remains its own certificate authority for that endpoint, provisioning stays a manual arrangement between the DFSP's team and Pivotal's DevOps team, and the backend API contract is unchanged — no new headers, no request signing, no certificates issued by Pivotal.

Payer and payee are **roles in a transaction, not types of institution**. A DFSP that sends payments must complete every payer-side step above, regardless of having nothing to do on the payee side.

---

## What the DFSP does *not* need to do

- The DFSP does not supply or manage the FSPIOP JWS key used to sign messages to the Mojaloop Hub. Pivotal generates that key inside a dedicated Hardware Security Module, where it is created as non-exportable and never leaves. All signing is performed inside the HSM on the DFSP's behalf — no copy of the key exists in Pivotal's application memory, databases or backups.
- The DFSP does not need any other participant's public keys — Pivotal handles all peer key distribution.
- The DFSP does not need to change its VPN arrangement. VPN and mTLS are independent layers; an existing tunnel can remain in place alongside mTLS.
