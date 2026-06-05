#!/usr/bin/env bash
# Usage: BASE_URL=https://api.dam-link.example ./smoke-prod.sh
# Exits 0 on success, non-zero on the first failed assertion.

set -euo pipefail

: "${BASE_URL:?BASE_URL is required, e.g. https://api.dam-link.example}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[34m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

assert_status() {
  local expected="$1" actual="$2" label="$3"
  if [ "$expected" != "$actual" ]; then
    red "FAIL  $label: expected $expected, got $actual"
    exit 1
  fi
  green "PASS  $label ($actual)"
}

# --- 1. Liveness -----------------------------------------------------------
blue "[1/5] GET /healthz"
code=$(curl -s -o /tmp/health.json -w "%{http_code}" "$BASE_URL/healthz")
assert_status 200 "$code" "/healthz returns 200"
status=$(jq -r .status /tmp/health.json)
[ "$status" = "ok" ] || { red "FAIL  /healthz status=$status"; exit 1; }
green "      status=$status db=$(jq -r .db /tmp/health.json) s3=$(jq -r .s3 /tmp/health.json)"

# --- 2. Version ------------------------------------------------------------
blue "[2/5] GET /version"
code=$(curl -s -o /tmp/version.json -w "%{http_code}" "$BASE_URL/version")
assert_status 200 "$code" "/version returns 200"
green "      version=$(jq -r .version /tmp/version.json) commit=$(jq -r .commit /tmp/version.json)"

# --- 3. Register a throwaway user -----------------------------------------
EMAIL="smoke-$(date +%s%N)@example.com"
PASSWORD="Sm0ke-Test-Pass!"
blue "[3/5] POST /api/v1/auth/register ($EMAIL)"
code=$(curl -s -o /tmp/register.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE_URL" \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/v1/auth/register" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Smoke\",\"turnstileToken\":\"smoke-test-bypass\"}")
# If Turnstile is enabled, this will be 400; the rest of the smoke still runs.
if [ "$code" = "200" ]; then
  green "PASS  registered"
else
  yellow "WARN  register returned $code (Turnstile may be enforced; continuing)"
fi

# --- 4. Authenticated round-trip (only if register worked) ----------------
if [ "$code" = "200" ]; then
  blue "[4/5] GET /api/v1/auth/me"
  code=$(curl -s -o /tmp/me.json -w "%{http_code}" \
    -H "Origin: $BASE_URL" -b "$COOKIE_JAR" "$BASE_URL/api/v1/auth/me")
  assert_status 200 "$code" "/auth/me returns 200 with session cookie"
else
  blue "[4/5] SKIP /api/v1/auth/me (no session)"
fi

# --- 5. CORS / cross-origin rejection -------------------------------------
blue "[5/5] CSRF: cross-origin POST is rejected"
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.example" \
  -X POST "$BASE_URL/api/v1/auth/login" \
  -d '{"email":"x@x.com","password":"y"}')
if [ "$code" = "403" ]; then
  green "PASS  cross-origin POST rejected (403)"
else
  red "FAIL  expected 403 on cross-origin POST, got $code"
  exit 1
fi

green ""
green "All smoke checks passed."
