#!/usr/bin/env bash
# End-to-end smoke test for the Chronos API.
# Exercises auth, jobs CRUD, manual trigger, retries, notifications.
#
# Usage:
#   ./scripts/smoke.sh                  # against http://localhost:3000
#   BASE=http://chronos.local scripts/smoke.sh
#
# Requires: bun, curl, a running Chronos backend on $BASE.

set -euo pipefail

BASE=${BASE:-http://localhost:3000}
COOKIES=$(mktemp -t chronos-smoke-cookies.XXXXXX)
trap 'rm -f "$COOKIES"' EXIT

red=$'\033[0;31m'
grn=$'\033[0;32m'
ylw=$'\033[0;33m'
blu=$'\033[1;34m'
gry=$'\033[2;37m'
rst=$'\033[0m'

step()  { printf '\n%s▸%s %s\n' "$blu" "$rst" "$*"; }
ok()    { printf '  %s✓%s %s\n' "$grn" "$rst" "$*"; }
warn()  { printf '  %s!%s %s\n' "$ylw" "$rst" "$*"; }
fail()  { printf '  %s✗%s %s\n' "$red" "$rst" "$*"; exit 1; }

assert_status() {
  local want=$1 got=$2 ctx=$3
  [[ "$got" == "$want" ]] && ok "$ctx ${gry}→ $got$rst" || fail "$ctx ${gry}→ expected $want, got $got$rst"
}

# Bun-based helpers (portable JSON + ISO timestamps).
jget()    { bun -e "console.log(((await Bun.stdin.json())?.$1) ?? '')"; }
iso_in()  { bun -e "console.log(new Date(Date.now()+$1).toISOString())"; }

# ---- 1. sanity ---------------------------------------------------------------
step "Sanity"
assert_status 200 "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/hello")" "GET /hello"
assert_status 200 "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/health")" "GET /health  (DB ping)"

# ---- 2. signup ---------------------------------------------------------------
step "Sign up a fresh user"
EMAIL="smoke+$(date +%s)@chronos.test"
PASS="testtest123"
SIGNUP=$(curl -sS -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" -c "$COOKIES" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Smoke Test\"}")
USER_ID=$(printf '%s' "$SIGNUP" | jget 'user?.id')
[[ -n "$USER_ID" ]] && ok "user.id=${gry}$USER_ID$rst" || fail "signup failed: $SIGNUP"

# ---- 3. authed /api/me -------------------------------------------------------
step "Authed identity"
assert_status 200 "$(curl -sS -o /dev/null -w '%{http_code}' -b "$COOKIES" "$BASE/api/me")" "GET /api/me"

# ---- 4. webhook job (one-time, 3s out) --------------------------------------
step "Create one-time webhook job (fires in 3s)"
RUNAT=$(iso_in 3000)
JSON_W=$(cat <<EOF
{
  "name": "smoke webhook",
  "payload": {"kind":"webhook","url":"https://httpbin.org/get","method":"GET"},
  "schedule": {"runAt":"$RUNAT"}
}
EOF
)
WJ=$(curl -sS -X POST "$BASE/api/jobs" -H "Content-Type: application/json" -b "$COOKIES" -d "$JSON_W")
WID=$(printf '%s' "$WJ" | jget 'id')
[[ -n "$WID" ]] && ok "webhook job ${gry}$WID$rst" || fail "create webhook failed: $WJ"

# ---- 5. failing bash job (for retry + notification) -------------------------
step "Create failing bash job (3 attempts, ~200ms backoff)"
FAR=$(iso_in 3600000)
JSON_B=$(cat <<EOF
{
  "name": "smoke fail",
  "payload": {"kind":"bash","script":"echo trying >&2; exit 1"},
  "schedule": {"runAt":"$FAR"},
  "retryPolicy": {"maxAttempts":3,"baseMs":200,"maxMs":1000,"jitter":false}
}
EOF
)
FJ=$(curl -sS -X POST "$BASE/api/jobs" -H "Content-Type: application/json" -b "$COOKIES" -d "$JSON_B")
FID=$(printf '%s' "$FJ" | jget 'id')
[[ -n "$FID" ]] && ok "failing job ${gry}$FID$rst" || fail "create fail job failed: $FJ"

