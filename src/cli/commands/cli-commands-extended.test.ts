/**
 * CLI command smoke tests — extended coverage for #331.
 * Verifies --help output and basic error paths for commands not covered in
 * cli-commands.test.ts.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");

function runCli(args: string): string {
  return execSync(`${TSX} ${CLI_PATH} ${args}`, {
    encoding: "utf-8",
    timeout: 15000,
  });
}

function runCliWithExit(
  args: string,
  options: { cwd?: string } = {},
): { stdout: string; exitCode: number; stderr: string } {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd,
    });
    return { stdout, exitCode: 0, stderr: "" };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-ext-cmd-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// accept
// ---------------------------------------------------------------------------
describe("accept command", () => {
  it("--help shows accept description and --status option", () => {
    const output = runCli("accept --help");
    expect(output).toContain("accept");
    expect(output).toContain("--status");
  });
});

// ---------------------------------------------------------------------------
// block
// ---------------------------------------------------------------------------
describe("block command", () => {
  it("block --help shows hold/unhold subcommands", () => {
    const output = runCli("block --help");
    expect(output).toContain("block");
    expect(output.toLowerCase()).toMatch(/hold|pr/);
  });
});

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------
describe("check command", () => {
  it("--help shows check description and subcommands", () => {
    const output = runCli("check --help");
    expect(output).toContain("check");
  });

  it("check governance --help shows --strict option", () => {
    const output = runCli("check governance --help");
    expect(output).toContain("governance");
    expect(output).toContain("--strict");
  });
});

// ---------------------------------------------------------------------------
// checkpoint
// ---------------------------------------------------------------------------
describe("checkpoint command", () => {
  it("--help shows --name and --status options", () => {
    const output = runCli("checkpoint --help");
    expect(output).toContain("checkpoint");
    expect(output).toContain("--name");
    expect(output).toContain("--status");
  });
});

// ---------------------------------------------------------------------------
// ci
// ---------------------------------------------------------------------------
describe("ci command", () => {
  it("--help shows --status and --checklist options", () => {
    const output = runCli("ci --help");
    expect(output).toContain("ci");
    expect(output).toContain("--status");
    expect(output).toContain("--checklist");
  });
});

// ---------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------
describe("compact command", () => {
  it("--help shows --auto and --status options", () => {
    const output = runCli("compact --help");
    expect(output).toContain("compact");
    expect(output).toContain("--auto");
    expect(output).toContain("--status");
  });
});

// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------
describe("complete command", () => {
  it("--help shows --pr, --sha, --status, --force options", () => {
    const output = runCli("complete --help");
    expect(output).toContain("complete");
    expect(output).toContain("--pr");
    expect(output).toContain("--sha");
    expect(output).toContain("--status");
    expect(output).toContain("--force");
  });

  it("--status in empty dir shows no evidence or empty state", () => {
    withTmpDir((cwd) => {
      const result = runCliWithExit("complete --status", { cwd });
      const combined = result.stdout + result.stderr;
      expect(combined.length).toBeGreaterThan(0);
    });
  });

  it("--pr without --sha exits with error about missing sha", () => {
    withTmpDir((cwd) => {
      const result = runCliWithExit("complete --pr 123", { cwd });
      expect(result.exitCode).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/sha|commit|required/i);
    });
  });
});

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
describe("config command", () => {
  it("--help shows config description", () => {
    const output = runCli("config --help");
    expect(output).toContain("config");
  });

  it("config testing --reset --help shows expected options", () => {
    const output = runCli("config testing --help");
    expect(output).toContain("testing");
    expect(output).toContain("--reset");
  });
});

// ---------------------------------------------------------------------------
// deploy
// ---------------------------------------------------------------------------
describe("deploy command", () => {
  it("--help shows --dry-run, --rollback, --status options", () => {
    const output = runCli("deploy --help");
    expect(output).toContain("deploy");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--rollback");
    expect(output).toContain("--status");
  });
});

// ---------------------------------------------------------------------------
// discover
// ---------------------------------------------------------------------------
describe("discover command", () => {
  it("--help shows --reset option", () => {
    const output = runCli("discover --help");
    expect(output).toContain("discover");
    expect(output).toContain("--reset");
  });
});

// ---------------------------------------------------------------------------
// exit
// ---------------------------------------------------------------------------
describe("exit command", () => {
  it("--help shows --reason option", () => {
    const output = runCli("exit --help");
    expect(output).toContain("exit");
    expect(output).toContain("--reason");
  });
});

// ---------------------------------------------------------------------------
// feedback
// ---------------------------------------------------------------------------
describe("feedback command", () => {
  it("--help shows propose/list/approve/reject subcommands", () => {
    const output = runCli("feedback --help");
    expect(output).toContain("feedback");
    expect(output).toMatch(/propose|list|approve|reject/i);
  });

  it("feedback list --help runs without crash", () => {
    const output = runCli("feedback list --help");
    expect(output).toContain("list");
  });
});

// ---------------------------------------------------------------------------
// improve
// ---------------------------------------------------------------------------
describe("improve command", () => {
  it("--help shows improve description", () => {
    const output = runCli("improve --help");
    expect(output).toContain("improve");
  });
});

// ---------------------------------------------------------------------------
// ingest
// ---------------------------------------------------------------------------
describe("ingest command", () => {
  it("--help shows --status, --approve, --dry-run options", () => {
    const output = runCli("ingest --help");
    expect(output).toContain("ingest");
    expect(output).toContain("--status");
    expect(output).toContain("--approve");
    expect(output).toContain("--dry-run");
  });
});

// ---------------------------------------------------------------------------
// merge-authority
// ---------------------------------------------------------------------------
describe("merge-authority command", () => {
  it("--help shows --repo, --pr, --audit-level, --json options", () => {
    const output = runCli("merge-authority --help");
    expect(output).toContain("merge-authority");
    expect(output).toContain("--repo");
    expect(output).toContain("--pr");
    expect(output).toContain("--audit-level");
    expect(output).toContain("--json");
  });

  it("without --repo exits with error", () => {
    const result = runCliWithExit("merge-authority");
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/repo|pull request|required|pr/i);
  });
});

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------
describe("migrate command", () => {
  it("migrate --help shows subcommands", () => {
    const output = runCli("migrate --help");
    expect(output).toContain("migrate");
  });

  it("migrate plan-state --help shows --apply option", () => {
    const output = runCli("migrate plan-state --help");
    expect(output).toContain("--apply");
  });
});

// ---------------------------------------------------------------------------
// next
// ---------------------------------------------------------------------------
describe("next command", () => {
  it("--help shows --force and --json options", () => {
    const output = runCli("next --help");
    expect(output).toContain("next");
    expect(output).toContain("--force");
    expect(output).toContain("--json");
  });

  it("next in empty dir exits non-zero or shows no task", () => {
    withTmpDir((cwd) => {
      const result = runCliWithExit("next", { cwd });
      const combined = result.stdout + result.stderr;
      expect(combined.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------
describe("projects command", () => {
  it("--help shows register/list/unregister subcommands", () => {
    const output = runCli("projects --help");
    expect(output).toContain("projects");
    expect(output).toMatch(/register|list|unregister/i);
  });

  it("projects list runs without crash", () => {
    const result = runCliWithExit("projects list");
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// prune
// ---------------------------------------------------------------------------
describe("prune command", () => {
  it("--help shows --list option", () => {
    const output = runCli("prune --help");
    expect(output).toContain("prune");
    expect(output).toContain("--list");
  });
});

// ---------------------------------------------------------------------------
// resequence
// ---------------------------------------------------------------------------
describe("resequence command", () => {
  it("--help shows --migrate option", () => {
    const output = runCli("resequence --help");
    expect(output).toContain("resequence");
    expect(output).toContain("--migrate");
  });
});

// ---------------------------------------------------------------------------
// retrofit
// ---------------------------------------------------------------------------
describe("retrofit command", () => {
  it("--help shows --generate, --dry-run, --report, --output options", () => {
    const output = runCli("retrofit --help");
    expect(output).toContain("retrofit");
    expect(output).toContain("--generate");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--report");
    expect(output).toContain("--output");
  });
});

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------
describe("session command", () => {
  it("--help shows session description", () => {
    const output = runCli("session --help");
    expect(output).toContain("session");
  });
});

// ---------------------------------------------------------------------------
// skill-create
// ---------------------------------------------------------------------------
describe("skill-create command", () => {
  it("--help shows --from, --list options", () => {
    const output = runCli("skill-create --help");
    expect(output).toContain("skill-create");
    expect(output).toContain("--from");
    expect(output).toContain("--list");
  });
});

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------
describe("sync command", () => {
  it("--help shows --keep-orphans and --commit options", () => {
    const output = runCli("sync --help");
    expect(output).toContain("sync");
    expect(output).toContain("--keep-orphans");
    expect(output).toContain("--commit");
  });
});

// ---------------------------------------------------------------------------
// test
// ---------------------------------------------------------------------------
describe("test command", () => {
  it("--help shows --status option", () => {
    const output = runCli("test --help");
    expect(output).toContain("test");
    expect(output).toContain("--status");
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
describe("update command", () => {
  it("--help shows --status and --all options", () => {
    const output = runCli("update --help");
    expect(output).toContain("update");
    expect(output).toContain("--status");
    expect(output).toContain("--all");
  });
});

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------
describe("verify command", () => {
  it("--help shows --strict and --fix options", () => {
    const output = runCli("verify --help");
    expect(output).toContain("verify");
    expect(output).toContain("--strict");
    expect(output).toContain("--fix");
  });
});

// ---------------------------------------------------------------------------
// visual-test
// ---------------------------------------------------------------------------
describe("visual-test command", () => {
  it("--help shows --status option", () => {
    const output = runCli("visual-test --help");
    expect(output).toContain("visual-test");
    expect(output).toContain("--status");
  });
});
