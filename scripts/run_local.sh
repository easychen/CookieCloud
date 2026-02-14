#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

. "$ROOT/scripts/_lib_instance.sh"

usage() {
  cat <<EOF
Usage: bash scripts/run_local.sh [--instance <name>] [--host <ip>] [--port <n>]

Defaults:
  --instance  $(default_instance)
  --host      127.0.0.1 (unused; docker publishes ports)
  --port      8088
EOF
}

INSTANCE="$(default_instance)"
HOST="127.0.0.1"
PORT="8088"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE="${2:-}"
      shift 2
      ;;
    --host)
      HOST="${2:-}"
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

if [[ -z "$INSTANCE" ]]; then
  echo "Error: --instance is required" >&2
  exit 2
fi
if [[ -z "$HOST" ]]; then
  echo "Error: --host is required" >&2
  exit 2
fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Error: --port must be an integer" >&2
  exit 2
fi
PORT="$PORT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed" >&2
  exit 2
fi

mkdir -p var/logs

PROJECT="cookiecloud_${INSTANCE}"
COOKIECLOUD_PORT="$PORT" docker compose -p "$PROJECT" -f Docker-compose.yml up -d

cat > "var/logs/${INSTANCE}-docker.env" <<EOF
project=${PROJECT}
port=${PORT}
compose_file=Docker-compose.yml
EOF

echo ""
echo "UI: http://127.0.0.1:${PORT}/"
echo "Docker Compose project: ${PROJECT}"
echo "Marker: var/logs/${INSTANCE}-docker.env"
echo "Stop: bash scripts/stop_local.sh --instance ${INSTANCE}"

