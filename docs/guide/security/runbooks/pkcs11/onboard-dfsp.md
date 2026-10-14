# Onboard a DFSP (pkcs11)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Status

**This procedure is completed with the next Pivotal release.**

In the HSM-backed profile, onboarding a DFSP has two parts:

1. **A custodian creates the DFSP's key in the HSM.** In the [HSM admin pod](../../setup/pkcs11/hsm-admin-pod.md),
   a script creates the DFSP's crypto user (`cu_<DFSP_ID>`), generates its Hub JWS signing key
   inside the HSM as that user, shares the key with `cu_web_outbound`, and stores the crypto-user
   credential, the keyRef and the public key in Vault.
2. **An operator onboards the DFSP in the portal.** web-pivotal reads the keyRef and the public key
   from Vault and records the public key. It refuses to onboard a DFSP whose key has not been
   created yet. trust-manager then publishes the public key to MCM.

The next release delivers part 2 and the final form of the script in part 1. This page will then
give the full procedure.

## Until then

- **Do not onboard DFSPs through the portal in this profile.** In this release web-pivotal runs
  without `KEY_PROVIDER=pkcs11`, so portal onboarding would create the DFSP's private key in software
  and store it in plaintext in Pivotal's database, not in the HSM.
- You can finish the `pkcs11` setup up to Deploy Pivotal, and the mTLS parts of the common pages.
  The JWS parts and the end-to-end check need onboarded DFSPs and wait for this procedure. See
  [Known limitations](../../known-limitations.md#pkcs11-dfsp-onboarding-is-not-available-yet).
- The Vault policy and role each DFSP's connector needs are already described in
  [Configure Vault](../../setup/pkcs11/4-vault.md#step-5-know-the-per-dfsp-connector-policy), and its
  Helm settings in [Deploy Pivotal](../../setup/pkcs11/5-deploy-pivotal.md#step-4-know-the-connector-settings).

## References

- [Known limitations](../../known-limitations.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Setup: HSM-backed profile](../../setup/pkcs11/index.md)
