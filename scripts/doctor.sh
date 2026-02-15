#!/usr/bin/env bash
set -euo pipefail

CC_INVOCATION_PWD="${PWD}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

. "$ROOT/scripts/_lib_instance.sh"

usage() {
  cat <<EOF
Usage: bash scripts/doctor.sh [--instance <name>] [--port <n>]

Defaults:
  --instance  $(default_instance)
  --port      8088 (or read from var/logs/<instance>-docker.env if present)
EOF
}

INSTANCE="$(default_instance)"
PORT=""
PORT_SET="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      PORT_SET="1"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

validate_instance "$INSTANCE"
require_cmd curl

if [[ "$PORT_SET" != "1" ]]; then
  PORT="$(try_read_marker_port "$INSTANCE" || true)"
fi
PORT="${PORT:-8088}"
validate_port "$PORT"

BASE="http://127.0.0.1:${PORT}"

tmp_ready="$(mktemp)"
tmp_diag="$(mktemp)"
tmp_metrics="$(mktemp)"
trap 'rm -f "$tmp_ready" "$tmp_diag" "$tmp_metrics"' EXIT

echo "Doctor: instance=${INSTANCE} base=${BASE}"

curl -fsS "${BASE}/healthz" >/dev/null

ready_code="$(curl -sS -o "$tmp_ready" -w "%{http_code}" "${BASE}/readyz")" || true
if [[ "$ready_code" != "200" ]]; then
  echo "readyz failed: http_status=$ready_code body=$(cat "$tmp_ready")" >&2
  exit 1
fi
if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$tmp_ready"; then
  echo "readyz failed: ok!=true body=$(cat "$tmp_ready")" >&2
  exit 1
fi

curl -fsS "${BASE}/diagnostics" >"$tmp_diag"
if grep -Eqi '(password|token|secret|api[_-]?key|authorization|cc_hmac_keys|x-cc-signature)' "$tmp_diag"; then
  echo "diagnostics appears to contain sensitive fields; refusing (matched secret patterns)" >&2
  exit 1
fi

curl -fsS "${BASE}/metrics" >"$tmp_metrics"
if ! grep -q 'cookiecloud_http_requests_total' "$tmp_metrics"; then
  echo "metrics missing cookiecloud_http_requests_total" >&2
  exit 1
fi

echo "Doctor OK"

