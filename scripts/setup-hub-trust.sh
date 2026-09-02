#!/usr/bin/env bash
# Writes the Hub CA trust bundle — the material Pivotal uses to decide whether it
# is really talking to the Hub.
#
# The Secret is AUTHORITATIVE (pki-issuance-flows.md 3.4, resolved 2026-09-02).
# It is not a projection of MySQL. `hub_ca` is read by web-outbound, the Gateway
# and every connector, and connectors have no MySQL access by design — so by
# architecture.md 5.1's own rule, "one authoritative store, chosen by who reads
# it", MySQL cannot own this value. `hub_trust` keeps a mirror for expiry
# alerting only, on the same terms as participant_key_ref.
#
# A Secret rather than Vault KV because Envoy decides it: the Gateway needs the
# bundle as a client-cert trust store and reads Kubernetes Secrets over SDS, not
# Vault. One mechanism serves all three consumers; Vault KV would serve two.
#
# A CA certificate is public, so this is storage, not custody. What it needs is
# write-integrity and audit, not secrecy: whoever can write it can insert their
# own CA and be trusted as the Hub.
#
# In production, trust-manager fetches the bundle with `GET /hub/ca` through MCM.
# MCM is not wired up yet and the local Hub does no client-cert verification, so
# this generates a STAND-IN Hub CA to prove the delivery path. Replacing the
# fetch is the single line marked below; nothing downstream changes.
set -euo pipefail

NS=${PIVOTAL_NS:-pivotal}
SECRET=${HUB_CA_SECRET:-hub-ca-bundle}
HUB_CA_PEM=${HUB_CA_PEM:-}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

if [ -n "$HUB_CA_PEM" ] && [ -f "$HUB_CA_PEM" ]; then
  cp "$HUB_CA_PEM" "$tmp/hub-ca.pem"
  origin="supplied: $HUB_CA_PEM"
else
  # ── replace with: mcm GET /hub/ca ──────────────────────────────────────────
  # Stand-in only. Regenerating it produces a DIFFERENT CA, which is the correct
  # behaviour to observe: every consumer must reload or the handshake breaks.
  if kubectl get secret "$SECRET" -n "$NS" >/dev/null 2>&1; then
    kubectl get secret "$SECRET" -n "$NS" -o jsonpath='{.data.hub-ca\.pem}' | base64 -d > "$tmp/hub-ca.pem"
    origin="existing Secret (unchanged)"
  else
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -subj "/O=Mojaloop/CN=Hub CA (stand-in)" \
      -keyout "$tmp/hub-ca.key" -out "$tmp/hub-ca.pem" >/dev/null 2>&1
    origin="generated stand-in (MCM not yet wired)"
  fi
fi

kubectl create secret generic "$SECRET" -n "$NS" \
  --from-file=hub-ca.pem="$tmp/hub-ca.pem" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

fp=$(openssl x509 -in "$tmp/hub-ca.pem" -noout -fingerprint -sha256 | sed 's/.*=//')
na=$(openssl x509 -in "$tmp/hub-ca.pem" -noout -enddate | sed 's/.*=//')

echo "Secret $NS/$SECRET written — $origin"
echo "  subject:     $(openssl x509 -in "$tmp/hub-ca.pem" -noout -subject | sed 's/subject=//')"
echo "  fingerprint: $fp"
echo "  not_after:   $na"
echo
echo "Mirror into hub_trust is NOT written: that table does not exist yet"
echo "(implementation-plan.md section 2 proposes it; no migration creates it)."
