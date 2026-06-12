#!/bin/bash
# ================================================================
# Framework Distribution Script
# ADR-009 (Smart Blocking) + ADR-010 (Test 3-Layer) + ADR-012 (Escalation)
#
# Usage:
#   bash bin/distribute.sh [options]
#
# Options:
#   --dry-run          Show what would change without modifying files
#   --config <file>    JSON config file with target project paths
#   --projects <p,...> Comma-separated project paths (overrides config)
#   --framework-root   Override the framework root directory
#
# Config file format (JSON):
#   { "projects": ["/path/to/project1", "/path/to/project2"] }
#
# Environment variables:
#   SHIRUBE_PROJECTS   Colon-separated project paths (lowest priority)
# ================================================================

set -euo pipefail

FRAMEWORK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
CONFIG_FILE=""
PROJECTS_ARG=""

# ─── Parse arguments ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --config)
      CONFIG_FILE="${2:?--config requires a file path}"
      shift 2
      ;;
    --projects)
      PROJECTS_ARG="${2:?--projects requires a value}"
      shift 2
      ;;
    --framework-root)
      FRAMEWORK_ROOT="${2:?--framework-root requires a path}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if $DRY_RUN; then
  echo "=== DRY RUN MODE ==="
fi

# ─── Resolve project list (priority: --projects > --config > env var > defaults) ─────
resolve_projects() {
  if [ -n "$PROJECTS_ARG" ]; then
    # Comma-separated from --projects flag
    IFS=',' read -ra RESOLVED_PROJECTS <<< "$PROJECTS_ARG"
    return
  fi

  if [ -n "$CONFIG_FILE" ]; then
    if [ ! -f "$CONFIG_FILE" ]; then
      echo "Error: config file not found: $CONFIG_FILE" >&2
      exit 2
    fi
    mapfile -t RESOLVED_PROJECTS < <(python3 -c "
import json, sys
data = json.load(open('$CONFIG_FILE'))
for p in data.get('projects', []):
    print(p)
")
    return
  fi

  if [ -n "${SHIRUBE_PROJECTS:-}" ]; then
    IFS=':' read -ra RESOLVED_PROJECTS <<< "$SHIRUBE_PROJECTS"
    return
  fi

  # Fallback: read from ~/.shirube/distribute-config.json if it exists
  local default_config="$HOME/.shirube/distribute-config.json"
  if [ -f "$default_config" ]; then
    mapfile -t RESOLVED_PROJECTS < <(python3 -c "
import json
data = json.load(open('$default_config'))
for p in data.get('projects', []):
    print(p)
")
    return
  fi

  # Last resort defaults (internal paths)
  RESOLVED_PROJECTS=(
    "$HOME/Developer/hotel-kanri"
    "$HOME/Developer/haishin-puls-hub"
    "$HOME/Developer/wbs"
    "$HOME/Developer/nyusatsu"
    "$HOME/Developer/x-marketing-engine"
    "$HOME/Developer/upwork-automation"
    "$HOME/Developer/iyasaka"
    "$HOME/.openclaw"
  )
}

declare -a RESOLVED_PROJECTS
resolve_projects

# ─── Source files ───────────────────────────────────────────────────────────
GATE_HOOK_SRC="$FRAMEWORK_ROOT/src/cli/lib/hooks-installer.ts"
SKILL_SRC="$FRAMEWORK_ROOT/templates/skills/implement/SKILL.md"
ESCALATION_SRC="$HOME/.claude/rules/escalation-policy.md"

# ─── Extract pre-code-gate.sh from hooks-installer.ts ─────────────────────
GATE_HOOK_GENERATED="/tmp/pre-code-gate-distribute-$$.sh"
node -e "
  const fs = require('fs');
  const src = fs.readFileSync('$GATE_HOOK_SRC', 'utf-8');
  const match = src.match(/const CLAUDE_HOOK_SCRIPT = \x60([\s\S]*?)\x60;/);
  if (!match) { console.error('Failed to extract hook script'); process.exit(1); }
  let script = match[1]
    .replace(/\\\\\\\\\x60/g, '\x60')
    .replace(/\\\\\$/g, '\$');
  fs.writeFileSync('$GATE_HOOK_GENERATED', script);
  console.log('Generated pre-code-gate.sh (' + script.split('\n').length + ' lines)');
"

CHANGES=0
SKIPPED=0

for PROJECT in "${RESOLVED_PROJECTS[@]}"; do
  PROJECT_NAME=$(basename "$PROJECT")
  echo ""
  echo "━━━ $PROJECT_NAME ━━━"

  if [ ! -d "$PROJECT" ]; then
    echo "  SKIP: directory not found"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # ── 1. pre-code-gate.sh (ADR-009: Smart Blocking) ──────────────────────
  GATE_DEST="$PROJECT/.claude/hooks/pre-code-gate.sh"
  if $DRY_RUN; then
    echo "  [DRY] ${FILE_EXISTS:-REPLACE/CREATE}: .claude/hooks/pre-code-gate.sh"
  else
    mkdir -p "$(dirname "$GATE_DEST")"
    cp "$GATE_HOOK_GENERATED" "$GATE_DEST"
    chmod +x "$GATE_DEST"
    echo "  ${FILE_EXISTS:+REPLACED: }${FILE_EXISTS:-CREATED: }.claude/hooks/pre-code-gate.sh"
  fi
  CHANGES=$((CHANGES + 1))

  # ── 2. escalation-policy.md (ADR-012) ──────────────────────────────────
  if [ -f "$ESCALATION_SRC" ]; then
    ESC_DEST="$PROJECT/.claude/rules/escalation-policy.md"
    if [ -f "$ESC_DEST" ] && diff -q "$ESCALATION_SRC" "$ESC_DEST" > /dev/null 2>&1; then
      echo "  SKIP: .claude/rules/escalation-policy.md (identical)"
    else
      if $DRY_RUN; then
        echo "  [DRY] UPDATE: .claude/rules/escalation-policy.md"
      else
        mkdir -p "$(dirname "$ESC_DEST")"
        cp "$ESCALATION_SRC" "$ESC_DEST"
        echo "  UPDATED: .claude/rules/escalation-policy.md"
      fi
      CHANGES=$((CHANGES + 1))
    fi
  fi

  # ── 3. implement/SKILL.md (ADR-010: L2/L3 test prompts) ────────────────
  SKILL_DEST="$PROJECT/.claude/skills/implement/SKILL.md"
  if [ -f "$SKILL_DEST" ]; then
    if $DRY_RUN; then
      echo "  [DRY] REPLACE: .claude/skills/implement/SKILL.md"
    else
      cp "$SKILL_SRC" "$SKILL_DEST"
      echo "  REPLACED: .claude/skills/implement/SKILL.md"
    fi
    CHANGES=$((CHANGES + 1))
  else
    echo "  SKIP: .claude/skills/implement/SKILL.md (not present)"
    SKIPPED=$((SKIPPED + 1))
  fi
done

# Cleanup
rm -f "$GATE_HOOK_GENERATED"

echo ""
echo "━━━ Summary ━━━"
echo "  Changes: $CHANGES"
echo "  Skipped: $SKIPPED"
if $DRY_RUN; then
  echo "  (dry run — no files were modified)"
fi
echo ""
