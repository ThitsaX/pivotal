# Glossary

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

Every page in this section uses these names, and only these names.

## Connections and components

| Term | Meaning |
|---|---|
| DFSP | A Digital Financial Service Provider: a bank, wallet or other participant that Pivotal connects to the Hub. Identified by its **FSP ID**. |
| Tenant | A DFSP that Pivotal fronts, that is, a DFSP that reaches the Hub through Pivotal. |
| Peer | A DFSP connected to the Hub that Pivotal does not front. |
| Hub | The Mojaloop switch that routes payments between DFSPs. |
| DFSP-facing side | Connections between a DFSP's own system and Pivotal. |
| Hub-facing side | Connections between Pivotal and the Hub, in both directions. |
| Leg | One of the four connections described in [Overview](../concepts/overview.md). |
| web-outbound | The Pivotal service DFSPs call. It sends requests to the Hub. |
| web-inbound | The Pivotal service the Hub calls back. It verifies the signatures on those calls. |
| web-pivotal | The Pivotal API behind the portal. Issues DFSP client certificates and onboards DFSPs. |
| Portal | Pivotal's web interface for operators. |
| Connector | A per-DFSP Pivotal service that links the DFSP's core system to the Hub. It sends the DFSP's callbacks to the Hub. |
| trust-manager | The Pivotal service that keeps certificates, CA bundles and public keys in step with MCM and Kubernetes. See [trust-manager](../concepts/trust-manager.md). |
| MCM | Mojaloop Connection Manager: the Hub's registry of DFSPs, their CAs, certificates and JWS public keys. |
| DFSP-facing gateway | The Istio gateway that terminates mTLS from DFSPs and forwards their requests to web-outbound. |
| Pivotal callback gateway | The Istio gateway that terminates mTLS from the Hub and forwards its callbacks to web-inbound. |
| Hub API gateway | The Hub's gateway that Pivotal calls. Operated by the Hub operator. |
| Vault | HashiCorp Vault. Holds Pivotal's intermediate CAs and, depending on the profile, the Hub JWS signing keys or references to them. |
| cert-manager | The Kubernetes add-on that issues and renews the web-inbound server certificate. |

## Protections

| Term | Meaning |
|---|---|
| mTLS | Mutual TLS. Both ends of a connection present a certificate, and each checks the other's against a CA it trusts. |
| JWS | JSON Web Signature. A signature over a message that proves who sent it and that it was not changed. Pivotal uses RS256 (RSA with SHA-256). |
| FSPIOP | The Mojaloop API that DFSPs and the Hub use to exchange payment messages. Its JWS signature travels in the `fspiop-signature` header. |
| `FSPIOP-Source` | The FSPIOP header naming the DFSP a message comes from. |
| Signing | Adding a JWS signature to an outgoing message. Turned on per tenant. |
| Verify mode | How strictly web-inbound checks signatures from a given sender: `off`, `verify-if-present` or `require`. Set per sender. |
| `authorization` header | The header in which a DFSP sends its JWS to web-outbound. |

## Certificate authorities

| Term | Meaning |
|---|---|
| CA | Certificate authority. Signs certificates; anyone who trusts the CA trusts what it signs. |
| Root CA | The top CA of a chain. Its private key is kept in AWS KMS (`vault-kv`) or AWS CloudHSM (`pkcs11`) and used only during a CA ceremony. |
| Intermediate CA | A CA signed by a root, which signs everyday certificates. Pivotal's intermediates live in Vault. |
| CA ceremony | The one-time procedure that creates Pivotal's two root CAs and their intermediates. |
| DFSP CA | Pivotal's CA for the DFSP-facing side: a **root** and an **intermediate**, both made in the CA ceremony. The root's key stays in KMS (`vault-kv`) or the HSM (`pkcs11`) and is used only to sign the intermediate. The intermediate lives in Vault mount `pki_dfsp` (role `dfsp-client`) and issues DFSP client certificates. trust-manager publishes the intermediate as the DFSP-facing gateway's trust anchor. |
| Pivotal Hub-client CA | Pivotal's CA for the Hub-facing side: a root (key in KMS or the HSM; certificate in Secret `pivotal-hub-client-ca`) and an intermediate in Vault mount `pki_hub_client`. Signs the web-inbound server certificate (role `web-inbound-server`) and the Hub callback certificate (role `hub-callback-client`). The ceremony also creates a role `pivotal-client`, which the setup in this guide does not use. Its root certificate is stored in the Secret `pivotal-hub-client-ca`, key `ca.pem`. |
| Hub CA | The Hub operator's CA. Signs the Hub's own server certificates and Pivotal's Hub client certificate. |
| CA bundle | A file of CA certificates used to check certificates presented by the other side. |
| CSR | Certificate signing request. Created by whoever holds a private key, so the key itself never has to be sent anywhere. |

