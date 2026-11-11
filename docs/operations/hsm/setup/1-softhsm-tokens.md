# SoftHSM Tokens

> ### ⚠ SoftHSM backend only
>
> This is the alternative to [`1-cloudhsm-cluster.md`](./1-cloudhsm-cluster.md). Use it to stand the
> HSM-backed profile up in a **development cluster**, where there is no CloudHSM to point at.
>
> **Then go straight to [`3-services-and-gateways.md`](./3-services-and-gateways.md).** There is no
> ceremony step on this path — see below.

Run **once per environment**, then once more per DFSP as they are onboarded.

---

## What this does and does not give you

SoftHSM implements the same PKCS#11 interface CloudHSM does, so the services run **the same signing
code** here as they would against real hardware. That is the point: you can prove the profile works
before any hardware exists.

**What it proves:** signatures come out correct through `C_Sign`, the Java provider resolves the key,
`keyRef` lookup works, the conformance vectors still pass, and the Vault credential paths are wired
correctly.

**What it does not prove**, and this matters when reporting progress:

- **There is no crypto-user model.** SoftHSM has one security-officer PIN and one user PIN per token.
  There is no per-user key ownership and no sharing. The token-per-tenant arrangement below
  *approximates* the isolation, but it is enforced by Kubernetes mounts rather than by the device.
- **Session behaviour differs.** The login model, how long a session lives, and how a client recovers
  from an idle disconnect all vary by device. CloudHSM will not behave like this.

So a working environment here means *the code is right*. It does not mean the profile is validated.

## Why there is no ceremony step

A development cluster already has certificate authorities. Re-rooting them in SoftHSM would mean
reissuing every certificate and redistributing trust anchors, for no gain — the CAs are unrelated to
where the **signing keys** live, which is the only thing this backend changes.

Leave the certificate authorities as they are.

---

## The shape: one token per tenant

| Holder | Mounts | Sees |
| --- | --- | --- |
| A tenant's connector | that tenant's token only | one key |
| web-outbound | every token | every key |

This mirrors how the profile behaves on real hardware: a connector reaches exactly one tenant, and
web-outbound signs as whichever tenant is the payer, so it necessarily reaches them all.

**Do not use a single shared token for everything.** It works, and it silently removes the only
isolation this arrangement has — every connector would then hold every tenant's key.

### Storage

SoftHSM keeps a token as a directory of files, and key generation writes to it, so the store has to
be writable and must survive a restart.

Use **one ReadWriteMany volume** holding a directory per tenant, and mount it with `subPath` so each
pod sees only its own:

```yaml
# a connector — one tenant
volumeMounts:
  - name: softhsm-tokens
    mountPath: /var/lib/softhsm/tokens
    subPath: DemoDFSP3

# web-outbound — all tenants
volumeMounts:
  - name: softhsm-tokens
    mountPath: /var/lib/softhsm/tokens
```

The isolation is the `subPath`, not the filesystem. That is weaker than key ownership inside a
device, and it is the main thing this backend cannot reproduce.

---

## 1. Put the module in the images

Every workload that signs — web-outbound and each connector — needs the SoftHSM library and a config
file pointing at the token directory.

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends softhsm2 \
 && rm -rf /var/lib/apt/lists/*
```

```bash
# SOFTHSM2_CONF, supplied as a ConfigMap
directories.tokendir = /var/lib/softhsm/tokens/
objectstore.backend = file
objectstore.umask = 0077
log.level = ERROR
slots.removable = false
slots.mechanisms = ALL
```

Set `SOFTHSM2_CONF` to that file's path in every signing workload.

**Prove it from a pod before going further:**

```bash
kubectl exec -it <pod> -- softhsm2-util --show-slots
```

If that lists slots, the module and the config are right. Debugging this later through application
code is much harder.

## 2. Create a token per tenant

Once per DFSP, before onboarding it:

```bash
softhsm2-util --init-token --free \
  --label DemoDFSP3 \
  --so-pin "$SO_PIN" \
  --pin "$USER_PIN"
```

> **`--init-token --free` is not idempotent.** It takes whichever slot is free and creates a **new**
> token every time, so re-running leaves two tokens with the same label. The PKCS#11 lookup then
> matches ambiguously and reports a missing key even though the key is there. Check first:
>
> ```bash
> softhsm2-util --show-slots | grep -q "Label: *DemoDFSP3" || softhsm2-util --init-token ...
> ```

Generate the user PIN randomly rather than choosing one. Nobody needs to read it — it goes straight
to Vault in the next step.

## 3. Put the PIN in Vault

```bash
vault kv put pivotal-kv/pivotal/hsmcred/DemoDFSP3 \
  username=DemoDFSP3 password="$USER_PIN"
```

**Write `username` even though SoftHSM ignores it.** CloudHSM authenticates with a username *and* a
password, and keeping the secret in that shape means moving to hardware changes only the module path
— not the secret schema, the client code, and every write.

Grant that connector's Vault policy exactly two paths, both its own:

```
pivotal-kv/pivotal/hsmcred/DemoDFSP3
pivotal-kv/pivotal/keyref/DemoDFSP3
```

web-outbound reads every `keyref/*` plus its own single `hsmcred/web-outbound`.

## 4. Point the workloads at the module

```
PKCS11_MODULE_PATH=/usr/lib/softhsm/libsofthsm2.so
```

**This one variable is the whole difference from CloudHSM**, which uses
`/opt/cloudhsm/lib/libcloudhsm_pkcs11.so`. Everything else — `KEY_PROVIDER`, the Vault paths, the
`keyRef` model — is identical, which is what makes this a real rehearsal.

---

## Done when

- [ ] `softhsm2-util --show-slots` succeeds from inside a signing pod
- [ ] One token exists per tenant, each with a distinct label, and no label appears twice
- [ ] Each connector mounts only its own token directory
- [ ] web-outbound mounts all of them
- [ ] Each PIN is in Vault under `hsmcred/<fspId>`, and each connector's policy grants only its own
- [ ] `PKCS11_MODULE_PATH` is set on every signing workload

---

**Next:** [`3-services-and-gateways.md`](./3-services-and-gateways.md) — the Vault auth roles,
cert-manager, MCM and both gateways. Skip the ceremony; the certificate authorities already exist.
