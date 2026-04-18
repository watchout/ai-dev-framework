#!/bin/bash
# Framework Mode Check — sourced by all hooks before execution.
#
# Checks if the repo has `framework-managed` topic via GitHub API.
# If topic is absent, hooks are passthrough no-ops (exit 0 immediately).
# If topic is present, hooks enforce gates.
#
# Part of #63 (framework mode state machine).
# Spec: 09_ENFORCEMENT §1.
#
# Usage (in hook scripts):
#   source "$CLAUDE_PROJECT_DIR/.claude/hooks/framework-mode-check.sh"
#   # If we reach here, framework is active — proceed with checks
#
# Environment:
#   FRAMEWORK_BYPASS — CEO secret token. If set, skip mode check (bypass).
#   CLAUDE_PROJECT_DIR — project root directory.

project_dir="${CLAUDE_PROJECT_DIR:-.}"

# Bypass: if FRAMEWORK_BYPASS token is set, skip mode check entirely
if [ -n "${FRAMEWORK_BYPASS:-}" ]; then
  # Bypass is allowed but logged (09_ENFORCEMENT §2 handles audit logging)
  return 0 2>/dev/null || exit 0
fi

# Check framework-managed topic via gh API (5s timeout)
# If gh is unavailable or errors, default to active (fail-safe)
framework_active=$(node -e "
  const { execSync } = require('child_process');
  try {
    const out = execSync('gh api repos/{owner}/{repo} --jq \".topics\"', {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const topics = JSON.parse(out);
    console.log(topics.includes('framework-managed') ? 'active' : 'inactive');
  } catch {
    // gh unavailable or error — default to active (fail-safe)
    console.log('active');
  }
" 2>/dev/null)

if [ "$framework_active" = "inactive" ]; then
  # Framework not active — hooks are passthrough no-ops
  return 0 2>/dev/null || exit 0
fi

# Framework is active — continue with hook enforcement
