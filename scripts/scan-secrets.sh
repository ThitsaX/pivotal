#!/usr/bin/env sh

set -eu

if ! command -v gitleaks >/dev/null 2>&1; then
    echo "gitleaks is required: https://github.com/gitleaks/gitleaks#installing" >&2
    exit 2
fi

output_dir="${1:-security-scan-results}"
mkdir -p "$output_dir"

tree_status=0
history_status=0

gitleaks dir . \
    --max-decode-depth 3 \
    --max-archive-depth 2 \
    --redact=100 \
    --no-banner \
    --no-color \
    --report-format json \
    --report-path "$output_dir/gitleaks-working-tree.json" ||
    tree_status=$?

gitleaks git . \
    --log-opts="--all --full-history" \
    --max-decode-depth 3 \
    --max-archive-depth 2 \
    --redact=100 \
    --no-banner \
    --no-color \
    --report-format json \
    --report-path "$output_dir/gitleaks-history.json" ||
    history_status=$?

if [ "$tree_status" -ne 0 ] || [ "$history_status" -ne 0 ]; then
    echo "Secret scan failed. Review the redacted reports in $output_dir." >&2
    exit 1
fi

echo "Secret scan passed. Redacted reports are in $output_dir."
