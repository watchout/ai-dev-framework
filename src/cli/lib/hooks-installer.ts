/**
 * hooks-installer.ts - Install Pre-Code Gate hooks
 *
 * Two enforcement layers:
 * 1. Claude Code hook (PreToolUse): Blocks src/ edits when gates not passed
 * 2. Git pre-commit hook: Blocks commits when gates not passed
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const GATE_HOOK_MARKER = "Pre-Code Gate (framework)";

const CLAUDE_HOOK_SCRIPT = `#!/bin/bash
# Pre-Code Gate hook for Claude Code (PreToolUse)
# Reads .framework/gates.json and blocks source code edits when gates have not passed.
# Also requires an active task from \\\`framework run\\\` before allowing edits.
# Exit 2 = deny (Claude Code convention), Exit 0 = allow

input=$(cat)
tool=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_name||'')}catch{console.log('')}})")

project_dir="\${CLAUDE_PROJECT_DIR:-.}"

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
rel_path="\${file_path#$project_dir/}"

# Check if path is a protected source code path
case "$rel_path" in
  src/*|app/*|server/*|lib/*|components/*|pages/*|composables/*|utils/*|stores/*|plugins/*)
    ;;
  *)
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

if [ "$result" != "PASSED" ]; then
  IFS=',' read -r gate_a gate_b gate_c <<< "$result"

  echo "" >&2
  echo "=====================================" >&2
  echo "  PRE-CODE GATE: EDIT BLOCKED" >&2
  echo "=====================================" >&2
  echo "  Gate A (Environment): \${gate_a:-error}" >&2
  echo "  Gate B (Planning):    \${gate_b:-error}" >&2
  echo "  Gate C (SSOT):        \${gate_c:-error}" >&2
  echo "" >&2
  echo "  Run: framework gate check" >&2
  echo "=====================================" >&2
  exit 2
fi

# ─── Active Task Check (hard layer) ───
# Requires a task started via \\\`framework run\\\` before allowing source edits.
# Skip: FRAMEWORK_SKIP_TASK_CHECK=1, profile lp/hp

if [ "\${FRAMEWORK_SKIP_TASK_CHECK:-}" = "1" ]; then
  exit 0
fi

# Single node call: check profile + run-state
task_check=$(node -e "
  const fs = require('fs');
  try {
    const pf = '$project_dir/.framework/project.json';
    if (fs.existsSync(pf)) {
      const p = JSON.parse(fs.readFileSync(pf, 'utf8'));
      const pt = p.profileType || p.type || '';
      if (pt === 'lp' || pt === 'hp') { console.log('SKIP'); process.exit(0); }
    }
    const rf = '$project_dir/.framework/run-state.json';
    if (!fs.existsSync(rf)) { console.log('NO_STATE'); process.exit(0); }
    const s = JSON.parse(fs.readFileSync(rf, 'utf8'));
    if (s.currentTaskId) { console.log('ACTIVE:' + s.currentTaskId); }
    else {
      const t = (s.tasks || []).find(t => t.status === 'in_progress');
      console.log(t ? 'ACTIVE:' + t.taskId : 'NO_TASK');
    }
  } catch { console.log('ERROR'); }
")

case "$task_check" in
  SKIP|ACTIVE:*)
    exit 0
    ;;
  *)
    echo "" >&2
    echo "=====================================" >&2
    echo "  ACTIVE TASK REQUIRED" >&2
    echo "=====================================" >&2
    echo "  Gates passed, but no task is in progress." >&2
    echo "  Start a task first:" >&2
    echo "    framework run <taskId>" >&2
    echo "" >&2
    echo "  Emergency bypass:" >&2
    echo "    FRAMEWORK_SKIP_TASK_CHECK=1" >&2
    echo "=====================================" >&2
    exit 2
    ;;
esac
`;

const SKILL_TRACKER_SCRIPT = `#!/bin/bash
# Skill Tracker hook for Claude Code (PreToolUse → Skill)
# Records skill activation to .framework/active-skill.json
# Always exits 0 (never blocks)

input=$(cat)

project_dir="\${CLAUDE_PROJECT_DIR:-.}"

# Extract skill name from tool_input
skill_name=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const p=JSON.parse(d);console.log((p.tool_input||{}).skill||'')}catch{console.log('')}})")

# No skill name = unexpected, just allow
if [ -z "$skill_name" ]; then
  exit 0
fi

# Ensure .framework/ exists
framework_dir="$project_dir/.framework"
if [ ! -d "$framework_dir" ]; then
  mkdir -p "$framework_dir"
fi

# Write active-skill.json with timestamp
node -e "
  const fs = require('fs');
  const data = { skill: '$skill_name', activatedAt: new Date().toISOString() };
  fs.writeFileSync('$framework_dir/active-skill.json', JSON.stringify(data, null, 2));
"

exit 0
`;

const PRE_COMMIT_BLOCK = `# === ${GATE_HOOK_MARKER} ===
PROTECTED_STAGED=$(git diff --cached --name-only | grep -E '^(src|app|server|lib|components|pages|composables|utils|stores|plugins)/')
if [ -n "$PROTECTED_STAGED" ] && command -v framework >/dev/null 2>&1; then
  framework gate check || { echo "[Pre-Code Gate] COMMIT BLOCKED"; exit 1; }
fi
# === End ${GATE_HOOK_MARKER} ===
`;

// ─────────────────────────────────────────────
// Claude Code Hook
// ─────────────────────────────────────────────

export interface HooksInstallResult {
  claudeHookInstalled: boolean;
  gitHookInstalled: boolean;
  files: string[];
  warnings: string[];
}

export function installClaudeCodeHook(projectDir: string): {
  files: string[];
  warnings: string[];
} {
  const files: string[] = [];
  const warnings: string[] = [];

  // 1. Create .claude/hooks/ directory
  const hooksDir = path.join(projectDir, ".claude", "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // 2. Write pre-code-gate.sh
  const scriptPath = path.join(hooksDir, "pre-code-gate.sh");
  fs.writeFileSync(scriptPath, CLAUDE_HOOK_SCRIPT, { mode: 0o755 });
  files.push(".claude/hooks/pre-code-gate.sh");

  // 2b. Write skill-tracker.sh
  const skillTrackerPath = path.join(hooksDir, "skill-tracker.sh");
  fs.writeFileSync(skillTrackerPath, SKILL_TRACKER_SCRIPT, { mode: 0o755 });
  files.push(".claude/hooks/skill-tracker.sh");

  // 3. Merge into .claude/settings.json
  const settingsPath = path.join(projectDir, ".claude", "settings.json");
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      warnings.push(
        ".claude/settings.json exists but is invalid JSON. Creating fresh.",
      );
    }
  }

  const merged = mergeClaudeSettings(existing);
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n");
  files.push(".claude/settings.json");

  return { files, warnings };
}

export function mergeClaudeSettings(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing };

  // Ensure hooks object exists
  if (!result.hooks || typeof result.hooks !== "object") {
    result.hooks = {};
  }
  const hooks = result.hooks as Record<string, unknown>;

  // Build the gate hook entry
  const gateHookEntry = {
    matcher: "Edit|Write",
    hooks: [
      {
        type: "command",
        command:
          'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-code-gate.sh"',
        statusMessage: "Pre-Code Gate check...",
      },
    ],
  };

  // Build the skill tracker hook entry
  const skillTrackerEntry = {
    matcher: "Skill",
    hooks: [
      {
        type: "command",
        command:
          'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/skill-tracker.sh"',
        statusMessage: "Tracking skill activation...",
      },
    ],
  };

  // Get or create PreToolUse array
  let preToolUse = hooks.PreToolUse;
  if (!Array.isArray(preToolUse)) {
    preToolUse = [];
  }

  // Check for existing gate hook (idempotency)
  const hasGateHook = (preToolUse as Array<Record<string, unknown>>).some(
    (entry) => {
      const entryHooks = entry.hooks;
      if (!Array.isArray(entryHooks)) return false;
      return entryHooks.some(
        (h: Record<string, unknown>) =>
          typeof h.command === "string" &&
          h.command.includes("pre-code-gate"),
      );
    },
  );

  if (!hasGateHook) {
    (preToolUse as unknown[]).push(gateHookEntry);
  }

  // Check for existing skill tracker hook (idempotency)
  const hasSkillTracker = (
    preToolUse as Array<Record<string, unknown>>
  ).some((entry) => {
    const entryHooks = entry.hooks;
    if (!Array.isArray(entryHooks)) return false;
    return entryHooks.some(
      (h: Record<string, unknown>) =>
        typeof h.command === "string" &&
        h.command.includes("skill-tracker"),
    );
  });

  if (!hasSkillTracker) {
    (preToolUse as unknown[]).push(skillTrackerEntry);
  }

  hooks.PreToolUse = preToolUse;
  return result;
}

// ─────────────────────────────────────────────
// Git Pre-Commit Hook
// ─────────────────────────────────────────────

export function installGitPreCommitHook(projectDir: string): {
  files: string[];
  warnings: string[];
} {
  const files: string[] = [];
  const warnings: string[] = [];

  // Detect Husky
  const huskyDir = path.join(projectDir, ".husky");
  const huskyExists = fs.existsSync(huskyDir);

  if (!huskyExists) {
    // Create .husky/ directory
    fs.mkdirSync(huskyDir, { recursive: true });
    warnings.push(
      'Husky directory created. Add "prepare": "husky" to package.json scripts.',
    );
  }

  const preCommitPath = path.join(huskyDir, "pre-commit");

  if (fs.existsSync(preCommitPath)) {
    // Prepend to existing pre-commit hook
    const existing = fs.readFileSync(preCommitPath, "utf-8");

    // Idempotency check
    if (existing.includes(GATE_HOOK_MARKER)) {
      return { files, warnings };
    }

    // Find where to insert (after shebang if present)
    let newContent: string;
    if (existing.startsWith("#!/")) {
      const firstNewline = existing.indexOf("\n");
      const shebang = existing.substring(0, firstNewline + 1);
      const rest = existing.substring(firstNewline + 1);
      newContent = shebang + PRE_COMMIT_BLOCK + "\n" + rest;
    } else {
      newContent = "#!/bin/sh\n" + PRE_COMMIT_BLOCK + "\n" + existing;
    }

    fs.writeFileSync(preCommitPath, newContent, { mode: 0o755 });
    files.push(".husky/pre-commit (updated)");
  } else {
    // Create new pre-commit hook
    const content = "#!/bin/sh\n" + PRE_COMMIT_BLOCK;
    fs.writeFileSync(preCommitPath, content, { mode: 0o755 });
    files.push(".husky/pre-commit");
  }

  return { files, warnings };
}

// ─────────────────────────────────────────────
// Combined Installer
// ─────────────────────────────────────────────

export function installAllHooks(projectDir: string): HooksInstallResult {
  const claude = installClaudeCodeHook(projectDir);
  const git = installGitPreCommitHook(projectDir);

  return {
    claudeHookInstalled: claude.files.length > 0,
    gitHookInstalled: git.files.length > 0,
    files: [...claude.files, ...git.files],
    warnings: [...claude.warnings, ...git.warnings],
  };
}
