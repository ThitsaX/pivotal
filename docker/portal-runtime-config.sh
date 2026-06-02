#!/bin/sh
set -eu

config_file="/usr/share/nginx/html/config.js"
api_base_url="${WEB_PIVOTAL_API_BASE_URL:-${VITE_WEB_PIVOTAL_API_BASE_URL:-}}"
job_ttl_min="${REPORT_DOWNLOAD_JOB_TTL_MIN:-${VITE_JOB_TTL_MIN:-}}"
ready_ttl_hours="${REPORT_DOWNLOAD_READY_TTL_HOURS:-${VITE_READY_TTL_HOURS:-}}"
poll_interval_sec="${REPORT_DOWNLOAD_POLL_INTERVAL_SEC:-${VITE_POLL_INTERVAL_SEC:-}}"

# Backward compatible (ms) keys.
job_ttl_ms="${REPORT_DOWNLOAD_JOB_TTL_MS:-${VITE_REPORT_DOWNLOAD_JOB_TTL_MS:-}}"
ready_ttl_ms="${REPORT_DOWNLOAD_READY_TTL_MS:-${VITE_REPORT_DOWNLOAD_READY_TTL_MS:-}}"
poll_interval_ms="${REPORT_DOWNLOAD_POLL_INTERVAL_MS:-${VITE_REPORT_DOWNLOAD_POLL_INTERVAL_MS:-}}"
signing_keys_ui_enabled="${VITE_SIGNING_KEYS_UI_ENABLED:-}"

escape_js() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$config_file" <<EOF
window.__PIVOTAL_CONFIG__ = {
    WEB_PIVOTAL_API_BASE_URL: "$(escape_js "$api_base_url")",
    REPORT_DOWNLOAD_JOB_TTL_MIN: "$(escape_js "$job_ttl_min")",
    REPORT_DOWNLOAD_READY_TTL_HOURS: "$(escape_js "$ready_ttl_hours")",
    REPORT_DOWNLOAD_POLL_INTERVAL_SEC: "$(escape_js "$poll_interval_sec")",
    REPORT_DOWNLOAD_JOB_TTL_MS: "$(escape_js "$job_ttl_ms")",
    REPORT_DOWNLOAD_READY_TTL_MS: "$(escape_js "$ready_ttl_ms")",
    REPORT_DOWNLOAD_POLL_INTERVAL_MS: "$(escape_js "$poll_interval_ms")"
    SIGNING_KEYS_UI_ENABLED: "$(escape_js "$signing_keys_ui_enabled")",
};
EOF
