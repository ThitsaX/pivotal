# 6. Turn On Hub-Facing JWS

> Sixth of six. Runs after [`5-turn-on-dfsp-mtls.md`](./5-turn-on-dfsp-mtls.md). The generic runbook
> is [`../4-turn-it-on-and-verify.md`](../4-turn-it-on-and-verify.md); this records what was run.

> ### ⚠ HSM-backed profile — `KEY_PROVIDER=pkcs11`
>
> Keys are generated **inside the device** and never exist as a file. Vault holds a crypto-user
> credential and an opaque key reference, never key material.
>
> The KMS-backed procedure — generate a keypair, `vault kv put privateKey=@key.pem` — is for
> `KEY_PROVIDER=vault-kv` and belongs to [`../../../kms/`](../../../kms/). Running it here creates
> exactly the software key this profile exists to eliminate, and it then has to be destroyed from
> Vault, from the laptop that made it, and from MCM. **That mistake has been made; it is the reason
> for this banner.**

Onboarding provisions a key automatically. **A participant onboarded before that existed has none**,
and re-onboarding a live DFSP is not an option — so section B does by hand what onboarding does.

---

## A. Point web-outbound at the device — configuration

| Setting | Value | Why |
| --- | --- | --- |
| `KEY_PROVIDER` | `pkcs11` | Signing happens in the device; no private key in this process |
| `HSM_CRED_PATH` | `pivotal/hsmcred/web-outbound` | Its own crypto user. One credential, every tenant's key |
| `KEY_REF_PATH` | `pivotal/keyref` | Where the reference naming each tenant's key is read from |
| `PKCS11_MODULE_PATH` | `/opt/cloudhsm/lib/libcloudhsm_pkcs11.so` | The device library, shipped in the image |
| `PKCS11_SESSION_POOL_SIZE` | `4` | Measured: ~543 signatures/sec at 4, ~256 at 16. `pkcs11js` has no async `C_SignInit`, so that call blocks Node's thread and more sessions make it worse. Scale with replicas |
| `PKCS11_TOKEN_LABEL` | unset | CloudHSM names its single token itself; the lookup takes the only one present |
| `CLOUDHSM_IP` | the cluster's private IP | Consumed by the image entrypoint, which runs the vendor's `configure-pkcs11` |
| `CLOUDHSM_DISABLE_KEY_AVAILABILITY_CHECK` | `true` **only on a one-HSM cluster** | The client refuses to create *or use* a key held by fewer than two HSMs, so without this every signature fails — see [`1-verify-cluster.md`](./1-verify-cluster.md) section C |
| `VAULT_*` | as for any workload | It still reads Vault — for the credential and the key reference |

**The cluster certificate is not an environment variable.** The library reads it from a fixed path
and refuses to connect without it. Mount it with **`subPath`**:

```yaml
volumeMounts:
  - name: cloudhsm-customer-ca
    mountPath: /opt/cloudhsm/etc/customerCA.crt
    subPath: customerCA.crt
```

Mounting the ConfigMap as a directory masks the library's own configuration files in
`/opt/cloudhsm/etc`, and the client then fails as something unrelated to certificates. A ConfigMap
is enough: the certificate is public.

**`pivotal/hsmcred/web-outbound` must exist before this syncs.** The signer factory refuses at
startup without it, rather than failing per request.

## B. Provision a tenant in the device — by hand

| # | Command | Purpose |
| --- | --- | --- |
| 34 | `./provision-hsm-tenant.sh <fspId>` | Custodian step: creates the crypto user, writes its credential to Vault. The only step needing a Crypto Officer |
| 35 | `./provision-hsm-tenant.sh <fspId> --generate-key` | Also generates the keypair **in the device**, shares it with the signing user, exports the public half, records the keyRef |

What `--generate-key` runs:

