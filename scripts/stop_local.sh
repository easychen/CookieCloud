#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

. "$ROOT/scripts/_lib_instance.sh"

usage() {
  cat <<EOF
Usage: bash scripts/stop_local.sh [--instance <name>]

Defaults:
  --instance  $(default_instance)
EOF
}

INSTANCE="$(default_instance)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE="${2:-}"
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

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed" >&2
  exit 2
fi

PROJECT="cookiecloud_${INSTANCE}"
docker compose -p "$PROJECT" -f Docker-compose.yml down

