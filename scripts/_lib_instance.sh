#!/usr/bin/env bash
set -euo pipefail

die() {
  echo "Error: $*" >&2
  exit 2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed"
}

default_instance() {
  # Prefer the directory where the script was invoked from (before cd to repo root).
  if [[ -n "${CC_INVOCATION_PWD:-}" ]]; then
    basename "$CC_INVOCATION_PWD"
  else
    basename "$(pwd)"
  fi
}

validate_instance() {
  local instance="$1"
  [[ -n "$instance" ]] || die "--instance is required"
  [[ "$instance" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || die "invalid --instance '$instance' (allowed: [A-Za-z0-9_-], max 64)"
}

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]{1,5}$ ]] || die "invalid --port '$port'"
  (( port >= 1 && port <= 65535 )) || die "invalid --port '$port' (1-65535)"
}

marker_path() {
  local instance="$1"
  echo "var/logs/${instance}-docker.env"
}

write_marker() {
  local instance="$1"
  local project="$2"
  local port="$3"

  mkdir -p var/logs
  cat >"$(marker_path "$instance")" <<EOF
project=${project}
port=${port}
EOF
}

try_read_marker_port() {
  local instance="$1"
  local marker
  marker="$(marker_path "$instance")"
  [[ -f "$marker" ]] || return 1

  local port
  port="$(sed -n 's/^port=//p' "$marker" | head -n1)"
  [[ -n "$port" ]] || return 1
  echo "$port"
}
