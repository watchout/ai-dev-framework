#!/bin/bash
# ================================================================
# Framework Distribution Script
# ADR-009 (Smart Blocking) + ADR-010 (Test 3-Layer) + ADR-012 (Escalation)
#
# Usage: bash bin/distribute.sh [--dry-run]
# ================================================================

set -euo pipefail

FRAMEWORK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE ==="
fi

# ─── Source files ───
GATE_HOOK_SRC="$FRAMEWORK_ROOT/src/cli/lib/hooks-installer.ts"
SKILL_SRC="$FRAMEWORK_ROOT/templates/skills/implement/SKILL.md"
ESCALATION_SRC="$HOME/.claude/rules/escalation-policy.md"

# ─── Target projects ───
PROJECTS=(
  "$HOME/Developer/hotel-kanri"
  "$HOME/Developer/haishin-puls-hub"
  "$HOME/Developer/wbs"
  "$HOME/Developer/nyusatsu"
  "$HOME/Developer/x-marketing-engine"
  "$HOME/Developer/upwork-automation"
  "$HOME/Developer/iyasaka"
  "$HOME/.openclaw"
)

# ─── Extract pre-code-gate.sh from hooks-installer.ts ───
# We generate the script by running the framework's own installer
GATE_HOOK_GENERATED="/tmp/pre-code-gate-distribute.sh"
node -e "
  const fs = require('fs');
  const src = fs.readFileSync('$GATE_HOOK_SRC', 'utf-8');
  // Extract CLAUDE_HOOK_SCRIPT content between backticks
  const match = src.match(/const CLAUDE_HOOK_SCRIPT = \x60([\\s\\S]*?)\x60;/);
  if (!match) { console.error('Failed to extract hook script'); process.exit(1); }
  // Unescape the template literal
  let script = match[1]
    .replace(/\\\\\\\\\`/g, '\`')
    .replace(/\\\\\$/g, '\$');
  fs.writeFileSync('$GATE_HOOK_GENERATED', script);
  console.log('Generated pre-code-gate.sh (' + script.split('\\n').length + ' lines)');
"

CHANGES=0
SKIPPED=0

for PROJECT in "${PROJECTS[@]}"; do
  PROJECT_NAME=$(basename "$PROJECT")
  echo ""
  echo "━━━ $PROJECT_NAME ━━━"

  if [ ! -d "$PROJECT" ]; then
    echo "  SKIP: directory not found"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # ── 1. pre-code-gate.sh (ADR-009: Smart Blocking) ──
  GATE_DEST="$PROJECT/.claude/hooks/pre-code-gate.sh"
  if [ -f "$GATE_DEST" ]; then
    if $DRY_RUN; then
      echo "  [DRY] REPLACE: .claude/hooks/pre-code-gate.sh"
    else
      mkdir -p "$(dirname "$GATE_DEST")"
      cp "$GATE_HOOK_GENERATED" "$GATE_DEST"
      chmod +x "$GATE_DEST"
      echo "  REPLACED: .claude/hooks/pre-code-gate.sh"
    fi
    CHANGES=$((CHANGES + 1))
  else
    if $DRY_RUN; then
      echo "  [DRY] CREATE: .claude/hooks/pre-code-gate.sh"
    else
      mkdir -p "$(dirname "$GATE_DEST")"
      cp "$GATE_HOOK_GENERATED" "$GATE_DEST"
      chmod +x "$GATE_DEST"
      echo "  CREATED: .claude/hooks/pre-code-gate.sh"
    fi
    CHANGES=$((CHANGES + 1))
  fi

  # ── 2. escalation-policy.md (ADR-012) ──
  ESC_DEST="$PROJECT/.claude/rules/escalation-policy.md"
  if [ -f "$ESC_DEST" ]; then
    # Check if content differs
    if diff -q "$ESCALATION_SRC" "$ESC_DEST" > /dev/null 2>&1; then
      echo "  SKIP: .claude/rules/escalation-policy.md (identical)"
    else
      if $DRY_RUN; then
        echo "  [DRY] UPDATE: .claude/rules/escalation-policy.md"
      else
        cp "$ESCALATION_SRC" "$ESC_DEST"
        echo "  UPDATED: .claude/rules/escalation-policy.md"
      fi
      CHANGES=$((CHANGES + 1))
    fi
  else
    if $DRY_RUN; then
      echo "  [DRY] CREATE: .claude/rules/escalation-policy.md"
    else
      mkdir -p "$(dirname "$ESC_DEST")"
      cp "$ESCALATION_SRC" "$ESC_DEST"
      echo "  CREATED: .claude/rules/escalation-policy.md"
    fi
    CHANGES=$((CHANGES + 1))
  fi

  # ── 3. implement/SKILL.md (ADR-010: L2/L3 test prompts) ──
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
    echo "  SKIP: .claude/skills/implement/SKILL.md (not present — project may not use skills)"
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
