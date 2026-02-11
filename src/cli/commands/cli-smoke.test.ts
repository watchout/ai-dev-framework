/**
 * CLI Smoke Tests
 *
 * End-to-end tests that verify the CLI binary works correctly.
 * These test the actual CLI entry point, not individual functions.
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

function runCliWithExit(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; status?: number };
    return {
      stdout: err.stdout ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

describe("CLI Smoke Tests", () => {
  it("shows help with --help", () => {
    const output = runCli("--help");
    expect(output).toContain("framework");
    expect(output).toContain("AI Development Framework CLI");
  });

  it("shows version with --version", () => {
    const output = runCli("--version");
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("shows help for init command", () => {
    const output = runCli("init --help");
    expect(output).toContain("init");
    expect(output).toContain("project-name");
  });

  it("shows help for discover command", () => {
    const output = runCli("discover --help");
    expect(output).toContain("discover");
  });

  it("shows help for generate command", () => {
    const output = runCli("generate --help");
    expect(output).toContain("generate");
  });

  it("shows help for plan command", () => {
    const output = runCli("plan --help");
    expect(output).toContain("plan");
  });

  it("shows help for audit command", () => {
    const output = runCli("audit --help");
    expect(output).toContain("audit");
  });

  it("shows help for status command", () => {
    const output = runCli("status --help");
    expect(output).toContain("status");
  });

  it("shows help for visual-test command", () => {
    const output = runCli("visual-test --help");
    expect(output).toContain("visual-test");
  });

  it("exits with error for unknown command", () => {
    const result = runCliWithExit("unknown-command-xyz");
    expect(result.exitCode).not.toBe(0);
  });

  it("lists all registered commands in help output", () => {
    const output = runCli("--help");
    const expectedCommands = [
      "init",
      "discover",
      "generate",
      "plan",
      "audit",
      "run",
      "status",
      "retrofit",
      "update",
      "checkpoint",
      "verify",
      "test",
      "visual-test",
      "accept",
      "ci",
      "deploy",
      "skill-create",
      "compact",
    ];

    for (const cmd of expectedCommands) {
      expect(output, `Command "${cmd}" should be in help`).toContain(cmd);
    }
  });
});
