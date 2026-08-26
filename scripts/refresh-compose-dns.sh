#!/usr/bin/env bash
# Adds CoreDNS host records for compose containers on Docker networks that k3d
# did not scan when the cluster was created (it only scans the --network one).
#
# Entries are merged into the `coredns` ConfigMap's NodeHosts block. They can NOT
# go in a `coredns-custom` *.override file: k3d's Corefile already uses the
# `hosts` plugin for NodeHosts, and CoreDNS allows that plugin only once per
# server block -- a second one crash-loops CoreDNS.
#
# Container IPs change when compose recreates a container, and k3d rewrites
# NodeHosts on node changes, so re-run this after `docker compose up` or a
# cluster restart. Idempotent: it replaces its own previous entries.
set -euo pipefail

NETS=(pivotal-stack_default mojaloop-demowallet_default)
MARK="# --- managed:compose-dns ---"

new=""
for net in "${NETS[@]}"; do
  while read -r cname; do
    [ -z "$cname" ] && continue
    case "$cname" in k3d-*) continue ;; esac
    ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}" "$cname" 2>/dev/null || true)
    [ -z "$ip" ] && continue
    aliases=$(docker inspect -f "{{range (index .NetworkSettings.Networks \"$net\").Aliases}}{{.}} {{end}}" "$cname" 2>/dev/null || true)
    new+="${ip} ${cname} ${aliases}"$'\n'
  done < <(docker network inspect "$net" -f '{{range .Containers}}{{.Name}}{{println}}{{end}}' 2>/dev/null || true)
done

[ -z "$new" ] && { echo "No containers found on: ${NETS[*]}" >&2; exit 1; }

cur=$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.NodeHosts}')
# drop everything from our marker down, so re-runs replace rather than append
base=$(printf '%s\n' "$cur" | sed "/^${MARK}\$/,\$d")
merged=$(printf '%s\n%s\n%s' "$base" "$MARK" "$new")

kubectl patch configmap coredns -n kube-system --type merge \
  -p "$(kubectl create configmap tmp --dry-run=client -o json --from-literal=NodeHosts="$merged" \
        | python3 -c 'import json,sys; print(json.dumps({"data":{"NodeHosts":json.load(sys.stdin)["data"]["NodeHosts"]}}))')" >/dev/null

echo "NodeHosts updated. CoreDNS reloads within ~15s (hosts plugin reload 15s)."
echo
printf '%s' "$new"
