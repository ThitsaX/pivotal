# Rotate a Tenant's Signing Key — HSM-Backed

> **Written for the CloudHSM backend.** Crypto users, ownership and sharing are CloudHSM concepts.
> On the SoftHSM backend a tenant gets its own **token and PIN** instead, mounted only into that
> tenant's connector, and there is no sharing step — see
> [`../setup/1-softhsm-tokens.md`](../setup/1-softhsm-tokens.md). Everything else here is the same.

Replacing one DFSP's FSPIOP JWS signing key. Triggered by policy, or by a suspected compromise.

**No Crypto Officer is involved.** The crypto user already exists; generating and sharing are
crypto-user operations. So unlike onboarding, this needs no custodian.

> **There is no rotation command.** Nothing in the portal or the API rotates a signing key — the
> participant operations available are `add-signing-keys`, `update-jws-policy`, `update-access-key`,
> `enroll-dfsp-certificate` and `revoke-dfsp-certificate`. Rotation is the manual sequence below, so
> read the ordering rule before you start.

---

## The ordering rule

**Publish the new public key to MCM before anything signs with the new private key.**

Peers verify against what MCM holds. One key is registered per FSP at a time, so signing before MCM
is updated is a hard outage for that tenant rather than a degradation.

## Steps

1. **Generate a new keypair as that tenant's crypto user**, with a **new, version-inclusive label**.
   The label *is* the keyRef, and rotation must always mint a new one — never reuse a label, or a
   process can sign with a key its peers have not been told about.

   ```bash
   CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu-DemoDFSP3:<password> \
     cloudhsm-cli key generate-asymmetric-pair rsa \
       --public-label  "DemoDFSP3-jws-<new-version>-pub" \
       --private-label "DemoDFSP3-jws-<new-version>" \
       --modulus-size-bits 2048 --public-exponent 65537 \
       --private-attributes sign=true extractable=false
   ```

2. **Share the new key with `cu_web_outbound`.** Sharing is a property of the key, not of the user,
   so a new key is not shared just because the old one was. Miss this and web-outbound silently stops
   being able to sign as that tenant.

3. **Export the new public half** and publish it to MCM. Confirm MCM holds it before continuing.

4. **Write the new keyRef** to `pivotal-kv/pivotal/keyref/<fspId>`.

5. **Restart the tenant's connector and web-outbound**, or wait for their reload. Both read the
   keyRef at startup and cache it.

6. **Verify** a transfer completes with `fspiop-signature` present in the switch's logs.

7. **Destroy the old key** once the new one is proven, as its owner. Leaving it is not neutral — it
   remains usable by anyone holding that crypto user's credential.

## If you are rotating because of a compromise

The key itself cannot have leaked — it is non-extractable and never existed outside the HSM. What can
have leaked is **the crypto-user credential**, which is what authorises signing with it.

So rotating the key is not sufficient on its own. Also:

- **Rotate that crypto user's password**, which is a Crypto Officer operation and therefore needs a
  custodian.
- **Check the Vault audit log** for reads of `hsmcred/<fspId>` outside a provisioning window. That is
  the record of who could have obtained the credential.

## Related

- [`onboard-dfsp.md`](./onboard-dfsp.md) — where the key and crypto user came from
- [`../../kms/runbooks/rotate-signing-key.md`](../../kms/runbooks/rotate-signing-key.md) — the same
  operation where the key is a PEM in Vault