# ---- 6. manual trigger -------------------------------------------------------
step "Manually trigger the failing job"
TRIG=$(curl -sS -X POST -b "$COOKIES" "$BASE/api/jobs/$FID/run")
RID=$(printf '%s' "$TRIG" | jget 'runId')
[[ -n "$RID" ]] && ok "run.id=${gry}$RID$rst" || fail "trigger failed: $TRIG"

# ---- 7. wait for ticker + workflow completion --------------------------------
step "Wait 6s for ticker + workflows"
sleep 6

# ---- 8. webhook run succeeded ------------------------------------------------
step "Webhook job ran"
WSTATUS=$(curl -sS -b "$COOKIES" "$BASE/api/jobs/$WID/runs" | jget 'runs?.[0]?.status')
[[ "$WSTATUS" == "succeeded" ]] && ok "webhook → ${grn}succeeded$rst" || fail "webhook → $WSTATUS"

# ---- 9. failing job exhausted retries ---------------------------------------
step "Failing job exhausted retries"
FSTATUS=$(curl -sS -b "$COOKIES" "$BASE/api/jobs/$FID/runs" | jget 'runs?.[0]?.status')
[[ "$FSTATUS" == "failed" ]] && ok "bash → ${red}failed$rst (expected)" || fail "bash → $FSTATUS"

# ---- 10. notification was emitted -------------------------------------------
step "Failure produced a notification"
NCOUNT=$(curl -sS -b "$COOKIES" "$BASE/api/notifications/unseen-count" | jget 'count')
[[ "$NCOUNT" -ge 1 ]] && ok "$NCOUNT unseen" || fail "expected ≥1 notification, got $NCOUNT"

# ---- 11. list + paginate jobs -----------------------------------------------
step "List jobs"
JCOUNT=$(curl -sS -b "$COOKIES" "$BASE/api/jobs?limit=10" | jget 'jobs?.length')
[[ "$JCOUNT" -ge 2 ]] && ok "$JCOUNT jobs visible" || fail "expected ≥2, got $JCOUNT"

# ---- 12. patch a job --------------------------------------------------------
step "PATCH webhook job (rename + pause)"
assert_status 200 "$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  "$BASE/api/jobs/$WID" -H "Content-Type: application/json" -b "$COOKIES" \
  -d '{"name":"renamed","status":"paused"}')" "PATCH /api/jobs/$WID"

# ---- 13. mark notification seen ---------------------------------------------
step "Mark first unseen notification as seen"
NID=$(curl -sS -b "$COOKIES" "$BASE/api/notifications?unseenOnly=true" | jget 'notifications?.[0]?.id')
if [[ -n "$NID" ]]; then
  assert_status 204 "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -b "$COOKIES" \
    "$BASE/api/notifications/$NID/seen")" "POST /api/notifications/$NID/seen"
else
  warn "no unseen notifications to mark"
fi

# ---- 14. delete cleanup -----------------------------------------------------
step "Cleanup: delete created jobs"
assert_status 204 "$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -b "$COOKIES" \
  "$BASE/api/jobs/$WID")" "DELETE webhook"
assert_status 204 "$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -b "$COOKIES" \
  "$BASE/api/jobs/$FID")" "DELETE fail"

# ---- 15. authz: deleted job returns 404 -------------------------------------
step "GET deleted job (expect 404)"
assert_status 404 "$(curl -sS -o /dev/null -w '%{http_code}' -b "$COOKIES" \
  "$BASE/api/jobs/$WID")" "GET /api/jobs/$WID"

# ---- 16. authz: unauthed POST returns 401 -----------------------------------
step "Unauthenticated POST (expect 401)"
assert_status 401 "$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" -d '{}' "$BASE/api/jobs")" "POST /api/jobs (no cookie)"

# ---- 17. sign out -----------------------------------------------------------
step "Sign out"
assert_status 200 "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -b "$COOKIES" \
  "$BASE/api/auth/sign-out")" "POST /api/auth/sign-out"

# ---- summary ----------------------------------------------------------------
echo
echo "${grn}══════════════════════════════════════════${rst}"
echo "${grn}  All checks passed.${rst}"
echo "${grn}══════════════════════════════════════════${rst}"
