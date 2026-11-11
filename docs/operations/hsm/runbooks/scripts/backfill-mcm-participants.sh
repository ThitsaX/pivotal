#!/usr/bin/env bash
# Register participants in MCM that predate the trust work.
#
# trust-manager addresses MCM per participant -- /dfsps/{id}/jwscerts to publish that tenant's
# public signing key, /dfsps/{id}/enrollments/inbound to enrol a certificate. A participant with
# no record there gets a 404 on both, so its peers never receive its key and, once verification
# is on, reject its traffic.
#
# Onboarding creates the record for anything new. This is for an environment whose participants
# existed before MCM did.
#
# Idempotent: it reads the register first and skips what is already there, so a partial run is
# simply re-run.
set -euo pipefail

# In-cluster, deliberately. The public host routes /api/* to an authorization proxy that expects a
# browser session, so the same call from outside fails in a way that looks like an auth problem.
MCM=${MCM_BASE_URL:-http://mcm-connection-manager-api.mcm.svc.cluster.local:3001/api}

# Required by MCM despite being absent from its swagger. Omitting it fails with
# `ValidationError: email is required`, which reads as though the field were unknown.
EMAIL=${PARTICIPANT_EMAIL:-}

# A single value, not a list, and nothing in Pivotal reads it. One zone per record.
ZONE=${MONETARY_ZONE_ID:-}

if [ "$#" -eq 0 ] || [ -z "$EMAIL" ] || [ -z "$ZONE" ]; then
    cat >&2 <<USAGE
Usage: PARTICIPANT_EMAIL=<address> MONETARY_ZONE_ID=<zone> $0 <fspId> [fspId...]

  PARTICIPANT_EMAIL   contact stored on each record
  MONETARY_ZONE_ID    e.g. USD
  MCM_BASE_URL        override if MCM is not at the in-cluster default

The fspIds must match Pivotal's participant registry, NOT the Kubernetes workload names. A
connector deployed as 'acme-java-connector' signing as 'AcmeBank' is registered here as 'AcmeBank'.
Check the portal's participant list if unsure -- a mismatch registers a participant nobody uses
while the real one still 404s.
USAGE
    exit 2
fi

# curl is absent from some client images; wget is usually present. Neither is guaranteed.
if command -v curl >/dev/null 2>&1; then
    get() { curl -fsS "$1"; }
    post() { curl -fsS -X POST "$1" -H 'Content-Type: application/json' -d "$2"; }
elif command -v wget >/dev/null 2>&1; then
    get() { wget -qO- "$1"; }
    # Not -q: it hides the response body, and on failure that body is the only thing that says why.
    post() { wget -O- --header='Content-Type: application/json' --post-data="$2" "$1"; }
else
    echo "Neither curl nor wget is available. Install one: apt-get install -y curl" >&2
    exit 1
fi

echo "Reading the register at $MCM/dfsps"
existing=$(get "$MCM/dfsps" || true)

created=0
skipped=0

for fsp in "$@"; do
    # Match the quoted id exactly, so 'mtn' does not match 'mtn-extra'.
    if printf '%s' "$existing" | grep -q "\"id\"[[:space:]]*:[[:space:]]*\"$fsp\""; then
        echo "  $fsp — already registered"
        skipped=$((skipped + 1))
        continue
    fi

    printf '  %s — registering ... ' "$fsp"
    body=$(printf '{"dfspId":"%s","name":"%s","email":"%s","monetaryZoneId":"%s"}' \
           "$fsp" "$fsp" "$EMAIL" "$ZONE")

    if post "$MCM/dfsps" "$body" >/dev/null; then
        echo "done"
        created=$((created + 1))
    else
        echo "FAILED"
        echo "    The response above says why. A participant is not created; the rest continue." >&2
    fi
done

echo
echo "$created created, $skipped already present."
echo
echo "trust-manager publishes keys hourly and enrols certificates daily, so it will pick these up"
echo "on its own. To see it now:  kubectl -n pivotal rollout restart deploy/trust-manager"
