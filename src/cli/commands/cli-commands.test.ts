/**
 * CLI Command Integration Tests
 *
 * Tests that verify individual CLI commands handle help, invalid input,
 * and non-framework directory scenarios correctly.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as path from "node:path";

const CLI_PATH = path.resolve("src/cli/index.ts");
const TSX = "npx tsx";

function runCli(args: string): string {
  return execSync(`${TSX} ${CLI_PATH} ${args}`, {
    encoding: "utf-8",
    timeout: 15000,
  });
}

function runCliWithExit(args: string): {
  stdout: string;
  exitCode: number;
  stderr: string;
} {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0, stderr: "" };
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------
describe("generate command", () => {
  it("--help shows generate description and options", () => {
    const output = runCli("generate --help");
    expect(output).toContain("generate");
    expect(output).toContain("--step");
    expect(output).toContain("--status");
  });

  it("--status in a non-framework dir prints 'No generation state'", () => {
    // generate --status does not exit(1) when no state is found; it just prints info
    const result = runCliWithExit("generate --status");
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/No generation state/i);
  });

  it("--step 3 in a non-framework dir exits with error", () => {
    const result = runCliWithExit("generate --step 3");
    expect(result.exitCode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------
describe("plan command", () => {
  it("--help shows plan description and options", () => {
    const output = runCli("plan --help");
    expect(output).toContain("plan");
    expect(output).toContain("--status");
    expect(output).toContain("--output");
    expect(output).toContain("--sync");
  });

  it("--status in a non-framework dir shows 'No plan found'", () => {
    // plan --status prints info and exits 0 when no plan exists
    const result = runCliWithExit("plan --status");
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/No plan found/i);
  });

  it("plan in a non-framework dir exits with error", () => {
    const result = runCliWithExit("plan");
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    // May fail with "No .framework directory" or "No features found"
    expect(combined).toMatch(/\.framework|init|No features/i);
  });
});

// ---------------------------------------------------------------------------
// gate
// ---------------------------------------------------------------------------
describe("gate command", () => {
  it("--help shows subcommands", () => {
    const output = runCli("gate --help");
    expect(output).toContain("gate");
    expect(output).toContain("check");
    expect(output).toContain("status");
    expect(output).toContain("reset");
    expect(output).toContain("scaffold");
  });

  it("gate check --help shows check info", () => {
    const output = runCli("gate check --help");
    expect(output).toContain("check");
  });

  it("gate status in a non-framework dir shows gate state or 'No gate state found'", () => {
    // gate status prints info and exits 0 — either shows existing state or "No gate state found"
    const result = runCliWithExit("gate status");
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/No gate state found|Gate Status|Gate A|Gate B|Gate C/i);
  });
});

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------
describe("audit command", () => {
  it("--help shows audit description and options", () => {
    const output = runCli("audit --help");
    expect(output).toContain("audit");
    expect(output).toContain("--output");
    expect(output).toContain("--status");
    expect(output).toContain("--legacy");
  });

  it("invalid mode exits with error", () => {
    const result = runCliWithExit("audit invalid-mode somefile");
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Invalid audit mode/i);
  });

  it("ssot without target exits with error about target required", () => {
    const result = runCliWithExit("audit ssot");
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Target|target/i);
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe("init command", () => {
  it("--help shows init description and options", () => {
    const output = runCli("init --help");
    expect(output).toContain("init");
    expect(output).toContain("--description");
    expect(output).toContain("--type");
    expect(output).toContain("--skip-git");
  });

  it("--type with invalid type exits with error", () => {
    const result = runCliWithExit("init --type invalid-type test-proj");
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Invalid project type/i);
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
describe("status command", () => {
  it("--help shows status description and options", () => {
    const output = runCli("status --help");
    expect(output).toContain("status");
    expect(output).toContain("--github");
  });

  it("status in a non-framework dir exits with error", () => {
    const result = runCliWithExit("status");
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/framework|init|retrofit/i);
  });
});
