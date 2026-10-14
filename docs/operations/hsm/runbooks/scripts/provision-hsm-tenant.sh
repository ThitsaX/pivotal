#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 ThitsaWorks Pte. Ltd.
#
# Provisions one DFSP's Hub-facing JWS signing key in CloudHSM, before the DFSP is onboarded.
#
#   provision-hsm-tenant.sh <fspId>
#
# Run it inside the HSM admin pod: that is where the HSM and Vault are reachable. It
#
#   1. creates the tenant's crypto user, with a random password that goes straight to Vault;
#   2. generates the key inside the HSM as that user, so the tenant owns it and it cannot
#      be exported;
#   3. shares the key with the crypto user web-outbound signs as;
#   4. records the key reference and the public key in Vault.
#
# Portal onboarding then reads the key reference and public key and records the public key.
# It creates nothing in the HSM, and refuses a DFSP this script has not provisioned.
#
# Every step is safe to re-run. A DFSP already provisioned is reported and left alone.
#
# The tenant's crypto-user password is generated here and written to Vault. No human reads
# it, so even the custodian who created the user cannot later sign as that tenant.
set -euo pipefail

FSP=${1:-}

if [ -z "$FSP" ] || [ $# -ne 1 ]; then
  echo "usage: $0 <fspId>" >&2
  echo >&2
  echo "  VAULT_ADDR    Vault's address from inside the cluster (required)" >&2
  echo "  VAULT_TOKEN   a custodian's Vault token (prompted when unset)" >&2
  echo "  CRYPTO_USER   override the derived crypto-user name, for a tenant whose" >&2
  echo "                user was created before this script existed" >&2
  exit 1
fi

# fspId ends up in a crypto-user name, a Vault path and a key label. Keep it boring.
if ! printf '%s' "$FSP" | grep -qE '^[A-Za-z0-9][A-Za-z0-9_-]{1,30}$'; then
  echo "REFUSING: '$FSP' is not a safe fspId (letters, digits, - and _ only)." >&2
  exit 1
fi

# The device allows only a-z, A-Z, 0-9 and underscore in a username, so the prefix uses
# underscores and anything else in the fspId is folded to one. An fspId carrying a hyphen
# or a dot is otherwise rejected at user creation, several steps in.
#
# Overridable, because an environment that created its crypto users before this script
# existed will have named them by some other convention -- lower case, say. Creating a
# second user for a tenant is worse than a mismatched name: ownership is conferred at
# creation, so whichever user generated the key is the only one that can ever manage it.
CU=${CRYPTO_USER:-cu_$(printf '%s' "$FSP" | tr -c 'A-Za-z0-9' '_')}
WEB_OUTBOUND_CU=${WEB_OUTBOUND_CU:-cu_web_outbound}

KV_MOUNT=${KV_MOUNT:-pivotal-kv}
CRED_PATH="${KV_MOUNT}/pivotal/hsmcred/${FSP}"
KEYREF_PATH="${KV_MOUNT}/pivotal/keyref/${FSP}"

# Vault is reached over the network from inside the cluster. Running `vault` inside another
# pod through `kubectl exec` would put the token and the password on that exec's command line.
if [ -z "${VAULT_ADDR:-}" ]; then
  echo "REFUSING: VAULT_ADDR is not set. Run this inside the HSM admin pod, with Vault's" >&2
  echo "in-cluster address, for example http://vault.vault.svc.cluster.local:8200." >&2
  exit 1
fi
export VAULT_ADDR

CLI=${CLOUDHSM_CLI:-/opt/cloudhsm/bin/cloudhsm-cli}

# cloudhsm-cli reports failures as JSON on stdout, not stderr, so a call whose output is
# discarded fails under `set -e` with nothing printed at all. Hold the output and print it
# when the exit status is non-zero. The credential goes in the environment, not in argv.
hsm() {
  local role=$1 pin=$2; shift 2
  local out status
  out=$(CLOUDHSM_ROLE="$role" CLOUDHSM_PIN="$pin" "$CLI" "$@" 2>&1) && status=0 || status=$?
  if [ $status -ne 0 ]; then
    printf '%s\n' "$out" >&2
    return $status
  fi
  printf '%s\n' "$out"
}

tmp=$(mktemp -d)
cleanup() {
  rm -rf "$tmp"
  unset CO_PIN CU_PASS CU_PIN VAULT_TOKEN 2>/dev/null || true
}
trap cleanup EXIT

echo "Provisioning '$FSP' (crypto user '$CU')"
echo

# ---------------------------------------------------------------------------
# Already provisioned?
# ---------------------------------------------------------------------------

if [ -z "${VAULT_TOKEN:-}" ]; then
  read -r -s -p "  Vault token: " VAULT_TOKEN
  echo
fi
export VAULT_TOKEN

# Checked first, so a bad or expired token is not mistaken below for "nothing provisioned".
if ! vault token lookup >/dev/null 2>&1; then
  echo "REFUSING: this Vault token is not valid, or Vault is not reachable at $VAULT_ADDR." >&2
  exit 1
fi

existing_ref=$(vault kv get -field=keyRef "$KEYREF_PATH" 2>/dev/null || true)
existing_pub=$(vault kv get -field=publicKey "$KEYREF_PATH" 2>/dev/null || true)

if [ -n "$existing_ref" ] && [ -n "$existing_pub" ]; then
  echo "  '$FSP' is already provisioned with key '$existing_ref'. Nothing to do."
  echo "  The DFSP can be onboarded in the portal."
  exit 0
fi

# A key reference without a public key was written before this script recorded both. That
# tenant already has a key in the HSM that its connector and web-outbound sign with; a new
# one would silently replace it and every signature would stop verifying.
if [ -n "$existing_ref" ]; then
  echo "REFUSING: '$FSP' already has key '$existing_ref' but no public key in $KEYREF_PATH." >&2
  echo "It was provisioned before this script recorded public keys. Nothing was changed." >&2
  echo "This DFSP is already keyed; it does not need provisioning again." >&2
  exit 1
fi

read -r -p "  Crypto Officer username [admin]: " CO_USER
CO_USER=${CO_USER:-admin}
read -r -s -p "  Crypto Officer password: " CO_PASS
echo
CO_PIN="${CO_USER}:${CO_PASS}"
unset CO_PASS
echo

# ---------------------------------------------------------------------------
# 1. The crypto user, and its credential in Vault
# ---------------------------------------------------------------------------

# The match is deliberately loose. cloudhsm-cli's output format has changed between SDK
# releases, and a check tied to one shape would silently stop detecting existing users.
# Matching the username anywhere costs a false positive only if some other user's name
# contains this one, which the fspId charset rules out.
# Captured first, then searched: piping into `grep -q` ends the read early, and under
# pipefail the writer's broken pipe would stop the script. Case-insensitive, because the
# device stores usernames in lower case whatever case they were created with.
users=$(hsm admin "$CO_PIN" user list)
if printf '%s\n' "$users" | grep -iE "(^|[^A-Za-z0-9_-])${CU}([^A-Za-z0-9_-]|$)" >/dev/null; then
  echo "  crypto user '$CU' already exists; using its credential from Vault"
else
  # A credential with no matching user means the name did not match -- a tenant created under
  # another naming convention, say. Overwriting it would lock that tenant's connector out of
  # its own key, so stop instead.
  if vault kv get -field=password "$CRED_PATH" >/dev/null 2>&1; then
    echo "REFUSING: $CRED_PATH already holds a credential, but no crypto user '$CU' exists." >&2
    echo "Set CRYPTO_USER to this tenant's existing crypto user. Nothing was changed." >&2
    exit 1
  fi

  # 32 random characters, the device's maximum. Nobody reads this; it goes straight to Vault.
  # pipefail is off for this one pipeline: `head` stops reading once it has enough, and the
  # broken pipe that leaves `tr` with is how this is meant to end, not a failure.
  CU_PASS=$(set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)

  # Written to Vault before the user exists, so a failure between the two steps leaves a
  # credential with no user -- harmless, and overwritten on the next run -- rather than a
  # user whose password nobody has.
  printf '%s' "$CU_PASS" | vault kv put "$CRED_PATH" username="$CU" password=- >/dev/null
  echo "  credential written: $CRED_PATH"

  # The one secret this script cannot keep out of argv: `user create` takes the new
  # password as a flag. It is visible only inside this pod, for the moment the command runs.
  hsm admin "$CO_PIN" user create --username "$CU" --role crypto-user --password "$CU_PASS" >/dev/null
  echo "  crypto user created: $CU"
  unset CU_PASS
fi

# Read back from Vault rather than reused from memory: this is the credential the connector
# will log in with, so it is the one that has to be right.
cu_pass=$(vault kv get -field=password "$CRED_PATH" 2>/dev/null || true)
if [ -z "$cu_pass" ]; then
  echo "  FAILED: no password readable at $CRED_PATH" >&2
  exit 1
fi
CU_PIN="${CU}:${cu_pass}"
unset cu_pass
unset CO_PIN

# ---------------------------------------------------------------------------
# 2. The key, generated as the tenant
# ---------------------------------------------------------------------------

# The label is the keyRef. A new one is minted every time, so a reference never names
# two keys.
LABEL="${FSP}-jws-$(date -u +%Y%m%d%H%M%S)"

# extractable=false is a creation-time property: a key made without it cannot be fixed,
# only replaced.
hsm crypto-user "$CU_PIN" key generate-asymmetric-pair rsa \
  --public-label  "${LABEL}-pub" \
  --private-label "$LABEL" \
  --modulus-size-bits 2048 \
  --public-exponent 65537 \
  --private-attributes sign=true extractable=false >/dev/null
echo "  key generated in the HSM: $LABEL"

# ---------------------------------------------------------------------------
# 3. Share it with web-outbound
# ---------------------------------------------------------------------------

# Only the owner can share, which is why the key had to be generated as the tenant.
hsm crypto-user "$CU_PIN" key share \
  --filter "attr.label=${LABEL}" \
  --username "$WEB_OUTBOUND_CU" \
  --role crypto-user >/dev/null
echo "  shared with $WEB_OUTBOUND_CU"

# ---------------------------------------------------------------------------
# 4. Record the key reference and public key
# ---------------------------------------------------------------------------

hsm crypto-user "$CU_PIN" key generate-file \
  --encoding pem \
  --path "$tmp/pub.pem" \
  --filter "attr.label=${LABEL}-pub" >/dev/null

if ! openssl pkey -pubin -in "$tmp/pub.pem" -noout 2>/dev/null; then
  echo "  FAILED: the exported public key could not be read" >&2
  exit 1
fi

vault kv put "$KEYREF_PATH" keyRef="$LABEL" publicKey=@"$tmp/pub.pem" >/dev/null
echo "  key reference and public key recorded: $KEYREF_PATH"

# ---------------------------------------------------------------------------
# Verification -- read back what was written
# ---------------------------------------------------------------------------

echo
echo "── verification ─────────────────────────────────"
# --verbose, because the default prints only the reference and the label -- not the owners
# or the users it is shared with, which are what this run has to have got right.
hsm crypto-user "$CU_PIN" key list --filter "attr.label=${LABEL}" --verbose || true
echo
echo "keyRef in Vault:     $(vault kv get -field=keyRef "$KEYREF_PATH")"
if [ "$(vault kv get -field=publicKey "$KEYREF_PATH")" = "$(cat "$tmp/pub.pem")" ]; then
  echo "publicKey in Vault:  matches the HSM"
else
  echo "publicKey in Vault:  DOES NOT MATCH the HSM" >&2
  exit 1
fi

echo
echo "Confirm above that the key's owner is $(printf '%s' "$CU" | tr 'A-Z' 'a-z') (the HSM shows it in lower case),"
echo "it is shared with $WEB_OUTBOUND_CU,"
echo "and extractable is false. Then onboard '$FSP' in the portal."
