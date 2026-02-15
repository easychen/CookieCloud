#!/usr/bin/env bash
set -euo pipefail

CC_INVOCATION_PWD="${PWD}"
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

validate_instance "$INSTANCE"
require_cmd docker

PROJECT="cookiecloud_${INSTANCE}"
docker compose -p "$PROJECT" -f Docker-compose.yml down
