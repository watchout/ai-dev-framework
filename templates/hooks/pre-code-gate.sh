#!/bin/bash
# Pre-Code Gate hook for Claude Code (PreToolUse)
# Reads .framework/gates.json and blocks source code edits when gates have not passed.
# Exit 2 = deny (Claude Code convention), Exit 0 = allow

input=$(cat)
tool=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_name||'')}catch{console.log('')}})")

project_dir="${CLAUDE_PROJECT_DIR:-.}"

# Extract file path based on tool type
file_path=""
if [ "$tool" = "Edit" ] || [ "$tool" = "Write" ]; then
  file_path=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_input.file_path||'')}catch{console.log('')}})")
fi

# No file path = not a file edit, allow
if [ -z "$file_path" ]; then
  exit 0
fi

# Make path relative to project dir
rel_path="${file_path#$project_dir/}"

# Check if path is a protected source code path
case "$rel_path" in
  src/*|app/*|server/*|lib/*|components/*|pages/*|composables/*|utils/*|stores/*|plugins/*)
    ;;
  *)
    # Not a source code path — allow
    exit 0
    ;;
esac

# ─── Skill Warning (soft layer) ───
# Check if a skill has been activated recently (within 6 hours).
# If not, print a warning to stderr. Does NOT block (exit 0 continues).
skill_file="$project_dir/.framework/active-skill.json"
skill_active=false
if [ -f "$skill_file" ]; then
  skill_active=$(node -e "
    const fs = require('fs');
    try {
      const d = JSON.parse(fs.readFileSync('$skill_file', 'utf8'));
      const age = Date.now() - new Date(d.activatedAt).getTime();
      console.log(age < 6 * 3600 * 1000 ? 'true' : 'false');
    } catch { console.log('false'); }
  ")
fi

if [ "$skill_active" != "true" ]; then
  echo "" >&2
  echo "[Skill Warning] No skill activated for this session." >&2
  echo "  Consider using a skill before editing source code:" >&2
  echo "  /implement — for implementation tasks" >&2
  echo "  /design    — for design tasks" >&2
  echo "  /review    — for code review" >&2
  echo "" >&2
fi

# ─── Pre-Code Gate (hard layer) ───
# Check .framework/gates.json
gates_file="$project_dir/.framework/gates.json"
if [ ! -f "$gates_file" ]; then
  echo "[Pre-Code Gate] .framework/gates.json not found. Run 'framework gate check'." >&2
  exit 2
fi

# Read gate statuses using node (no jq dependency)
result=$(node -e "
  const fs = require('fs');
  try {
    const g = JSON.parse(fs.readFileSync('$gates_file', 'utf8'));
    const a = g.gateA && g.gateA.status || 'pending';
    const b = g.gateB && g.gateB.status || 'pending';
    const c = g.gateC && g.gateC.status || 'pending';
    if (a === 'passed' && b === 'passed' && c === 'passed') {
      console.log('PASSED');
    } else {
      console.log(a + ',' + b + ',' + c);
    }
  } catch(e) { console.log('error'); }
")

if [ "$result" = "PASSED" ]; then
  exit 0
fi

# Parse individual statuses for error message
IFS=',' read -r gate_a gate_b gate_c <<< "$result"

echo "" >&2
echo "=====================================" >&2
echo "  PRE-CODE GATE: EDIT BLOCKED" >&2
echo "=====================================" >&2
echo "  Gate A (Environment): ${gate_a:-error}" >&2
echo "  Gate B (Planning):    ${gate_b:-error}" >&2
echo "  Gate C (SSOT):        ${gate_c:-error}" >&2
echo "" >&2
echo "  Run: framework gate check" >&2
echo "=====================================" >&2
exit 2
