#!/usr/bin/env bash
# STE-31 — check a deployed Sterun backend from the outside.
#
# The ticket's done-criterion is that a third party can open the health check
# over TLS and see it answer. This is that check, plus the things that would
# still be wrong if only the health check passed: TLS actually terminating, the
# database reachable, the right contracts configured, and the sensitive
# endpoints still refusing unauthenticated callers.
#
#   ./deploy/verify-deployment.sh https://api.sterun.example
#
# Needs curl and jq. Runs entirely from outside — no SSH, no secrets.
set -uo pipefail

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "usage: $0 https://api.example.com" >&2
  exit 2
fi
BASE="${BASE%/}"

pass=0
fail=0
ok()   { printf '  ✓ %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  ✗ %s\n' "$1"; fail=$((fail + 1)); }
step() { printf '\n▸ %s\n' "$1"; }

step "TLS"
if [[ "$BASE" == https://* ]]; then
  # --proto '=https' refuses a plaintext redirect: a URL that quietly downgrades
  # would pass every check below while sending wallet signatures in the clear.
  if curl -sSf --proto '=https' --max-time 15 "$BASE/health" >/dev/null 2>&1; then
    ok "serves over HTTPS with a certificate curl trusts"
  else
    bad "HTTPS request failed — certificate, DNS, or the service is down"
  fi
  if curl -sI --max-time 15 "$BASE/health" 2>/dev/null | grep -qi '^strict-transport-security'; then
    ok "sends HSTS"
  else
    bad "no Strict-Transport-Security header"
  fi
else
  bad "not an https:// URL — STE-31 requires TLS"
fi

step "Liveness and readiness"
health="$(curl -sS --max-time 15 "$BASE/health" 2>/dev/null || true)"
if jq -e '.status == "ok"' <<<"$health" >/dev/null 2>&1; then
  ok "/health -> $(jq -c . <<<"$health")"
else
  bad "/health did not answer {\"status\":\"ok\"}: ${health:-<no response>}"
fi

ready_code="$(curl -s -o /tmp/sterun-ready.$$ -w '%{http_code}' --max-time 15 "$BASE/ready" || echo 000)"
ready="$(cat /tmp/sterun-ready.$$ 2>/dev/null || true)"; rm -f /tmp/sterun-ready.$$
if [[ "$ready_code" == "200" ]] && jq -e '.checks.database == "ok"' <<<"$ready" >/dev/null 2>&1; then
  ok "/ready -> database reachable"
else
  bad "/ready returned $ready_code: ${ready:-<no response>} (the API is up but its database is not)"
fi

step "Pointing at the right chain"
config="$(curl -sS --max-time 15 "$BASE/config" 2>/dev/null || true)"
if jq -e '.addresses.eventRegistry and .addresses.raceRecord' <<<"$config" >/dev/null 2>&1; then
  ok "EventRegistry $(jq -r .addresses.eventRegistry <<<"$config")"
  ok "RaceRecord    $(jq -r .addresses.raceRecord <<<"$config")"
  ok "network       $(jq -r .network.name <<<"$config")"
else
  bad "/config did not report contract addresses"
fi
for capability in vault indexer results; do
  if jq -e ".${capability}.enabled == true" <<<"$config" >/dev/null 2>&1; then
    ok "$capability mounted"
  else
    bad "$capability NOT mounted — check DATABASE_URL / PII_KEYS on the host"
  fi
done

step "The sensitive endpoints still say no"
# Each of these must refuse an unauthenticated caller. A deployment that got
# this wrong would serve identity-adjacent data to the internet, and it would
# look completely healthy from every check above.
for path in "/events/0/roster" "/participants/00000000-0000-0000-0000-000000000000"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$path" || echo 000)"
  if [[ "$code" == "401" ]]; then
    ok "GET $path -> 401 without a signature"
  else
    bad "GET $path -> $code, expected 401"
  fi
done
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST -H 'content-type: text/csv' \
  --data-binary 'bib_no,finish_time
1,3161' "$BASE/events/0/results/preview" || echo 000)"
if [[ "$code" == "401" ]]; then
  ok "POST /events/0/results/preview -> 401 without a signature"
else
  bad "POST /events/0/results/preview -> $code, expected 401"
fi

step "Documentation"
if curl -sSf --max-time 15 "$BASE/openapi.json" 2>/dev/null | jq -e '.openapi' >/dev/null 2>&1; then
  ok "/openapi.json describes the API"
else
  bad "/openapi.json is not served"
fi

printf '\n%s\n' "----------------------------------------"
printf '%d passed, %d failed — %s\n' "$pass" "$fail" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ "$fail" -eq 0 ]] || exit 1