## Certificates and keys

Full details are in [Certificates and keys](../concepts/certificates-and-keys.md).

| Term | Meaning |
|---|---|
| DFSP client certificate | The certificate a DFSP presents to the DFSP-facing gateway. Issued by the DFSP CA from a CSR the DFSP submits. |
| DFSP access key | The DFSP's own key pair for signing its requests to web-outbound (in the `authorization` header). The DFSP keeps the private key; Pivotal stores only the public key. |
| Hub JWS signing key | The key pair Pivotal uses to sign Hub-facing FSPIOP messages on a tenant's behalf. One per tenant. The private key is in Vault (`vault-kv`) or CloudHSM (`pkcs11`). Its public key is published to MCM. |
| Hub client certificate | The certificate Pivotal presents when it calls the Hub. Issued by the Hub CA through MCM. Stored in the Secret named by `HUB_SERVER_CERT_SECRET_NAME`: `pivotal-hub-client-cert` if you followed this guide (the code default is `hub-server-cert`). The settings say "server certificate" for historical reasons, but this is a client certificate. |
| Hub CA bundle | The Hub CA certificates Pivotal uses to check the Hub's server certificate. Secret `hub-ca-bundle`. |
| Hub callback certificate | The certificate the Hub presents when it calls Pivotal back. MCM holds its private key; Pivotal's Hub-client CA signs it. |
| web-inbound server certificate | The certificate the Pivotal callback gateway presents to the Hub. Secret `pivotal-web-inbound-hub-tls`. Issued by cert-manager through the Pivotal Hub-client CA. |
| Fingerprint | A short hash that identifies one certificate. Pivotal looks up a DFSP client certificate by its fingerprint. |
| `-cacert` Secret | The Secret an Istio gateway reads its client-certificate trust anchor from. It has the gateway credential's name plus `-cacert`, sits in the gateway's namespace, and holds the CA certificates under the key `cacert`. |

## Key profiles

| Term | Meaning |
|---|---|
| Key profile | Where Pivotal keeps its root CA keys and Hub JWS signing keys. Set with `KEY_PROVIDER` (Hub JWS keys) and by the CA ceremony you run (root keys). |
| `vault-kv` | The KMS-backed profile. Root keys in AWS KMS; Hub JWS signing keys in Vault KV. |
| `pkcs11` | The HSM-backed profile. Root keys and Hub JWS signing keys in AWS CloudHSM. |
| `none` | No Hub JWS signing keys are held or created. What an unset `KEY_PROVIDER` means: right only for a deployment that does not sign towards the Hub. |
| `database` | A legacy setting that keeps Hub JWS private keys in Pivotal's database. Not recommended and not covered by this guide. |
| `KEY_PROVIDER` | The setting that selects the key profile. Set it explicitly whenever JWS is used: unset means `none`. |
| KMS | AWS Key Management Service. Holds the root CA keys in the `vault-kv` profile. |
| HSM | Hardware security module. In this guide, AWS CloudHSM. |
| CloudHSM cluster | A group of HSMs that hold the same keys. |
| Crypto Officer | The CloudHSM administrator role (`admin` in `cloudhsm-cli`). Creates and manages HSM users. Held only by custodians. |
| Crypto user | A CloudHSM user that owns and uses keys (`crypto-user` in `cloudhsm-cli`). Each tenant has its own, named `cu_` plus the FSP ID with every character other than a letter or digit turned into `_`; the HSM shows names in lower case. web-outbound signs as `cu_web_outbound`. |
| Key sharing | A CloudHSM feature that lets a key's owner allow another crypto user to use the key. Tenant keys are shared with `cu_web_outbound`. |
| keyRef | The label that identifies a key inside the HSM. Stored in Vault with the key's public key (the key record), so services can find a tenant's key without holding it. |
| PKCS#11 | The standard interface Pivotal's Node services use to sign with the HSM. |
| JCE | Java Cryptography Extension. The connector signs with the HSM through the CloudHSM JCE provider. |
| HSM admin pod | The `hsm-tools` Deployment, from the `pivotal-hsm-tools` image, used for every CloudHSM administration task. Kept at zero replicas and scaled to one for a session. |
| `provision-hsm-tenant.sh` | The custodian's script, run in the HSM admin pod, that creates a DFSP's crypto user and HSM key and records its key reference and public key in Vault, before the DFSP is onboarded. |
| Custodian | A person who holds Crypto Officer or CA ceremony credentials. |
