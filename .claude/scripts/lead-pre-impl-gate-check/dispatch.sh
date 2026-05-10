#!/usr/bin/env bash
# Pre-impl gate hook (Sub-PR 2.7 of lead-impl-workflow Phase 2)
#
# Reads a Claude Code PreToolUse hook payload from stdin, classifies it, and
# blocks `mcp__agent-comms__send|notify` invocations that try to dispatch a
# 5-section instruction to a dev-bot without a recent auditor LGTM in the DB.
#
# 4-layer architecture (single-file shell, function-level isolation):
#   hookInput parser  → eventClassifier  → preImplGateChecker  → dbAdapter
#     (stdin JSON)       (5-section AND     (window query +       (DB I/O port,
#                         dev-bot mention)   LGTM count check)     psql impl)
#
# Exit codes (Claude Code hook spec):
#   0  pass (silent on stdout, optional WARN on stderr)
#   2  block — JSON `{"error_message": "...", "blocked_for": "...",
#               "lgtm_search_window": ...}` on stdout, human msg on stderr
#   1  internal error — caller treats as fail-open + stderr warning
#
# Env vars:
#   DATABASE_URL                  required (PostgreSQL DSN)
#   AGENT_COMMS_PRE_IMPL_WINDOW_SEC  optional, default 3600
#   AGENT_COMMS_PRE_IMPL_DISABLE  optional, "1" disables gate (emergency)

set -u
# NOTE: do NOT `set -e` here — we want to control exit codes deterministically.

DEV_BOT_AGENT_IDS=(
  adf-dev hotel-dev agent-com-dev agent-mem-dev nyusatsu-dev wbs-dev webb-dev
  haishin-dev xmarketing-dev org-build-dev upwork-dev
)

WINDOW_SEC="${AGENT_COMMS_PRE_IMPL_WINDOW_SEC:-3600}"

# ─────────────────────────────────────────────
# Layer 1: hookInput parser
# Reads stdin as JSON, exposes tool_name / content / mentions[] via globals.
# Failure mode: missing/empty content → caller treats as gate-not-applicable.
# ─────────────────────────────────────────────
hook_input_parse() {
  local payload
  payload="$(cat)"
  if [[ -z "${payload}" ]]; then
    HOOK_TOOL_NAME=""
    HOOK_CONTENT=""
    HOOK_MENTIONS_JSON="[]"
    return 0
  fi
  HOOK_TOOL_NAME="$(printf '%s' "${payload}" | jq -r '.tool_name // ""')"
  HOOK_CONTENT="$(printf '%s' "${payload}" | jq -r '.tool_input.content // ""')"
  HOOK_MENTIONS_JSON="$(printf '%s' "${payload}" | jq -c '.tool_input.mentions // []')"
}

# ─────────────────────────────────────────────
# Layer 2: eventClassifier
# Returns 0 (gate applies) or 1 (skip).
# ─────────────────────────────────────────────
event_is_5section() {
  local content="$1"
  # Require all 5 numbered headers (whitespace-tolerant, anchor on line start).
  printf '%s' "${content}" | grep -qE '^## *1\. *Interface contract' || return 1
  printf '%s' "${content}" | grep -qE '^## *2\. *Required behavior' || return 1
  printf '%s' "${content}" | grep -qE '^## *3\. *Forbidden behavior' || return 1
  printf '%s' "${content}" | grep -qE '^## *4\. *Test fixtures' || return 1
  printf '%s' "${content}" | grep -qE '^## *5\. *Open decisions' || return 1
  return 0
}

event_mentions_dev_bot() {
  local mentions_json="$1"
  local id
  for id in "${DEV_BOT_AGENT_IDS[@]}"; do
    if printf '%s' "${mentions_json}" | jq -e --arg id "${id}" 'index($id)' >/dev/null 2>&1; then
      MATCHED_DEV_BOT="${id}"
      return 0
    fi
  done
  MATCHED_DEV_BOT=""
  return 1
}

# ─────────────────────────────────────────────
# Layer 3: preImplGateChecker
# Returns 0 (LGTM found, pass) or 1 (no LGTM, block).
# ─────────────────────────────────────────────
pre_impl_gate_check() {
  local count
  count="$(db_query_recent_auditor_lgtm "${WINDOW_SEC}" "arc")" || return 2
  [[ "${count}" -gt 0 ]]
}

# ─────────────────────────────────────────────
# Layer 4: dbAdapter (port — psql implementation, replaceable per §5)
# query_recent_auditor_lgtm(window_seconds, sender) -> int >= 0
# Failure (DB connect / SQL error) → exit 1 (caller fail-open).
# ─────────────────────────────────────────────
db_query_recent_auditor_lgtm() {
  local window="$1"
  local sender="$2"
  if [[ -z "${DATABASE_URL:-}" ]]; then
    return 1
  fi
  local sql
  sql="SELECT COUNT(*) FROM agent_messages
       WHERE author_id = '${sender}'
         AND 'auditor' = ANY(input_mentions)
         AND created_at >= NOW() - INTERVAL '${window} seconds'
         AND content ~ 'Pre-impl gate.*LGTM|Pre-impl gate.*PASS';"
  local out
  out="$(psql "${DATABASE_URL}" -At -c "${sql}" 2>/dev/null)" || return 1
  [[ -n "${out}" ]] || return 1
  printf '%s' "${out}"
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
main() {
  if [[ "${AGENT_COMMS_PRE_IMPL_DISABLE:-0}" == "1" ]]; then
    hook_input_parse
    local matched=""
    if event_mentions_dev_bot "${HOOK_MENTIONS_JSON}"; then matched="${MATCHED_DEV_BOT}"; fi
    printf 'WARN: AGENT_COMMS_PRE_IMPL_DISABLE=1 設定で Pre-impl gate 全 disable、emergency bypass。dev-bot mention=%s\n' "${matched:-none}" >&2
    return 0
  fi

  hook_input_parse

  if [[ -z "${HOOK_CONTENT}" ]]; then
    return 0
  fi
  if ! event_is_5section "${HOOK_CONTENT}"; then
    return 0
  fi
  if ! event_mentions_dev_bot "${HOOK_MENTIONS_JSON}"; then
    return 0
  fi

  pre_impl_gate_check
  local gate_rc=$?
  if [[ "${gate_rc}" -eq 0 ]]; then
    return 0
  fi
  if [[ "${gate_rc}" -eq 2 ]]; then
    # DB error → fail-open + warn
    printf 'WARN: Pre-impl gate DB connect failed (DATABASE_URL empty)、fail-open で続行。発火 dev-bot mention=%s\n' "${MATCHED_DEV_BOT}" >&2
    return 0
  fi
  # gate_rc == 1: count = 0, no LGTM in window → block.
  printf '{"error_message": "Pre-impl gate auditor LGTM が見つかりません", "blocked_for": "%s", "lgtm_search_window": %s}\n' \
    "${MATCHED_DEV_BOT}" "${WINDOW_SEC}"
  printf 'Pre-impl gate auditor LGTM が見つかりません: dev-bot mention=%s、5-section header 全 5 個検出、過去 %s 秒以内に arc → auditor の Pre-impl gate LGTM/PASS message なし\n' \
    "${MATCHED_DEV_BOT}" "${WINDOW_SEC}" >&2
  return 2
}

main "$@"
exit_code=$?
exit "${exit_code}"
