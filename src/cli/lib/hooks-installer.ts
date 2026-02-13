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

if [ "$result" = "PASSED" ]; then
  exit 0
fi

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
