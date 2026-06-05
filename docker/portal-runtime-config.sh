#!/bin/sh
set -eu

config_file="/usr/share/nginx/html/config.js"
api_base_url="${WEB_PIVOTAL_API_BASE_URL:-${VITE_WEB_PIVOTAL_API_BASE_URL:-}}"
signing_keys_ui_enabled="${VITE_SIGNING_KEYS_UI_ENABLED:-}"

escape_js() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$config_file" <<EOF
window.__PIVOTAL_CONFIG__ = {
    WEB_PIVOTAL_API_BASE_URL: "$(escape_js "$api_base_url")",
    SIGNING_KEYS_UI_ENABLED: "$(escape_js "$signing_keys_ui_enabled")",
};
EOF
