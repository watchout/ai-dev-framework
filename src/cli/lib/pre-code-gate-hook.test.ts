import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { installClaudeCodeHook } from "./hooks-installer.js";

let tmpDir: string;
let hookPath: string;

/**
 * Run the pre-code-gate.sh hook with given tool input and env overrides.
 * Returns { exitCode, stderr }.
 */
function runHook(
  toolInput: { tool_name: string; tool_input?: Record<string, string> },
  envOverrides?: Record<string, string>,
): { exitCode: number; stderr: string } {
  const input = JSON.stringify(toolInput);
  const mockBinDir = path.join(tmpDir, "bin");
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: tmpDir,
    PATH: fs.existsSync(mockBinDir)
      ? `${mockBinDir}:${process.env.PATH}`
      : process.env.PATH,
    ...envOverrides,
  };

  try {
    execSync(`echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}"`, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
    return { exitCode: 0, stderr: "" };
  } catch (err: unknown) {
    const error = err as { status: number; stderr?: Buffer };
    return {
      exitCode: error.status ?? 1,
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

/** Helper: write gates.json with all passed */
function writeGatesPassed(): void {
  const gatesDir = path.join(tmpDir, ".framework");
  fs.mkdirSync(gatesDir, { recursive: true });
  fs.writeFileSync(
    path.join(gatesDir, "gates.json"),
    JSON.stringify({
      gateA: { status: "passed" },
      gateB: { status: "passed" },
      gateC: { status: "passed" },
    }),
  );
}

/** Helper: create a mock gh script that returns specified Issues */
function setupMockGh(issues: { number: number; title: string }[]): void {
  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const script = `#!/bin/bash\necho '${JSON.stringify(issues)}'`;
  const ghPath = path.join(binDir, "gh");
  fs.writeFileSync(ghPath, script, { mode: 0o755 });
}

/** Helper: simulate active task via mock gh (returns in-progress Issue) */
function writeRunStateWithActiveTask(taskId: string): void {
  setupMockGh([{ number: 1, title: `[${taskId}] Active Task` }]);
}

/** Helper: simulate no active task via mock gh (returns empty list) */
function writeRunStateIdle(): void {
  setupMockGh([]);
}

/** Helper: write project.json with profile type */
function writeProjectJson(profileType: string, useV3Format = false): void {
  const dir = path.join(tmpDir, ".framework");
  fs.mkdirSync(dir, { recursive: true });
  const data = useV3Format
    ? { name: "test", type: profileType }
    : { name: "test", profileType };
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(data));
}

/** Standard Edit tool input targeting a protected path */
const editSrcInput = {
  tool_name: "Edit",
  tool_input: { file_path: `__TMP__/src/auth/login.ts` },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-hook-"));

  // Install hook via the installer (canonical source)
  installClaudeCodeHook(tmpDir);
  hookPath = path.join(tmpDir, ".claude/hooks/pre-code-gate.sh");

  // Fix the tool input path to use actual tmpDir
  editSrcInput.tool_input.file_path = path.join(tmpDir, "src/auth/login.ts");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("pre-code-gate.sh hook", () => {
  it("allows non-Edit/Write tools", () => {
    const result = runHook({ tool_name: "Bash" });
    expect(result.exitCode).toBe(0);
  });

  it("allows non-protected paths (docs/)", () => {
    writeGatesPassed();
    const result = runHook({
      tool_name: "Edit",
      tool_input: { file_path: path.join(tmpDir, "docs/README.md") },
    });
    expect(result.exitCode).toBe(0);
  });

  it("blocks when gates not passed", () => {
    const dir = path.join(tmpDir, ".framework");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "gates.json"),
      JSON.stringify({
        gateA: { status: "passed" },
        gateB: { status: "pending" },
        gateC: { status: "passed" },
      }),
    );

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("PRE-CODE GATE: EDIT BLOCKED");
  });

  it("blocks when gates passed but no run-state.json", () => {
    writeGatesPassed();

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("ACTIVE TASK REQUIRED");
  });

  it("blocks when gates passed but no active task", () => {
    writeGatesPassed();
    writeRunStateIdle();

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("ACTIVE TASK REQUIRED");
    expect(result.stderr).toContain("gh issue edit");
  });

  it("allows when gates passed AND task in_progress", () => {
    writeGatesPassed();
    writeRunStateWithActiveTask("FEAT-001-DB");

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(0);
  });

  it("allows with FRAMEWORK_SKIP_TASK_CHECK=1", () => {
    writeGatesPassed();
    // No run-state.json — would normally block

    const result = runHook(editSrcInput, {
      FRAMEWORK_SKIP_TASK_CHECK: "1",
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows for lp profile without active task", () => {
    writeGatesPassed();
    writeProjectJson("lp");
    // No run-state.json

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(0);
  });

  it("allows for hp profile with v3 format", () => {
    writeGatesPassed();
    writeProjectJson("hp", true);
    // No run-state.json

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(0);
  });

  it("detects active task via GitHub Issue label", () => {
    writeGatesPassed();
    setupMockGh([{ number: 42, title: "[FEAT-002-API] API Implementation" }]);

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(0);
  });

  it("blocks when gh returns empty issue list", () => {
    writeGatesPassed();
    setupMockGh([]);

    const result = runHook(editSrcInput);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("ACTIVE TASK REQUIRED");
  });
});
