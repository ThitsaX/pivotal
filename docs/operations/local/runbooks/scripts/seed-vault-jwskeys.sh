#!/usr/bin/env bash
# LOCAL DEVELOPMENT ONLY. Re-seeds signing keys after a dev-mode Vault restart.
#
# ############################################################################
# #  DO NOT RUN THIS AGAINST A SHARED OR PRODUCTION ENVIRONMENT.             #
# #                                                                          #
# #  It generates a FRESH keypair for every tenant with role='self' and      #
# #  updates the public key in MySQL -- but it does NOT republish to MCM.    #
# #  Peers verify against what MCM holds, so on any environment whose keys   #
# #  have been published, this silently breaks signing for every tenant at   #
# #  once. It was written when trust-manager did not exist; trust-manager    #
# #  now provisions keys at onboarding and is the only thing that should.    #
# #                                                                          #
# #  It also writes the LEGACY path secret/pivotal/jwskey/<fspId>. Deployed  #
# #  environments use the pivotal-kv v2 mount, so what it writes here is not #
# #  even where a real deployment reads from.                                #
# ############################################################################
#
# What it is still good for: the local stack runs Vault in dev mode (storage:
# inmem), so every Vault pod restart loses all keys and nothing can sign. This
# regenerates them so local work can continue. That is the whole of its remit.
#
# Every tenant with role='self' gets a FRESH RSA-2048 pair: the private half is
# written to Vault and the DB public key is updated to match.
#
# It never copies a key out of participant.jws_private_key: any value in that column
# is plaintext PEM and must be treated as compromised, so migrating it would carry
# the exposure forward. Regeneration is free until the first MCM publish -- after
# that, every key change is a coordinated break per FSP.
#
# The column is deliberately NOT cleared here. Retiring those legacy rows is a
# migration script's job, and it needs to be able to find them.
set -euo pipefail

NS=${VAULT_NS:-vault}
POD=${VAULT_POD:-vault-0}
TOKEN=${VAULT_DEV_ROOT_TOKEN:-root-dev}
MYSQL_CONTAINER=${MYSQL_CONTAINER:-mysql}
MYSQL_USER=${MYSQL_USER:-central_ledger}
MYSQL_PASS=${MYSQL_PASS:-password}

vault_exec() { kubectl exec -n "$NS" -i "$POD" -- sh -c "export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=$TOKEN; $1"; }
sql()        { docker exec -i "$MYSQL_CONTAINER" mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" -N -B 2>/dev/null; }
unesc()      { python3 -c 'import sys; sys.stdout.write(sys.stdin.read().rstrip("\n").replace("\\n","\n")+"\n")'; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

echo "SELECT fsp_id FROM pivotal.participant_key WHERE role='self' ORDER BY id;" | sql | while read -r fsp; do
  [ -z "$fsp" ] && continue
  has_priv=$(echo "SELECT jws_private_key IS NOT NULL FROM pivotal.participant_key WHERE fsp_id='$fsp';" | sql)

  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp/$fsp.key" 2>/dev/null
  openssl rsa -in "$tmp/$fsp.key" -pubout -out "$tmp/$fsp.pub" 2>/dev/null
  pub=$(cat "$tmp/$fsp.pub")
  printf "UPDATE pivotal.participant_key SET jws_public_key='%s' WHERE fsp_id='%s';\n" "$pub" "$fsp" | sql
  note="regenerated, DB public key updated"
  if [ "$has_priv" = "1" ]; then
    note="$note; LEGACY plaintext key still in the column"
  fi

  openssl rsa -in "$tmp/$fsp.key" -noout -check >/dev/null 2>&1 || { echo "  $fsp: INVALID KEY, skipped" >&2; continue; }
  vault_exec "cat > /tmp/k.pem; vault kv put secret/pivotal/jwskey/$fsp privateKey=@/tmp/k.pem >/dev/null; rm -f /tmp/k.pem" < "$tmp/$fsp.key"
  printf "  %-10s seeded (%s)\n" "$fsp" "$note"
done

echo
echo "In Vault now:"
vault_exec "vault kv list secret/pivotal/jwskey"
