#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${CC_BASE_URL:-http://127.0.0.1:8088}"
API_ROOT="${CC_API_ROOT:-}"
UUID="${CC_UUID:-demo_user_001}"
KEY_ID="${CC_KEY_ID:-default}"
AUTH_SECRET="${CC_AUTH_SECRET:-}"

if [[ -z "${AUTH_SECRET}" ]]; then
  echo "CC_AUTH_SECRET is required"
  exit 1
fi

if [[ -n "${API_ROOT}" && "${API_ROOT}" != /* ]]; then
  API_ROOT="/${API_ROOT}"
fi
API_ROOT="${API_ROOT%/}"

update_path="${API_ROOT}/update"
get_path="${API_ROOT}/get/${UUID}"

sha256_hex() {
  printf '%s' "$1" | openssl dgst -sha256 -r | awk '{print $1}'
}

sha256_stable_json() {
  node -e '
const crypto = require("crypto");
const input = process.argv[1] || "";

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

let value = input;
try {
  value = JSON.parse(input);
} catch (error) {
  value = input;
}

const payload = typeof value === "string" ? value : stableStringify(value);
process.stdout.write(crypto.createHash("sha256").update(payload).digest("hex"));
' "$1"
}

sign_request() {
  local method="$1"
  local path="$2"
  local uuid="$3"
  local body="$4"

  local timestamp nonce body_hash signature_payload signature
  timestamp="$(date +%s)"
  nonce="$(openssl rand -hex 16)"
  if [[ "${method^^}" == "GET" ]]; then
    body_hash="$(sha256_hex '')"
  else
    body_hash="$(sha256_stable_json "${body}")"
  fi

  signature_payload="${method}\n${path}\n${uuid}\n${timestamp}\n${nonce}\n${body_hash}"
  signature="$(printf '%b' "${signature_payload}" | openssl dgst -sha256 -hmac "${AUTH_SECRET}" -r | awk '{print $1}')"

  echo "${timestamp}|${nonce}|${signature}"
}

post_body="$(printf '{"uuid":"%s","encrypted":"%s","crypto_type":"%s"}' "${UUID}" "demo-encrypted" "aes-256-gcm-v1")"
IFS='|' read -r post_ts post_nonce post_sig <<< "$(sign_request "POST" "${update_path}" "${UUID}" "${post_body}")"

post_http_code="$(curl -sS -o /tmp/cookiecloud_post.out -w '%{http_code}' \
  -X POST "${BASE_URL}${update_path}" \
  -H "Content-Type: application/json" \
  -H "X-CC-Key-Id: ${KEY_ID}" \
  -H "X-CC-Timestamp: ${post_ts}" \
  -H "X-CC-Nonce: ${post_nonce}" \
  -H "X-CC-Signature: ${post_sig}" \
  --data "${post_body}")"

echo "POST /update => HTTP ${post_http_code}"
cat /tmp/cookiecloud_post.out

echo

IFS='|' read -r get_ts get_nonce get_sig <<< "$(sign_request "GET" "${get_path}" "${UUID}" "")"
get_http_code="$(curl -sS -o /tmp/cookiecloud_get.out -w '%{http_code}' \
  -X GET "${BASE_URL}${get_path}" \
  -H "X-CC-Key-Id: ${KEY_ID}" \
  -H "X-CC-Timestamp: ${get_ts}" \
  -H "X-CC-Nonce: ${get_nonce}" \
  -H "X-CC-Signature: ${get_sig}")"

echo "GET /get/:uuid => HTTP ${get_http_code}"
cat /tmp/cookiecloud_get.out

echo

if [[ "${post_http_code}" != "200" || "${get_http_code}" != "200" ]]; then
  echo "Smoke test failed"
  exit 1
fi

echo "Smoke test passed"
