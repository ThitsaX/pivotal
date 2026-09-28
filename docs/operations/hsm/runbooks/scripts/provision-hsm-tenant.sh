#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 ThitsaWorks Pte. Ltd.
#
# Provisions one DFSP's crypto user and JWS signing key in CloudHSM.
#
#   ./provision-hsm-tenant.sh <fspId>                 custodian step only
#   ./provision-hsm-tenant.sh <fspId> --generate-key  also generate and share the key
#
# TWO MODES, AND THE DIFFERENCE MATTERS.
#
#   default          Creates the crypto user and delivers its credential to Vault.
#                    This is the ONLY step that needs a Crypto Officer, and it is
#                    the custodian's job in steady state.
#
#   --generate-key   Also generates the keypair, shares it, and records the keyRef.
#                    These belong to trust-manager, which cannot do them yet because
#                    KEY_PROVIDER=pkcs11 has no implementation. Use this to prove the
#                    path and to onboard while that is outstanding. STOP using it the
#                    day the provisioner ships, or two things will be creating keys.
#
# The tenant's CU password is generated HERE, at random, and goes straight to Vault.
# No human reads it. That matters: it means even the custodian who created the user
# cannot later log in as that tenant and sign.
set -euo pipefail

FSP=${1:-}
MODE=${2:-}

if [ -z "$FSP" ]; then
  echo "usage: $0 <fspId> [--generate-key]" >&2
  exit 1
fi

# Reject an unrecognised second argument rather than ignoring it. A typo like
# --generate-keys would otherwise run the custodian steps, exit 0, and leave the
# operator believing a key was generated -- which is exactly the silent success this
# script's verification section exists to prevent.
if [ -n "$MODE" ] && [ "$MODE" != "--generate-key" ]; then
  echo "unknown option '$MODE' — did you mean --generate-key?" >&2
  exit 1
fi

# fspId ends up in a crypto-user name, a Vault path and a key label. Keep it boring.
if ! printf '%s' "$FSP" | grep -qE '^[A-Za-z0-9][A-Za-z0-9_-]{1,30}$'; then
  echo "REFUSING: '$FSP' is not a safe fspId (letters, digits, - and _ only)." >&2
  exit 1
fi

# The device allows only a-z, A-Z, 0-9 and underscore in a username, so the prefix uses
# underscores and anything else in the fspId is folded to one. An fspId carrying a hyphen
# or a dot is otherwise rejected at user creation, several steps into onboarding.
CU="cu_$(printf '%s' "$FSP" | tr -c 'A-Za-z0-9' '_')"
WEB_OUTBOUND_CU=${WEB_OUTBOUND_CU:-cu_web_outbound}

KV_MOUNT=${KV_MOUNT:-pivotal-kv}
CRED_PATH="${KV_MOUNT}/pivotal/hsmcred/${FSP}"
KEYREF_PATH="${KV_MOUNT}/pivotal/keyref/${FSP}"

VAULT_NS=${VAULT_NS:-vault}
VAULT_POD=${VAULT_POD:-vault-0}
VAULT_TOKEN=${VAULT_TOKEN:-}

MOD=${PKCS11_MODULE:-/opt/cloudhsm/lib/libcloudhsm_pkcs11.so}

v() {
  kubectl exec -n "$VAULT_NS" -i "$VAULT_POD" -- sh -c \
    "export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=$VAULT_TOKEN; $1"
}

hsm() {
  local pin=$1; shift
  CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN="$pin" cloudhsm-cli "$@"
}

cleanup() { unset CO_PIN CU_PASS CU_PIN VAULT_TOKEN 2>/dev/null || true; }
trap cleanup EXIT

echo "Provisioning '$FSP'"
echo

# ---------------------------------------------------------------------------
# Credentials — prompted, never in argv
# ---------------------------------------------------------------------------
# A password on the command line lands in shell history and in the process list.

read -r -p "  Crypto Officer username [admin]: " CO_USER
CO_USER=${CO_USER:-admin}
read -r -s -p "  Crypto Officer password: " CO_PASS; echo
CO_PIN="${CO_USER}:${CO_PASS}"
unset CO_PASS

if [ -z "$VAULT_TOKEN" ]; then
  read -r -s -p "  Vault token: " VAULT_TOKEN; echo
fi
echo

# ---------------------------------------------------------------------------
# 1. The crypto user
# ---------------------------------------------------------------------------
# Idempotent on purpose. Onboarding gets retried after partial failures, and a
# second run must not leave a tenant with two crypto users or two keys -- the
# second key is invisible until something signs with the wrong one.

# The match is deliberately loose. cloudhsm-cli's output format has changed between
# SDK releases, and a check tied to one shape would silently stop detecting existing
# users -- turning a documented-idempotent re-run into a hard failure at `user
# create`. Matching the username anywhere in the output costs a false positive only
# if some other user's name contains this one, which the fspId charset rules out.
if CLOUDHSM_ROLE=admin CLOUDHSM_PIN="$CO_PIN" cloudhsm-cli user list 2>/dev/null \
     | grep -qE "(^|[^A-Za-z0-9_-])${CU}([^A-Za-z0-9_-]|$)"; then
  echo "  crypto user '$CU' already exists — not recreating"
  echo
  echo "  Its password is only in Vault. If you need to re-provision this tenant from"
  echo "  scratch, delete the user and the Vault path first, deliberately."
  CU_EXISTS=yes