```
key generate-asymmetric-pair rsa --private-attributes sign=true extractable=false
key share --username <web-outbound crypto user>
vault kv put <KEY_REF_PATH>/<fspId> keyRef='<fspId>-jws-<version>'
```

**`extractable=false` is what makes this the HSM profile.** It is a creation-time property: no
backend retrofits it, so a key generated without it is not fixable, only replaceable.

**The tenant's password is generated inside the script and goes straight to Vault.** No human reads
it — so even the custodian who created the user cannot later sign as that tenant.

**`--generate-key` is doing trust-manager's job by hand.** Stop using it the day the provisioner
ships, or two things will be creating keys.

**Ownership cannot be transferred.** The key is generated *as the tenant* and shared with the
signing user. Sharing lets that user sign; it does not let it delete, and it does not make it the
owner. There is no PKCS#11 operation for sharing — hence the CLI, and hence this being manual.

## C. The database row — by hand

The script prints the exported public half under *"Public key for participant_key and MCM"* but
does not write it. web-outbound requires:

```
role === 'self'  AND  jws_sign_enabled === true  AND  fsp_id non-empty
```

| # | Command | Purpose |
| --- | --- | --- |
| 36 | `UPDATE participant_key SET role='self', jws_public_key='<exported public half>', jws_sign_activated_at=NULL WHERE fsp_id='<fspId>';` | `self` = Pivotal signs as this participant. Rows predating the trust work are `peer`, meaning verify-only |
| 37 | *(nothing)* | Leave `jws_sign_enabled` at 0 |

**Do not set `jws_sign_enabled` by hand.** trust-manager publishes the public key to MCM and only
then sets the flag. Setting it first makes Pivotal sign before peers can verify, and every signed
request is rejected.

Safe on a live DFSP: nothing changes until the flag flips *and* `FSPIOP_USE_JWS` is on.

| # | Command | Purpose |
| --- | --- | --- |
| 38 | `kubectl -n pivotal rollout restart deploy/trust-manager` | Its publish tick runs at startup. Check `TTL pivotal:trust:jws-key-publish` first — a held lock outlives the pod and the restart does nothing |
| 39 | `SELECT fsp_id, role, jws_sign_enabled, jws_sign_activated_at FROM participant_key WHERE fsp_id='<fspId>';` | Expect `self`, `1`, and a timestamp |

The participant must also exist in MCM, or the publish 404s — see
[`4-after-the-ceremony.md`](./4-after-the-ceremony.md) section 7.

## D. Turn signing on — configuration

`FSPIOP_USE_JWS=true`, once the tenants that will transact show `jws_sign_enabled=1`.

A tenant with no key logs a warning and sends **unsigned** rather than failing, so this is safe to
turn on early and proves nothing by itself. Per-participant `jws_sign_enabled` decides who actually
signs, which is how DFSPs migrate one at a time.

**Check where the flag lands.** If it sits in a shared env block it reaches the connectors too.
Connectors on images predating the setting ignore it; newer ones will try to sign, and without their
own Vault settings they log a warning and send unsigned. Render per workload rather than grepping:

```bash
helm template . | ruby -ryaml -e 'YAML.load_stream(STDIN.read){|d| next unless d&&d["kind"]=="Deployment";
  e=(d.dig("spec","template","spec","containers",0,"env")||[]).find{|x| x["name"]=="FSPIOP_USE_JWS"}
  puts "#{d.dig("metadata","name")}: #{e&.dig("value")}" }'
```

Inbound verification is separate: `FSPIOP_JWS_VERIFY_MODE` on web-inbound, overridden per
participant by `jws_verify_mode`. Raise it only once a peer is seen signing.

**Java connectors sign their own hub-facing callbacks**, so a fully signed tenant needs its
connector configured too — `VAULT_URL` (not `VAULT_ADDRESS`), its own `VAULT_ROLE`, and the same
`keyRef` path. They read no `PKCS11_*` settings: they reach the device through the vendor's JCE
provider, configured from `CLOUDHSM_IP`.
