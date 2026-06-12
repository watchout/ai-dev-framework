/**
 * CLI Command Integration Tests
 *
 * Tests that verify individual CLI commands handle help, invalid input,
 * and non-framework directory scenarios correctly.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Resolve repo-anchored paths at module load time, before any test-level cwd
// manipulation (withNonFrameworkDir / runCliWithExit({ cwd })). Using `npx tsx`
// or cwd-relative paths leaks the test runner's cwd into the resolution and
// breaks under tmp dir cwd in clean/offline environments (auditor block on
// PR #112 cycle 2: hidden impact + regression class).
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
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): {
  stdout: string;
  exitCode: number;
  stderr: string;
} {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
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

// Creates a fresh non-framework directory (no .framework/project.json) so that
// CLI invocations exercise the "outside a framework project" code paths even
// when the test suite runs from inside the ADF repo (which itself is now a
// framework project after the bootstrap PR).
function withNonFrameworkDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-cli-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
    withNonFrameworkDir((cwd) => {
      const result = runCliWithExit("audit ssot", { cwd });
      expect(result.exitCode).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Target|target/i);
    });
  });
});

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------
describe("start command", () => {
  const requiredRoles = [
    "architecture_owner",
    "l3_governance_owner",
    "implementation_lead",
    "reviewer",
    "auditor",
    "release_owner",
    "human_approver",
    "worker_pool",
  ];

  function completeRoleBindings(): Record<string, { type: string; id: string }> {
    return Object.fromEntries(
      requiredRoles.map((role) => [
        role,
        {
          type: role === "worker_pool" ? "local_agent" : "human",
          id: `${role}-target`,
        },
      ]),
    );
  }

  function withFakeActiveGh<T>(
    fn: (env: Record<string, string | undefined>) => T,
  ): T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-fake-gh-"));
    try {
      const binDir = path.join(dir, "bin");
      fs.mkdirSync(binDir, { recursive: true });
      const ghPath = path.join(binDir, "gh");
      fs.writeFileSync(
        ghPath,
        [
          "#!/bin/sh",
          "if [ \"$1\" = \"api\" ]; then",
          "  printf '[\"framework-managed\"]\\n'",
          "  exit 0",
          "fi",
          "if [ \"$1\" = \"repo\" ] && [ \"$2\" = \"edit\" ]; then",
          "  exit 0",
          "fi",
          "printf 'unexpected gh invocation: %s\\n' \"$*\" >&2",
          "exit 1",
          "",
        ].join("\n"),
        "utf-8",
      );
      fs.chmodSync(ghPath, 0o755);
      return fn({
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function withFrameworkProject<T>(fn: (dir: string) => T): T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-start-test-"));
    try {
      fs.mkdirSync(path.join(dir, ".framework"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, ".framework", "project.json"),
        JSON.stringify({ name: "start-test", profileType: "cli" }),
        "utf-8",
      );
      fs.writeFileSync(
        path.join(dir, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings: {} } }),
        "utf-8",
      );
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function writeStrictDogfoodEvidence(dir: string, feature = "FEAT-001"): void {
    fs.writeFileSync(
      path.join(dir, ".framework", "discover-session.json"),
      JSON.stringify({
        id: "discover-1",
        status: "completed",
        currentStage: 5,
        startedAt: "2026-05-23T00:00:00.000Z",
        updatedAt: "2026-05-23T00:00:00.000Z",
        completedAt: "2026-05-23T00:00:00.000Z",
        stages: [
          { stageNumber: 1, status: "confirmed", summary: "stage 1" },
          { stageNumber: 2, status: "confirmed", summary: "stage 2" },
          { stageNumber: 3, status: "confirmed", summary: "stage 3" },
          { stageNumber: 4, status: "confirmed", summary: "stage 4" },
          { stageNumber: 5, status: "confirmed", summary: "stage 5" },
        ],
        answers: { "Q1-1": "strict dogfood" },
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ".framework", "goal-contract.json"),
      JSON.stringify({ status: "approved" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ".framework", "phase-plan.json"),
      JSON.stringify({ phase: 1, feature, goalContract: "approved" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ".framework", "task-trace.json"),
      JSON.stringify({ task: feature, feature, issue: 222, phase: 1 }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ".framework", "doc4l-readiness.json"),
      JSON.stringify({ status: "ready", feature }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ".framework", "pre-impl-audit.json"),
      JSON.stringify({ verdict: "PASS", feature }),
      "utf-8",
    );
  }

  it("blocks strict start when role bindings are missing", () => {
    withFrameworkProject((cwd) => {
      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("required orchestration roles");
    });
  });

  it("allows standard start with missing roles as a warning", () => {
    withFrameworkProject((cwd) => {
      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level standard --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Readiness:    warning");
    });
  });

  it("blocks strict start when producer and gate/review/L3 authority roles share a target", () => {
    withFrameworkProject((cwd) => {
      const bindings = completeRoleBindings();
      bindings.reviewer = bindings.implementation_lead;
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("producer and gate/review/L3 authority roles");
      expect(result.stderr + result.stdout).toContain("implementation_lead and reviewer");
    });
  });

  it("blocks strict start when implementation lead and architecture owner share a target", () => {
    withFrameworkProject((cwd) => {
      const bindings = completeRoleBindings();
      bindings.architecture_owner = bindings.implementation_lead;
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("producer and gate/review/L3 authority roles");
      expect(result.stderr + result.stdout).toContain("implementation_lead and architecture_owner");
    });
  });

  it("blocks strict start when implementation lead and L3 governance owner share a target", () => {
    withFrameworkProject((cwd) => {
      const bindings = completeRoleBindings();
      bindings.l3_governance_owner = bindings.implementation_lead;
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("producer and gate/review/L3 authority roles");
      expect(result.stderr + result.stdout).toContain("implementation_lead and l3_governance_owner");
    });
  });

  it("blocks strict start when implementation lead and reviewer reuse the same actor label", () => {
    withFrameworkProject((cwd) => {
      const bindings = completeRoleBindings();
      bindings.implementation_lead = { type: "local_agent", id: "codex-adf" };
      bindings.reviewer = { type: "external", id: "codex-adf" };
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("implementation_lead and reviewer");
      expect(result.stderr + result.stdout).toContain("actor:codex-adf");
    });
  });

  it("allows strict dry-run when all producer and authority roles are separated", () => {
    withFrameworkProject((cwd) => {
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings: completeRoleBindings() } }),
        "utf-8",
      );
      writeStrictDogfoodEvidence(cwd);

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Readiness:    ready");
    });
  });

  it("keeps workflow check and start dry-run aligned for config-only projects", () => {
    withFrameworkProject((cwd) => {
      fs.rmSync(path.join(cwd, ".framework", "project.json"));
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({
          roles: { bindings: completeRoleBindings() },
          workflow: { publishPolicy: "auto_publish", outputs: ["local_files", "github"] },
        }),
        "utf-8",
      );
      writeStrictDogfoodEvidence(cwd);

      const check = runCliWithExit(
        "workflow check --action implementation_start --profile strict --feature FEAT-001 --json",
        { cwd },
      );
      const start = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict --dry-run",
        { cwd },
      );

      expect(check.exitCode).toBe(1);
      expect(start.exitCode).toBe(1);
      expect(check.stdout + check.stderr).toContain(".framework/project.json");
      expect(start.stdout + start.stderr).toContain("not applied to Shirube");
    });
  });

  it("records strict task_start lifecycle evidence before writing the session", () => {
    withFrameworkProject((cwd) => {
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({
          roles: { bindings: completeRoleBindings() },
          workflow: { publishPolicy: "auto_publish", outputs: ["local_files", "github"] },
        }),
        "utf-8",
      );
      writeStrictDogfoodEvidence(cwd);

      withFakeActiveGh((env) => {
        const result = runCliWithExit(
          "start . --feature FEAT-001 --audit-level strict",
          { cwd, env },
        );

        expect(result.exitCode).toBe(0);
      });

      const lifecyclePath = path.join(cwd, ".framework", "lifecycle-events.jsonl");
      expect(fs.existsSync(lifecyclePath)).toBe(true);
      const record = JSON.parse(fs.readFileSync(lifecyclePath, "utf-8").trim()) as {
        event: string;
        task_id: string;
        result: string;
      };
      expect(record.event).toBe("task_start");
      expect(record.task_id).toBe("FEAT-001");
      expect(record.result).toBe("recorded");
      expect(fs.existsSync(path.join(cwd, ".framework", "current-session.json"))).toBe(true);
    });
  });

  it("blocks strict start when task_start lifecycle append fails before session write", () => {
    withFrameworkProject((cwd) => {
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({
          roles: { bindings: completeRoleBindings() },
          workflow: {
            publishPolicy: "auto_publish",
            outputs: ["local_files", "github"],
            lifecycleSink: { path: ".framework" },
          },
        }),
        "utf-8",
      );
      writeStrictDogfoodEvidence(cwd);

      withFakeActiveGh((env) => {
        const result = runCliWithExit(
          "start . --feature FEAT-001 --audit-level strict",
          { cwd, env },
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr + result.stdout).toContain("Lifecycle evidence write failed");
      });

      expect(fs.existsSync(path.join(cwd, ".framework", "current-session.json"))).toBe(false);
    });
  });

  it("blocks strict start when dogfood evidence is missing and records a blocked lifecycle event", () => {
    withFrameworkProject((cwd) => {
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings: completeRoleBindings() } }),
        "utf-8",
      );

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("Strict implementation_start workflow check failed");
      const lifecyclePath = path.join(cwd, ".framework", "lifecycle-events.jsonl");
      expect(fs.existsSync(lifecyclePath)).toBe(true);
      const record = JSON.parse(fs.readFileSync(lifecyclePath, "utf-8").trim()) as {
        event: string;
        task_id: string;
        blocking_rule_ids: string[];
      };
      expect(record.event).toBe("blocked");
      expect(record.task_id).toBe("FEAT-001");
      expect(record.blocking_rule_ids).toEqual(
        expect.arrayContaining(["G10.goal_contract.approved"]),
      );
      expect(fs.existsSync(path.join(cwd, ".framework", "current-session.json"))).toBe(false);
    });
  });

  it("does not write a session when framework mode activation fails", () => {
    withFrameworkProject((cwd) => {
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings: completeRoleBindings() } }),
        "utf-8",
      );
      writeStrictDogfoodEvidence(cwd);

      const result = runCliWithExit(
        "start . --feature FEAT-001 --audit-level strict",
        { cwd },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("Framework mode activation failed");
      expect(fs.existsSync(path.join(cwd, ".framework", "current-session.json"))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// roles
// ---------------------------------------------------------------------------
describe("roles command", () => {
  const requiredRoles = [
    "architecture_owner",
    "l3_governance_owner",
    "implementation_lead",
    "reviewer",
    "auditor",
    "release_owner",
    "human_approver",
    "worker_pool",
  ];

  function completeRoleBindings(): Record<string, { type: string; id: string }> {
    return Object.fromEntries(
      requiredRoles.map((role) => [
        role,
        {
          type: role === "worker_pool" ? "local_agent" : "human",
          id: `${role}-target`,
        },
      ]),
    );
  }

  function withFrameworkConfig<T>(fn: (dir: string) => T): T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-roles-test-"));
    try {
      fs.mkdirSync(path.join(dir, ".framework"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings: {} } }),
        "utf-8",
      );
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("doctor exits non-zero when roles are missing", () => {
    withFrameworkConfig((cwd) => {
      const result = runCliWithExit("roles doctor", { cwd });

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("Required orchestration roles");
    });
  });

  it("validates bundled Company Dev OS role profiles as JSON", () => {
    const result = runCliWithExit("roles validate --json");

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      schema: string;
      passed: boolean;
      profiles: Array<{ role: string; role_profile_hash: string }>;
      findings: unknown[];
    };
    expect(payload.schema).toBe("shirube-company-dev-os-role-profile-validation/v1");
    expect(payload.passed).toBe(true);
    expect(payload.findings).toEqual([]);
    expect(payload.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "implementation",
          role_profile_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
  });

  it("doctor emits bundled Company Dev OS runtime binding status as JSON", () => {
    const result = runCliWithExit("roles doctor --json");

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      schema: string;
      passed: boolean;
      company_dev_os: {
        schema: string;
        passed: boolean;
        repositories: Array<{ repo: string; files: unknown[] }>;
      };
    };
    expect(payload.schema).toBe("shirube-roles-doctor/v1");
    expect(payload.passed).toBe(true);
    expect(payload.company_dev_os.schema).toBe(
      "shirube-company-dev-os-runtime-binding-doctor/v1",
    );
    expect(payload.company_dev_os.passed).toBe(true);
    expect(payload.company_dev_os.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repo: "watchout/ai-dev-framework",
          files: expect.any(Array),
        }),
      ]),
    );
  });

  it("validate exits non-zero with deterministic findings when profiles are missing", () => {
    withNonFrameworkDir((cwd) => {
      const result = runCliWithExit("roles validate --json", { cwd });

      expect(result.exitCode).toBe(1);
      const payload = JSON.parse(result.stdout) as {
        passed: boolean;
        findings: Array<{ code: string; role: string }>;
      };
      expect(payload.passed).toBe(false);
      expect(payload.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "missing_profile", role: "spec" }),
          expect.objectContaining({ code: "missing_profile", role: "cto" }),
        ]),
      );
    });
  });

  it("doctor --company-dev-os exits non-zero when runtime bindings are missing", () => {
    withFrameworkConfig((cwd) => {
      const bindings = completeRoleBindings();
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit("roles doctor --company-dev-os --json", { cwd });

      expect(result.exitCode).toBe(1);
      const payload = JSON.parse(result.stdout) as {
        passed: boolean;
        company_dev_os: { passed: boolean; findings: Array<{ code: string }> };
      };
      expect(payload.passed).toBe(false);
      expect(payload.company_dev_os.passed).toBe(false);
      expect(payload.company_dev_os.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "missing_bindings_file" }),
        ]),
      );
    });
  });

  it("doctor exits non-zero when Company Dev OS config dir exists without runtime bindings", () => {
    withFrameworkConfig((cwd) => {
      const bindings = completeRoleBindings();
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );
      fs.mkdirSync(path.join(cwd, ".shirube", "company-dev-os"), { recursive: true });

      const result = runCliWithExit("roles doctor --json", { cwd });

      expect(result.exitCode).toBe(1);
      const payload = JSON.parse(result.stdout) as {
        passed: boolean;
        company_dev_os: { passed: boolean; findings: Array<{ code: string }> };
      };
      expect(payload.passed).toBe(false);
      expect(payload.company_dev_os.passed).toBe(false);
      expect(payload.company_dev_os.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "missing_bindings_file" }),
        ]),
      );
    });
  });

  it("sets and lists a role binding", () => {
    withFrameworkConfig((cwd) => {
      const setResult = runCliWithExit(
        "roles set auditor --type mcp_agent --id codex-auditor",
        { cwd },
      );
      expect(setResult.exitCode).toBe(0);
      expect(setResult.stdout + setResult.stderr).toContain("Set auditor");

      const list = runCliWithExit("roles list", { cwd });
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain("auditor: mcp_agent:codex-auditor");
    });
  });

  it("doctor exits non-zero when producer and gate/review/L3 authority roles share a target", () => {
    withFrameworkConfig((cwd) => {
      const bindings = completeRoleBindings();
      bindings.auditor = bindings.implementation_lead;
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit("roles doctor", { cwd });

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("not separated");
      expect(result.stderr + result.stdout).toContain("implementation_lead and auditor");
    });
  });

  it("doctor exits non-zero when implementation lead and architecture owner share a target", () => {
    withFrameworkConfig((cwd) => {
      const bindings = completeRoleBindings();
      bindings.architecture_owner = bindings.implementation_lead;
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit("roles doctor", { cwd });

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("not separated");
      expect(result.stderr + result.stdout).toContain("implementation_lead and architecture_owner");
    });
  });

  it("doctor exits non-zero when implementation lead and L3 governance owner share a target", () => {
    withFrameworkConfig((cwd) => {
      const bindings = completeRoleBindings();
      bindings.l3_governance_owner = bindings.implementation_lead;
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit("roles doctor", { cwd });

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("not separated");
      expect(result.stderr + result.stdout).toContain("implementation_lead and l3_governance_owner");
    });
  });

  it("doctor exits non-zero when implementation lead and reviewer reuse the same actor label", () => {
    withFrameworkConfig((cwd) => {
      const bindings = completeRoleBindings();
      bindings.implementation_lead = { type: "local_agent", id: "codex-adf" };
      bindings.reviewer = { type: "external", id: "codex-adf" };
      fs.writeFileSync(
        path.join(cwd, ".framework", "config.json"),
        JSON.stringify({ roles: { bindings } }),
        "utf-8",
      );

      const result = runCliWithExit("roles doctor", { cwd });

      expect(result.exitCode).toBe(1);
      expect(result.stderr + result.stdout).toContain("not separated");
      expect(result.stderr + result.stdout).toContain("actor:codex-adf");
    });
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
// run
// ---------------------------------------------------------------------------
describe("run command", () => {
  it("--help shows run automation options", () => {
    const output = runCli("run --help");
    expect(output).toContain("run");
    expect(output).toContain("--start-only");
    expect(output).toContain("--heartbeat");
    expect(output).toContain("--fail-task");
    expect(output).toContain("--json");
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
    expect(output).toContain("--json");
  });

  it("status in a non-framework dir exits with error", () => {
    withNonFrameworkDir((cwd) => {
      const result = runCliWithExit("status", { cwd });
      expect(result.exitCode).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/framework|init|retrofit/i);
    });
  });
});

// ---------------------------------------------------------------------------
// trace verify — consumer-environment smoke (PR #104 cycle X+2)
// ---------------------------------------------------------------------------
//
// Anti-regression for the auditor BLOCK on cycle X+1: the traceability-auditor
// prompt previously invoked `npx tsx src/cli/index.ts trace verify`, which
// requires a source tree and a tsx binary. The new prompt invokes
// `npx shirube trace verify`, the published CLI bin. This smoke test
// simulates a consumer repo by running the CLI from a directory with no
// .framework/config.json and asserts a graceful exit-0 skip rather than a
// crash — matching the "graceful degrade" requirement of cycle X+2 §2.
// ---------------------------------------------------------------------------
describe("trace verify (consumer environment)", () => {
  it("exits 0 with a skip message when docs_layers is not configured", () => {
    withNonFrameworkDir((cwd) => {
      const result = runCliWithExit("trace verify", { cwd });
      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/docs_layers|skip|not configured/i);
    });
  });
});

// ---------------------------------------------------------------------------
// distribution CLI contract — node_modules/.bin/framework smoke (PR #104 cycle X+3)
// ---------------------------------------------------------------------------
//
// Auditor X+2 axes 3+6 BLOCK: the cycle X+2 graceful-skip test still exercised
// the source tree via tsx (CLI_PATH = src/cli/index.ts), so the "distribution
// CLI bin works in a consumer environment" claim was unproven. This describe
// invokes the published bin directly — `node_modules/.bin/framework`, whose
// package.json field `bin.framework` resolves to `./dist/cli/index.js` — with
// no tsx and no source tree on the resolution path. A symlink to dist is
// created in beforeAll if absent, since npm root-install does not self-link
// the package's own bin into node_modules/.bin (real consumers get the link
// transitively when they `npm install ai-dev-framework`).
// ---------------------------------------------------------------------------
const FRAMEWORK_BIN = path.resolve(REPO_ROOT, "node_modules/.bin/framework");
const DIST_BIN = path.resolve(REPO_ROOT, "dist/cli/index.js");

describe("distribution CLI contract (node_modules/.bin/framework)", () => {
  beforeAll(() => {
    if (!fs.existsSync(DIST_BIN)) {
      throw new Error(
        `dist/cli/index.js missing — run \`npm run build:cli\` (package.json bin.framework points to ./dist/cli/index.js)`,
      );
    }
    fs.chmodSync(DIST_BIN, 0o755);
    if (!fs.existsSync(FRAMEWORK_BIN)) {
      fs.mkdirSync(path.dirname(FRAMEWORK_BIN), { recursive: true });
      fs.symlinkSync(DIST_BIN, FRAMEWORK_BIN);
    }
  });

  it("node_modules/.bin/framework trace verify graceful-skips in a consumer cwd (dist bin only, no source tree)", () => {
    expect(fs.existsSync(FRAMEWORK_BIN)).toBe(true);
    withNonFrameworkDir((cwd) => {
      let stdout = "";
      let stderr = "";
      let exitCode = 0;
      try {
        stdout = execFileSync(FRAMEWORK_BIN, ["trace", "verify"], {
          encoding: "utf-8",
          cwd,
          timeout: 15000,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string; status?: number };
        stdout = err.stdout ?? "";
        stderr = err.stderr ?? "";
        exitCode = err.status ?? 1;
      }
      expect(exitCode).toBe(0);
      const combined = stdout + stderr;
      expect(combined).toMatch(/docs_layers|skip|not configured/i);
    });
  });
});
