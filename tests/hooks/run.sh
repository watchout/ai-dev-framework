#!/usr/bin/env bash
# Pre-impl gate hook test runner (Sub-PR 2.7).
#
# Drives `.claude/scripts/lead-pre-impl-gate-check/dispatch.sh` against the
# fixtures + DB seeds in this directory, asserts each test case's exit code
# and key stderr fragments, and reports T1-T9 status.
#
# Requires: bash, jq, psql, DATABASE_URL.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="${ROOT}/.claude/scripts/lead-pre-impl-gate-check/dispatch.sh"
FIXTURES="${ROOT}/tests/hooks/fixtures"
SEEDS="${ROOT}/tests/hooks/seeds"
MIGRATIONS="${ROOT}/tests/hooks/migrations"

PASS_COUNT=0
FAIL_COUNT=0
FAILED_TESTS=()

log() { printf '[test:hooks] %s\n' "$*"; }
fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILED_TESTS+=("$1")
  log "FAIL: $1 — $2"
}
ok() {
  PASS_COUNT=$((PASS_COUNT + 1))
  log "PASS: $1"
}

ensure_schema() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "DATABASE_URL not set — schema bootstrap skipped (T6 still tested)"
    return 0
  fi
  for m in "${MIGRATIONS}"/*.sql; do
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${m}" >/dev/null
  done
}

apply_seed() {
  local seed="$1"
  if [[ -z "${DATABASE_URL:-}" ]]; then return 0; fi
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${SEEDS}/${seed}" >/dev/null
}

run_hook() {
  local fixture="$1"
  local stdout_file="$2"
  local stderr_file="$3"
  set +e
  "${HOOK}" <"${FIXTURES}/${fixture}" >"${stdout_file}" 2>"${stderr_file}"
  local rc=$?
  set -e 2>/dev/null || true
  echo "${rc}"
}

assert_eq() {
  local name="$1" expected="$2" actual="$3" detail="$4"
  if [[ "${expected}" == "${actual}" ]]; then
    return 0
  fi
  fail "${name}" "expected=${expected} actual=${actual} ${detail}"
  return 1
}

mkdir -p /tmp/test-hooks
ensure_schema

# T1: clean + 5section-with-dev-bot-no-pre-impl → exit 2 + JSON error_message
apply_seed clean.sql
rc=$(run_hook 5section-with-dev-bot-no-pre-impl.json /tmp/test-hooks/t1.out /tmp/test-hooks/t1.err)
if assert_eq "T1" 2 "${rc}" "(see /tmp/test-hooks/t1.{out,err})"; then
  if grep -q 'error_message' /tmp/test-hooks/t1.out && grep -q 'auditor LGTM が見つかりません' /tmp/test-hooks/t1.err; then
    ok "T1"
  else
    fail "T1" "stdout/stderr content mismatch"
  fi
fi

# T2: auditor-lgtm-recent + 5section-with-dev-bot → exit 0 silent
apply_seed clean.sql
apply_seed auditor-lgtm-recent.sql
rc=$(run_hook 5section-with-dev-bot-with-pre-impl-LGTM.json /tmp/test-hooks/t2.out /tmp/test-hooks/t2.err)
if assert_eq "T2" 0 "${rc}" ""; then
  if [[ ! -s /tmp/test-hooks/t2.out ]]; then ok "T2"; else fail "T2" "stdout not empty"; fi
fi

# T3: auditor-lgtm-recent + non-5section → exit 0 (gate not applicable)
apply_seed clean.sql
apply_seed auditor-lgtm-recent.sql
rc=$(run_hook non-5section-content.json /tmp/test-hooks/t3.out /tmp/test-hooks/t3.err)
assert_eq "T3" 0 "${rc}" "" && ok "T3"

# T4: auditor-lgtm-recent + 5section-no-dev-bot → exit 0 (no dev-bot mention)
apply_seed clean.sql
apply_seed auditor-lgtm-recent.sql
rc=$(run_hook 5section-no-dev-bot-mention.json /tmp/test-hooks/t4.out /tmp/test-hooks/t4.err)
assert_eq "T4" 0 "${rc}" "" && ok "T4"

# T5: stale-only LGTM + 5section-with-dev-bot → exit 2 (window 外で stale 不採用)
apply_seed clean.sql
apply_seed auditor-lgtm-stale.sql
rc=$(run_hook 5section-with-dev-bot-no-pre-impl.json /tmp/test-hooks/t5.out /tmp/test-hooks/t5.err)
if assert_eq "T5" 2 "${rc}" ""; then
  if grep -q 'auditor LGTM が見つかりません' /tmp/test-hooks/t5.err; then ok "T5"; else fail "T5" "stderr wording mismatch"; fi
fi

# T6: DATABASE_URL empty → fail-open exit 0 + WARN stderr
saved_db_url="${DATABASE_URL:-}"
(
  unset DATABASE_URL
  "${HOOK}" <"${FIXTURES}/5section-with-dev-bot-no-pre-impl.json" \
    >/tmp/test-hooks/t6.out 2>/tmp/test-hooks/t6.err
)
rc=$?
export DATABASE_URL="${saved_db_url}"
if assert_eq "T6" 0 "${rc}" "(fail-open)"; then
  if grep -q 'WARN: Pre-impl gate DB connect failed' /tmp/test-hooks/t6.err; then ok "T6"; else fail "T6" "WARN stderr missing"; fi
fi

# T7: AGENT_COMMS_PRE_IMPL_DISABLE=1 → exit 0 + WARN stderr
(
  export AGENT_COMMS_PRE_IMPL_DISABLE=1
  "${HOOK}" <"${FIXTURES}/5section-with-dev-bot-no-pre-impl.json" \
    >/tmp/test-hooks/t7.out 2>/tmp/test-hooks/t7.err
)
rc=$?
if assert_eq "T7" 0 "${rc}" ""; then
  if grep -q 'AGENT_COMMS_PRE_IMPL_DISABLE=1' /tmp/test-hooks/t7.err; then ok "T7"; else fail "T7" "disable WARN missing"; fi
fi

# T8: settings.json schema check (the hook script itself does not modify; ARC
# applies the home entry separately. Here we sanity-check that the script is
# present and executable and that fixtures parse as JSON via jq.)
if [[ -x "${HOOK}" ]] && jq -e . "${FIXTURES}/5section-with-dev-bot-no-pre-impl.json" >/dev/null; then
  ok "T8"
else
  fail "T8" "hook not executable or fixture JSON invalid"
fi

# T9: governance-flow.md repo derived contains the Pre-impl gate enforcement section.
if grep -q "Pre-impl gate skip 禁止" "${ROOT}/.claude/rules/governance-flow.md" 2>/dev/null \
   && grep -q "Sub-PR 2.7" "${ROOT}/.claude/rules/governance-flow.md" 2>/dev/null; then
  ok "T9"
else
  fail "T9" "governance-flow.md missing Sub-PR 2.7 enforcement section"
fi

log "summary: pass=${PASS_COUNT} fail=${FAIL_COUNT}"
if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  log "failed: ${FAILED_TESTS[*]}"
  exit 1
fi
exit 0
