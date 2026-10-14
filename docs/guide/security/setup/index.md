# Setup

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## Choose your profile

Decide on a key profile before you start. The profile decides where the CA root keys and the Hub JWS
signing keys are kept. It cannot be changed later without repeating the CA ceremony and replacing
every DFSP's Hub JWS signing key.

If you have not decided, read [Choosing a profile](../concepts/choosing-a-profile.md) first.

| Profile | Keys kept in | Follow |
|---|---|---|
| `vault-kv` (KMS-backed) | CA roots in AWS KMS; Hub JWS signing keys in Vault | [vault-kv/index.md](vault-kv/index.md) |
| `pkcs11` (HSM-backed) | CA roots and Hub JWS signing keys in AWS CloudHSM | [pkcs11/index.md](pkcs11/index.md) |

Follow **one** path from start to finish. Each path lists every page in order, including the shared
pages in `common/` at the point where you need them. Do not mix pages from the two profile folders.

## What every path ends with

Both paths finish with the same four shared procedures:

1. [Enable the DFSP-facing side](common/enable-dfsp-facing.md)
2. [Enable the Hub-facing side: outbound](common/enable-hub-facing-outbound.md)
3. [Enable the Hub-facing side: inbound](common/enable-hub-facing-inbound.md)
4. [End-to-end check](common/end-to-end-check.md)

Your profile's index tells you when to run them.
