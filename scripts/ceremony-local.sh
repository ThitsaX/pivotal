#!/usr/bin/env bash
# Local rehearsal of the CA root ceremony — trust-manager step 5a.
#
# Runs the SAME ceremony as production against SoftHSM2 instead of AWS KMS or
# CloudHSM. That substitution is faithful because **neither KMS nor CloudHSM is a
# CA**: both only sign a digest, and the ceremony script builds the X.509 itself
# (settled decision 13). Only the signing call differs:
#
#   HSM-backed (prod)   PKCS#11 C_Sign  -> CloudHSM
#   KMS-backed (prod)   kms:Sign        -> AWS KMS
#   here                PKCS#11 C_Sign  -> SoftHSM2
#
# SoftHSM speaks the same PKCS#11 interface, so this exercises the production
# code path (architecture.md 4.6). What it CANNOT prove: non-exportability of a
# KMS key, IAM scoping, CloudTrail, or the kms:Sign alarm. And PKCS#11 is a loose
# contract — login models and session handling vary by device, so budget an
# integration pass per real device.
#
# Run twice over, once per trust domain. The roots MUST stay separate: merging
# them would make a DFSP's client certificate trusted by the Hub
# (architecture.md 4.7).
#
# This REPLACES the Vault-generated roots from step 4b. The intermediates are
# regenerated, so any leaf issued before this runs stops chaining and must be
# reissued.
set -euo pipefail

HERE=${CEREMONY_DIR:-/private/tmp/claude-501/-Users-sithukyaw-Documents-sithukyaw-Thitsaworks-Thitsax-pivotal-update/7fb4fdb4-6400-4810-adf3-a7c9eb0a826f/scratchpad/ceremony}
MOD=${PKCS11_MODULE:-/opt/homebrew/lib/softhsm/libsofthsm2.so}
PIN=${HSM_PIN:-1234}
SO_PIN=${HSM_SO_PIN:-1234}
NS=${VAULT_NS:-vault}
POD=${VAULT_POD:-vault-0}
TOKEN=${VAULT_DEV_ROOT_TOKEN:-root-dev}

# Two env vars the engine needs, and both fail quietly if unset:
#   OPENSSL_ENGINES   — the engine ships in libp11's own dir, not this openssl's
#                       ENGINESDIR, so it is not found by default.
#   PKCS11_MODULE_PATH— which PKCS#11 module the engine loads. Without it the
#                       engine loads a different one, finds no token, and reports
#                       "PKCS11_get_private_key returned NULL" — which looks like
#                       a missing key even though the key is right there.
export OPENSSL_ENGINES=${OPENSSL_ENGINES:-/opt/homebrew/lib/engines-3}
export PKCS11_MODULE_PATH=${PKCS11_MODULE_PATH:-$MOD}
export SOFTHSM2_CONF="$HERE/softhsm2.conf"

mkdir -p "$HERE/tokens" "$HERE/out"
cat > "$SOFTHSM2_CONF" <<EOF
directories.tokendir = $HERE/tokens/
objectstore.backend = file
objectstore.umask = 0077
log.level = ERROR
slots.removable = false
slots.mechanisms = ALL
EOF

v() { kubectl exec -n "$NS" -i "$POD" -- sh -c "export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=$TOKEN; $1"; }

