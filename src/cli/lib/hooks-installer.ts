/**
 * hooks-installer.ts - Install Pre-Code Gate hooks
 *
 * Two enforcement layers:
 * 1. Claude Code hook (PreToolUse): Blocks src/ edits when gates not passed
 * 2. Git pre-commit hook: Blocks commits when gates not passed
 *
 * pre-commit-allow: console-log
 * (this file generates hook scripts whose content contains literal console.log calls)
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const GATE_HOOK_MARKER = "Pre-Code Gate (framework)";

const CLAUDE_HOOK_SCRIPT = `#!/bin/bash
# Pre-Code Gate hook for Claude Code (PreToolUse)
# Smart Blocking: blocks product code edits when gates not passed,
# but allows Gate-preparation edits (docs, .env, .framework, etc).
# ADR-009: Smart Blocking方式
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

# ─── Smart Blocking: path classification ───
# Always-allowed paths (Gate preparation, config, meta)
case "$rel_path" in
  docs/*|.framework/*|.claude/*|.github/*|prisma/*|drizzle/*)
    exit 0
    ;;
  CLAUDE.md|README.md|LICENSE|package.json|package-lock.json|pnpm-lock.yaml)
    exit 0
    ;;
  .env|.env.*)
    exit 0
    ;;
esac

# Blocked paths (product code) — require Gate pass
case "$rel_path" in
  src/*|app/*|server/*|lib/*|components/*|pages/*|composables/*|utils/*|stores/*|plugins/*|scripts/*)
    ;;
  *)
    # Unknown path — allow by default
    exit 0
    ;;
esac

# ─── Skill Warning (soft layer) ───
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
  echo "  (docs/.env/.framework edits are allowed)" >&2
  echo "=====================================" >&2
  exit 2
fi

# ─── Active Task Check (hard layer) ───
if [ "\${FRAMEWORK_SKIP_TASK_CHECK:-}" = "1" ]; then
  exit 0
fi

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
# Smart Blocking (ADR-009): block commits with product code changes when gates not passed.
# Always-allowed: docs/ .env* .framework/ .claude/ .github/ prisma/ drizzle/ CLAUDE.md README.md LICENSE package*.json pnpm-lock.yaml
# Blocked: src/ app/ server/ lib/ components/ pages/ composables/ utils/ stores/ plugins/ scripts/
HAS_BLOCKED_FILES=false
while IFS= read -r staged_file; do
  case "$staged_file" in
    docs/*|.framework/*|.claude/*|.github/*|prisma/*|drizzle/*) continue ;;
    CLAUDE.md|README.md|LICENSE|package.json|package-lock.json|pnpm-lock.yaml) continue ;;
    .env|.env.*) continue ;;
    src/*|app/*|server/*|lib/*|components/*|pages/*|composables/*|utils/*|stores/*|plugins/*|scripts/*)
      HAS_BLOCKED_FILES=true
      break
      ;;
    *) continue ;;
  esac
done <<< "$(git diff --cached --name-only)"
if [ "$HAS_BLOCKED_FILES" = "true" ] && command -v framework >/dev/null 2>&1; then
  framework gate check || { echo "[Pre-Code Gate] COMMIT BLOCKED — product code requires all gates passed"; exit 1; }
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

  // 2c. Copy framework-runner.sh from templates
  const runnerSrcPath = path.resolve(__dirname, "../../../templates/hooks/framework-runner.sh");
  if (fs.existsSync(runnerSrcPath)) {
    const runnerDestPath = path.join(hooksDir, "framework-runner.sh");
    fs.copyFileSync(runnerSrcPath, runnerDestPath);
    fs.chmodSync(runnerDestPath, 0o755);
    files.push(".claude/hooks/framework-runner.sh");
  }

  // 2d. Copy post-task.sh from templates
  const postTaskSrcPath = path.resolve(__dirname, "../../../templates/hooks/post-task.sh");
  if (fs.existsSync(postTaskSrcPath)) {
    const postTaskDestPath = path.join(hooksDir, "post-task.sh");
    fs.copyFileSync(postTaskSrcPath, postTaskDestPath);
    fs.chmodSync(postTaskDestPath, 0o755);
    files.push(".claude/hooks/post-task.sh");
  }

  // 2e. Copy channel-routing.sh from templates (ADR-033)
  const channelRoutingSrcPath = path.resolve(__dirname, "../../../templates/hooks/channel-routing.sh");
  if (fs.existsSync(channelRoutingSrcPath)) {
    const channelRoutingDestPath = path.join(hooksDir, "channel-routing.sh");
    fs.copyFileSync(channelRoutingSrcPath, channelRoutingDestPath);
    fs.chmodSync(channelRoutingDestPath, 0o755);
    files.push(".claude/hooks/channel-routing.sh");
  }

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

  // Ensure Agent Teams env is set (ADR-016)
  if (!result.env || typeof result.env !== "object") {
    result.env = {};
  }
  const env = result.env as Record<string, string>;
  if (!env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) {
    env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  }

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

  // ─── SessionStart: framework-runner (task auto-fetch on bot startup) ───
  let sessionStart = hooks.SessionStart;
  if (!Array.isArray(sessionStart)) {
    sessionStart = [];
  }

  const hasRunner = (sessionStart as Array<Record<string, unknown>>).some(
    (entry) => {
      const entryHooks = entry.hooks;
      if (!Array.isArray(entryHooks)) return false;
      return entryHooks.some(
        (h: Record<string, unknown>) =>
          typeof h.command === "string" &&
          h.command.includes("framework-runner"),
      );
    },
  );

  if (!hasRunner) {
    (sessionStart as unknown[]).push({
      matcher: "",
      hooks: [
        {
          type: "command",
          command:
            'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/framework-runner.sh" 2>/dev/null || true',
        },
      ],
    });
  }

  // Channel routing hook (ADR-033)
  const hasChannelRouting = (sessionStart as Array<Record<string, unknown>>).some(
    (entry) => {
      const entryHooks = entry.hooks;
      if (!Array.isArray(entryHooks)) return false;
      return entryHooks.some(
        (h: Record<string, unknown>) =>
          typeof h.command === "string" &&
          h.command.includes("channel-routing"),
      );
    },
  );

  if (!hasChannelRouting) {
    (sessionStart as unknown[]).push({
      matcher: "",
      hooks: [
        {
          type: "command",
          command:
            'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/channel-routing.sh" 2>/dev/null || true',
        },
      ],
    });
  }

  hooks.SessionStart = sessionStart;

  // ─── PostToolUse: post-task.sh (next task proposal after task completion) ───
  let postToolUse = hooks.PostToolUse;
  if (!Array.isArray(postToolUse)) {
    postToolUse = [];
  }

  const hasPostTask = (postToolUse as Array<Record<string, unknown>>).some(
    (entry) => {
      const entryHooks = entry.hooks;
      if (!Array.isArray(entryHooks)) return false;
      return entryHooks.some(
        (h: Record<string, unknown>) =>
          typeof h.command === "string" &&
          h.command.includes("post-task"),
      );
    },
  );

  if (!hasPostTask) {
    (postToolUse as unknown[]).push({
      matcher: "Bash(gh issue close *)|Bash(gh pr create *)|Bash(gh pr merge *)",
      hooks: [
        {
          type: "command",
          command:
            'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/post-task.sh" 2>/dev/null || true',
        },
      ],
    });
  }

  hooks.PostToolUse = postToolUse;

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
// Native Git Hook (.git/hooks/pre-commit)
// ─────────────────────────────────────────────

export function installNativeGitHook(projectDir: string): {
  installed: boolean;
  files: string[];
  warnings: string[];
} {
  const files: string[] = [];
  const warnings: string[] = [];

  const gitHooksDir = path.join(projectDir, ".git", "hooks");
  if (!fs.existsSync(path.join(projectDir, ".git"))) {
    return { installed: false, files, warnings };
  }

  if (!fs.existsSync(gitHooksDir)) {
    fs.mkdirSync(gitHooksDir, { recursive: true });
  }

  const preCommitPath = path.join(gitHooksDir, "pre-commit");

  if (fs.existsSync(preCommitPath)) {
    const existing = fs.readFileSync(preCommitPath, "utf-8");
    if (existing.includes(GATE_HOOK_MARKER)) {
      return { installed: true, files, warnings };
    }

    // Merge: insert gate block after shebang
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
    files.push(".git/hooks/pre-commit (updated)");
    warnings.push("Existing .git/hooks/pre-commit merged with Pre-Code Gate block.");
  } else {
    const content = "#!/bin/sh\n" + PRE_COMMIT_BLOCK;
    fs.writeFileSync(preCommitPath, content, { mode: 0o755 });
    files.push(".git/hooks/pre-commit");
  }

  return { installed: true, files, warnings };
}

// ─────────────────────────────────────────────
// Smart Blocking path classification (ADR-009)
// Exported for testability — mirrors the shell case logic.
// ─────────────────────────────────────────────

export type PathAction = "allow" | "block" | "ignore";

const ALLOWED_PREFIXES = ["docs/", ".framework/", ".claude/", ".github/", "prisma/", "drizzle/"];
const ALLOWED_EXACT = ["CLAUDE.md", "README.md", "LICENSE", "package.json", "package-lock.json", "pnpm-lock.yaml"];
const BLOCKED_PREFIXES = ["src/", "app/", "server/", "lib/", "components/", "pages/", "composables/", "utils/", "stores/", "plugins/", "scripts/"];

export function classifyPath(filePath: string): PathAction {
  // Always-allowed paths
  for (const prefix of ALLOWED_PREFIXES) {
    if (filePath.startsWith(prefix)) return "allow";
  }
  if (ALLOWED_EXACT.includes(filePath)) return "allow";
  if (filePath === ".env" || filePath.startsWith(".env.")) return "allow";

  // Blocked paths (product code)
  for (const prefix of BLOCKED_PREFIXES) {
    if (filePath.startsWith(prefix)) return "block";
  }

  // Unknown — allow by default
  return "ignore";
}

export function hasBlockedFiles(files: string[]): boolean {
  return files.some((f) => classifyPath(f) === "block");
}

// ─────────────────────────────────────────────
// Combined Installer
// ─────────────────────────────────────────────

export function installAllHooks(projectDir: string): HooksInstallResult {
  const claude = installClaudeCodeHook(projectDir);
  const git = installGitPreCommitHook(projectDir);
  const nativeGit = installNativeGitHook(projectDir);

  return {
    claudeHookInstalled: claude.files.length > 0,
    gitHookInstalled: git.files.length > 0 || nativeGit.installed,
    files: [...claude.files, ...git.files, ...nativeGit.files],
    warnings: [...claude.warnings, ...git.warnings, ...nativeGit.warnings],
  };
}
