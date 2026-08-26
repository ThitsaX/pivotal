#!/usr/bin/env bash
# Seeds secret/pivotal/jwskey/<fspId> in the IN-CLUSTER Vault from the tenants in
# pivotal.participant_key. Stands in for trust-manager, which does not exist yet.
#
# The local Vault runs in dev mode (storage: inmem), so every Vault pod restart
# loses all keys. Re-run this after one. It is idempotent.
#
# Per tenant with role='self':
#   - private key still in MySQL  -> copy it to Vault, leave the DB column alone
#     (the stored public key keeps pairing, nothing else has to change)
#   - private key already NULL    -> generate a fresh RSA-2048 pair, write the
#     private half to Vault and UPDATE the DB public key to match
#
# Decision 21 says regenerate rather than migrate; that applies to production keys
# sitting in plaintext MySQL. Locally, preserving a working pair avoids breaking a
# tenant mid-test, and regeneration is free until the first MCM publish.
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

  if [ "$has_priv" = "1" ]; then
    echo "SELECT jws_private_key FROM pivotal.participant_key WHERE fsp_id='$fsp';" | sql | unesc > "$tmp/$fsp.key"
    note="migrated from MySQL"
  else
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp/$fsp.key" 2>/dev/null
    openssl rsa -in "$tmp/$fsp.key" -pubout -out "$tmp/$fsp.pub" 2>/dev/null
    pub=$(cat "$tmp/$fsp.pub")
    printf "UPDATE pivotal.participant_key SET jws_public_key='%s' WHERE fsp_id='%s';\n" "$pub" "$fsp" | sql
    note="generated fresh, DB public key updated"
  fi

  openssl rsa -in "$tmp/$fsp.key" -noout -check >/dev/null 2>&1 || { echo "  $fsp: INVALID KEY, skipped" >&2; continue; }
  vault_exec "cat > /tmp/k.pem; vault kv put secret/pivotal/jwskey/$fsp privateKey=@/tmp/k.pem >/dev/null; rm -f /tmp/k.pem" < "$tmp/$fsp.key"
  printf "  %-10s seeded (%s)\n" "$fsp" "$note"
done

echo
echo "In Vault now:"
vault_exec "vault kv list secret/pivotal/jwskey"
