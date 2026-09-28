#!/usr/bin/env bash
# Brings up the two NEW CA trust domains in the local k3d Vault, and wires
# cert-manager to issue from them. Local stand-in for trust-manager step 4b.
#
# Trust domains -- these must NOT be merged, or a DFSP's client certificate would
# be trusted by the Hub:
#
#   pki_hub_client   Pivotal's Hub-facing client leaves   trusted by the Hub via MCM
#   pki_dfsp         client certs issued TO DFSPs         trusted by Pivotal only
#
# Each domain gets a root and an intermediate, which is the structure the design
# specifies. In production the ROOT lives in AWS KMS (KMS-backed) or CloudHSM
# (HSM-backed) and signs its intermediate exactly once, in a ceremony; the
# INTERMEDIATE is software in Vault PKI under both profiles. Here the root is
# generated inside Vault too -- the only local deviation, and the only thing the
# real ceremony changes. Everything below the root is identical.
#
# Roles use pki/sign, never pki/issue: issue makes Vault generate the keypair,
# which contradicts "the private key never leaves the requester".
#
# Idempotent. Safe to re-run after a Vault pod restart.
set -euo pipefail

NS=${VAULT_NS:-vault}
POD=${VAULT_POD:-vault-0}
TOKEN=${VAULT_DEV_ROOT_TOKEN:-root-dev}
CM_NS=${CM_NS:-certmanager}

v() { kubectl exec -n "$NS" -i "$POD" -- sh -c "export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=$TOKEN; $1"; }

# ── one trust domain: root mount, intermediate mount, root signs intermediate ──
domain() {
  local name=$1 cn=$2
  v "vault secrets enable -path=${name}_root  -max-lease-ttl=87600h pki 2>/dev/null || true"
  v "vault secrets enable -path=${name}       -max-lease-ttl=43800h pki 2>/dev/null || true"

  # root: self-signed, generated in-mount. Replaced by the KMS/HSM root in step 5.
  v "vault read -field=certificate ${name}_root/cert/ca 2>/dev/null" >/dev/null 2>&1 || \
    v "vault write -field=certificate ${name}_root/root/generate/internal \
         common_name='${cn} Root' issuer_name='${name}-root' ttl=87600h key_bits=2048" >/dev/null

  # intermediate: CSR out, root signs it, signed cert back in
  v "vault write -field=csr ${name}/intermediate/generate/internal \
       common_name='${cn} Intermediate' key_bits=2048" > /tmp/${name}.csr
  v "cat > /tmp/i.csr; vault write -field=certificate ${name}_root/root/sign-intermediate \
       csr=@/tmp/i.csr format=pem_bundle ttl=43800h" < /tmp/${name}.csr > /tmp/${name}.crt
  v "cat > /tmp/i.crt; vault write ${name}/intermediate/set-signed certificate=@/tmp/i.crt" < /tmp/${name}.crt >/dev/null
  rm -f /tmp/${name}.csr /tmp/${name}.crt
  echo "  ${name}: root + intermediate ready"
}

echo "Trust domains:"
domain pki_hub_client "Pivotal Hub Client CA"
domain pki_dfsp       "Pivotal DFSP-Facing CA"

# ── issuing roles ─────────────────────────────────────────────────────────────
# Hub-facing: CLIENT certs for web-outbound and each connector. Registering the
# CA (not the leaf) with MCM is what lets these rotate with no MCM interaction.
v "vault write pki_hub_client/roles/pivotal-client \
     allow_any_name=true enforce_hostnames=false \
     client_flag=true server_flag=false \
     key_bits=2048 max_ttl=2160h ttl=2160h \
     organization='ThitsaWorks' ou='Pivotal' \
     no_store=true require_cn=false" >/dev/null

# DFSP-facing: client certs issued to DFSPs. trust-manager forces CN = fsp_id, so
# no certificate can exist whose subject contradicts its tenant.
# use_csr_common_name=false is load-bearing, not tidiness: Vault otherwise takes the subject from
# the submitted request, and a DFSP could name itself anything. The runtime binding rule compares
# the certificate against FSPIOP-Source, so a self-named certificate defeats the check it exists
# for. The same applies to SANs, which are another place an identity can hide.
v "vault write pki_dfsp/roles/dfsp-client \
     allow_any_name=true enforce_hostnames=false \
     client_flag=true server_flag=false \
     key_bits=2048 max_ttl=8760h ttl=8760h \
     organization='ThitsaWorks' ou='DFSP' \
     use_csr_common_name=false use_csr_sans=false \
     no_store=true require_cn=true" >/dev/null
echo "Roles: pki_hub_client/pivotal-client, pki_dfsp/dfsp-client"

# ── cert-manager's access ─────────────────────────────────────────────────────
# Sign only. cert-manager never needs to read, revoke or reconfigure a mount.
v "printf 'path \"pki_hub_client/sign/pivotal-client\" { capabilities = [\"create\",\"update\"] }\n' \
    | vault policy write pki-hub-client-sign -" >/dev/null
v "printf 'path \"pki_dfsp/sign/dfsp-client\" { capabilities = [\"create\",\"update\"] }\n' \
    | vault policy write pki-dfsp-sign -" >/dev/null
v "vault write auth/kubernetes/role/cert-manager \
     bound_service_account_names=vault-issuer \
     bound_service_account_namespaces=${CM_NS} \
     policies=pki-hub-client-sign,pki-dfsp-sign ttl=1h" >/dev/null
echo "Vault role 'cert-manager' bound to ${CM_NS}:vault-issuer"

echo
echo "Mounts:"; v "vault secrets list" | grep -E '^pki' || true