else
  # 32 random characters -- the device's maximum, which its slot info reports as 8/32.
  # Nobody reads this; it goes straight to Vault.
  CU_PASS=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)

  CLOUDHSM_ROLE=admin CLOUDHSM_PIN="$CO_PIN" \
    cloudhsm-cli user create --username "$CU" --role crypto-user --password "$CU_PASS" >/dev/null
  echo "  crypto user created: $CU"
  CU_EXISTS=no
fi

# ---------------------------------------------------------------------------
# 2. Deliver the credential to Vault
# ---------------------------------------------------------------------------
# {username, password}, not {pin}. SoftHSM needs only a PIN, so a dev-first design
# tends to store one -- and then the move to CloudHSM changes the secret schema, the
# client and every write. The shape is the same in both profiles from the start.

if [ "$CU_EXISTS" = no ]; then
  v "vault kv put ${CRED_PATH} username='${CU}' password='${CU_PASS}'" >/dev/null
  echo "  credential written: ${CRED_PATH}"
  unset CU_PASS
fi

# Read it back. This path is how the connector authenticates; if it is wrong the
# failure appears later, at pod start, as an HSM login error nobody connects to here.
CU_PASS_READ=$(v "vault kv get -field=password ${CRED_PATH}" 2>/dev/null || true)
if [ -z "$CU_PASS_READ" ]; then
  echo "  FAILED: nothing readable at ${CRED_PATH}" >&2
  exit 1
fi
CU_PIN="${CU}:${CU_PASS_READ}"
unset CU_PASS_READ
echo "  credential verified readable"

# ---------------------------------------------------------------------------
# 3-5. Key generation, sharing, keyRef  — trust-manager's job
# ---------------------------------------------------------------------------

if [ "$MODE" != "--generate-key" ]; then
  echo
  echo "Done — custodian steps only."
  echo
  echo "Next, grant this connector's Vault policy exactly these two paths:"
  echo "    ${CRED_PATH}"
  echo "    ${KEYREF_PATH}"
  echo "Then onboard the DFSP in the portal. trust-manager generates the key."
  exit 0
fi

echo
echo "  --generate-key: performing trust-manager's steps by hand"

# The label IS the keyRef, and it must be version-inclusive: rotation always mints a
# new one, never "latest". A label that stays the same across rotations would let a
# process sign with a key its peers have not been told about.
VERSION=$(date -u +%Y%m%d%H%M%S)
LABEL="${FSP}-jws-${VERSION}"

# extractable=false is a creation-time property. A key made without it is not
# fixable, only replaceable -- and it would be a software key in an HSM-backed
# deployment, which is the exact thing this profile exists to prevent.
hsm "$CU_PIN" key generate-asymmetric-pair rsa \
  --public-label  "${LABEL}-pub" \
  --private-label "$LABEL" \
  --modulus-size-bits 2048 \
  --public-exponent 65537 \
  --private-attributes sign=true extractable=false >/dev/null
echo "  key generated in the HSM: $LABEL"

# Sharing is done by the OWNER, not by a Crypto Officer. Ownership is conferred at
# creation and there is no transfer operation, which is why the key had to be
# generated as this tenant's own crypto user rather than as trust-manager.
hsm "$CU_PIN" key share \
  --filter "attr.label=${LABEL}" \
  --username "$WEB_OUTBOUND_CU" \
  --role crypto-user >/dev/null
echo "  shared with $WEB_OUTBOUND_CU"

# The public half is always exportable, even when the private half is not. Read it
# with the generic PKCS#11 tool so this works against any module.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"; cleanup' EXIT
pkcs11-tool --module "$MOD" --login --pin "$CU_PIN" \
  --read-object --type pubkey --label "${LABEL}-pub" \
  --output-file "$tmp/pub.der" >/dev/null 2>&1
openssl rsa -pubin -inform DER -in "$tmp/pub.der" -out "$tmp/pub.pem" 2>/dev/null
echo "  public key exported"

v "vault kv put ${KEYREF_PATH} keyRef='${LABEL}'" >/dev/null
echo "  keyRef recorded: ${KEYREF_PATH} = ${LABEL}"

# ---------------------------------------------------------------------------
# Verification — read back what was written
# ---------------------------------------------------------------------------
# Every silent failure in this system so far has looked exactly like success: a
# scheduler registering nothing, a KV v1 mount round-tripping to a path no CLI could
# see. Print the truth rather than "OK".

echo
echo "── verification ─────────────────────────────────"
hsm "$CU_PIN" key list --filter "attr.label=${LABEL}" || true
echo
echo "keyRef in Vault: $(v "vault kv get -field=keyRef ${KEYREF_PATH}")"
echo
echo "Public key for participant_key and MCM:"
cat "$tmp/pub.pem"

echo
echo "Confirm above that key-owners is [$CU] and shared-users includes $WEB_OUTBOUND_CU."
echo "If owners shows anything else, the key was generated as the wrong crypto user"
echo "and must be destroyed and regenerated — ownership cannot be changed."
