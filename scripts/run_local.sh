#!/usr/bin/env bash
set -euo pipefail

CC_INVOCATION_PWD="${PWD}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

. "$ROOT/scripts/_lib_instance.sh"

usage() {
  cat <<EOF
Usage: bash scripts/run_local.sh [--instance <name>] [--port <n>]

Defaults:
  --instance  $(default_instance)
  --port      8088
EOF
}

INSTANCE="$(default_instance)"
PORT="8088"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
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
validate_port "$PORT"

require_cmd docker

mkdir -p var/logs

PROJECT="cookiecloud_${INSTANCE}"
COOKIECLOUD_PORT="$PORT" docker compose -p "$PROJECT" -f Docker-compose.yml up -d --build
write_marker "$INSTANCE" "$PROJECT" "$PORT"

echo ""
echo "UI: http://127.0.0.1:${PORT}/"
echo "Docker Compose project: ${PROJECT}"
echo "Marker: var/logs/${INSTANCE}-docker.env"
echo "Stop: bash scripts/stop_local.sh --instance ${INSTANCE}"
