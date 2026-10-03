#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 ThitsaWorks Pte. Ltd.
#
# Repoints one participant's callback endpoints in the Hub's ledger from one base URL to another.
#
#   ./repoint-callbacks.sh <participant> <from-base> <to-base>            # dry run: prints the changes
#   ./repoint-callbacks.sh <participant> <from-base> <to-base> --apply    # writes them
#
# e.g. moving a tenant's callbacks onto web-inbound's public mutual-TLS host:
#
#   ./repoint-callbacks.sh DemoDFSP2 \
#     http://web-inbound.pivotal.svc.cluster.local:3201 http://web-inbound.<domain> --apply
#
# and back again by swapping the two bases. Only the base changes; each path and its
# {{placeholders}} are kept, and an endpoint not starting with <from-base> is left alone.
#
# The new base is plain http, deliberately. The Hub's egress gateway upgrades a callback to
# mutual TLS only when it is addressed to the public host over http; an https URL would bypass
# that and fail.
#
# Reaches the central ledger's admin API at CENTRAL_LEDGER_URL, by default a port-forward:
#
#   kubectl -n mojaloop port-forward svc/moja-centralledger-service 3001:80
#
# The Hub caches participant endpoints, so a change can take a few minutes to be used.

set -euo pipefail

CENTRAL_LEDGER_URL="${CENTRAL_LEDGER_URL:-http://localhost:3001}"

if [[ $# -lt 3 ]]; then
    sed -n '5,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
fi

participant="$1"
from_base="${2%/}"
to_base="${3%/}"
apply="${4:-}"

endpoints="$(curl -fsS "${CENTRAL_LEDGER_URL}/participants/${participant}/endpoints")"

changes="$(printf '%s' "$endpoints" | jq -c --arg from "$from_base" --arg to "$to_base" '
    .[] | select(.value | startswith($from))
        | {type, from: .value, value: ($to + (.value | ltrimstr($from)))}')"

total="$(printf '%s' "$endpoints" | jq 'length')"
count="$(printf '%s' "$changes" | grep -c . || true)"

echo "${participant}: ${count} of ${total} endpoints start with ${from_base}"

if [[ "$count" -eq 0 ]]; then
    exit 0
fi

printf '%s\n' "$changes" | jq -r '"  \(.type)\n    \(.from)\n -> \(.value)"'

if [[ "$apply" != "--apply" ]]; then
    echo "Dry run. Re-run with --apply to write these."
    exit 0
fi

failed=0

while IFS= read -r change; do
    body="$(printf '%s' "$change" | jq -c '{type, value}')"
    type="$(printf '%s' "$change" | jq -r '.type')"

    status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        -H 'Content-Type: application/json' \
        --data "$body" \
        "${CENTRAL_LEDGER_URL}/participants/${participant}/endpoints")"

    if [[ "$status" =~ ^2 ]]; then
        echo "  ok    ${type}"
    else
        echo "  FAIL  ${type} (HTTP ${status})"
        failed=$((failed + 1))
    fi
done <<< "$changes"

# Read back rather than trust the status codes: what the Hub routes by is what the ledger holds.
remaining="$(curl -fsS "${CENTRAL_LEDGER_URL}/participants/${participant}/endpoints" \
    | jq --arg from "$from_base" '[.[] | select(.value | startswith($from))] | length')"

echo "${participant}: ${remaining} endpoints still start with ${from_base}; ${failed} writes failed."

[[ "$failed" -eq 0 && "$remaining" -eq 0 ]]