ceremony() {
  local mount=$1 label=$2 cn=$3
  local out="$HERE/out/$mount"
  mkdir -p "$out"
  echo
  echo "── $cn ──────────────────────────────────────────"

  # 1. token per trust domain — a separate root keypair each time.
  #    `--init-token --free` is NOT idempotent: it grabs a free slot and creates
  #    a NEW token every run, so re-running silently produces duplicate tokens
  #    with the same label. The engine then matches ambiguously and reports
  #    "PKCS11_get_private_key returned NULL". Only initialise if absent.
  if ! softhsm2-util --show-slots 2>/dev/null | grep -q "Label: *$label"; then
    softhsm2-util --init-token --free --label "$label" --so-pin "$SO_PIN" --pin "$PIN" >/dev/null 2>&1
  fi

  # 2. root keypair, generated IN the device. --sensitive marks the private half
  #    non-extractable: it can be used, never read out.
  if ! pkcs11-tool --module "$MOD" --token-label "$label" --login --pin "$PIN" \
        --list-objects 2>/dev/null | grep -q "label:      ${mount}-root"; then
    pkcs11-tool --module "$MOD" --token-label "$label" --login --pin "$PIN" \
      --keypairgen --key-type rsa:2048 --label "${mount}-root" --id 01 \
      --private --sensitive >/dev/null 2>&1
  fi
  echo "  root keypair in HSM (non-extractable)"

  local KEYURI="pkcs11:token=${label};object=${mount}-root;type=private;pin-value=${PIN}"

  # 3. self-signed root. The script builds the X.509; the HSM only signs.
  cat > "$out/root.cnf" <<EOF
[req]
distinguished_name=dn
x509_extensions=v3
prompt=no
[dn]
O=ThitsaWorks
CN=$cn Root
[v3]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
EOF
  openssl req -new -x509 -days 3650 -engine pkcs11 -keyform engine -key "$KEYURI" \
    -sha256 -config "$out/root.cnf" -out "$out/root.pem" 2>/dev/null
  echo "  root cert signed by HSM: $(openssl x509 -in "$out/root.pem" -noout -subject | sed 's/subject=//')"

  # 4. Vault intermediate — private half generated in Vault and stays there
  v "vault secrets disable $mount 2>/dev/null || true" >/dev/null
  v "vault secrets enable -path=$mount -max-lease-ttl=43800h pki" >/dev/null
  v "vault write -field=csr $mount/intermediate/generate/internal \
       common_name='$cn Intermediate' key_bits=2048" > "$out/inter.csr"

  # 5. the root signs the intermediate — ONCE, and only here
  cat > "$out/inter.ext" <<EOF
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
EOF
  openssl x509 -req -engine pkcs11 -CAkeyform engine -CAkey "$KEYURI" \
    -CA "$out/root.pem" -in "$out/inter.csr" -set_serial 2 -days 1825 \
    -sha256 -extfile "$out/inter.ext" -out "$out/inter.pem" 2>/dev/null
  echo "  intermediate signed by HSM root"

  # 6. signed intermediate back into Vault
  v "cat > /tmp/i.crt; vault write $mount/intermediate/set-signed certificate=@/tmp/i.crt" < "$out/inter.pem" >/dev/null
  echo "  intermediate installed in Vault mount '$mount'"

  # 6b. Re-create the issuing role. Step 4 above disables and re-enables the
  #     mount, which destroys every role on it — so the ceremony must put back
  #     what it removed, or cert-manager fails with "unknown role".
  case "$mount" in
    pki_hub_client)
      v "vault write $mount/roles/pivotal-client \
           allow_any_name=true enforce_hostnames=false \
           client_flag=true server_flag=false \
           key_bits=2048 max_ttl=2160h ttl=2160h \
           organization='ThitsaWorks' ou='Pivotal' \
           no_store=true require_cn=false" >/dev/null
      echo "  role restored: $mount/roles/pivotal-client" ;;
    pki_dfsp)
      v "vault write $mount/roles/dfsp-client \
           allow_any_name=true enforce_hostnames=false \
           client_flag=true server_flag=false \
           key_bits=2048 max_ttl=8760h ttl=8760h \
           organization='ThitsaWorks' ou='DFSP' \
           no_store=true require_cn=true" >/dev/null
      echo "  role restored: $mount/roles/dfsp-client" ;;
  esac

  # 7. CRL rehearsal. Revoking an intermediate needs a root-signed CRL, and it is
  #    far easier to write now than to discover during an incident.
  mkdir -p "$out/ca"; : > "$out/ca/index.txt"; echo 1000 > "$out/ca/crlnumber"
  cat > "$out/ca/ca.cnf" <<EOF
[ca]
default_ca=CA_default
[CA_default]
database=$out/ca/index.txt
crlnumber=$out/ca/crlnumber
default_md=sha256
default_crl_days=30
EOF
  openssl ca -gencrl -config "$out/ca/ca.cnf" -engine pkcs11 -keyform engine \
    -keyfile "$KEYURI" -cert "$out/root.pem" -out "$out/root.crl" 2>/dev/null \
    && echo "  root CRL signed by HSM: $(openssl crl -in "$out/root.crl" -noout -lastupdate | sed 's/.*=//')" \
    || echo "  root CRL: FAILED"
}

ceremony pki_hub_client pivotal-hub-client "Pivotal Hub Client CA"
ceremony pki_dfsp       pivotal-dfsp       "Pivotal DFSP-Facing CA"

echo
echo "Roots are in SoftHSM. Public certs and CRLs under $HERE/out/"
