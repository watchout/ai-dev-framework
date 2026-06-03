import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");
const repo = "watchout/ai-dev-framework";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-conveyor-command-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runConveyor(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} conveyor ${args}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

function writeFixture(): string {
  const fixturePath = path.join(tmpDir, "conveyor-fixture.json");
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      issues: [
        {
          repo: "watchout/aun-platform",
          number: 24,
          title: "Discord-like thread stream",
          labels: ["needs:implementation"],
        },
      ],
      pull_requests: [
        {
          repo,
          number: 286,
          head: "head-286",
          merge_state: "CLEAN",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [
            {
              body: [
                "<!-- conveyor:audit-result/v1 -->",
                `repo: ${repo}`,
                "pr: 286",
                "role: l2",
                "verdict: PASS",
                "head: head-286",
              ].join("\n"),
            },
          ],
        },
      ],
    }),
    "utf-8",
  );
  return fixturePath;
}

describe("conveyor command", () => {
  it("prints reconcile help", () => {
    const result = runConveyor("--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("conveyor");
    expect(result.stdout).toContain("reconcile");
  });

  it("reconciles a fixture as JSON without live GitHub mutation", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`reconcile --fixture ${fixturePath} --apply --json`);
    const report = JSON.parse(result.stdout) as {
      schema: string;
      mode: string;
      prs: Array<{ final_labels: string[] }>;
    };

    expect(result.exitCode).toBe(0);
    expect(report.schema).toBe("shirube-conveyor-reconcile-report/v1");
    expect(report.mode).toBe("apply");
    expect(report.prs[0].final_labels).toEqual(
      expect.arrayContaining(["state:impl-l3", "audit:l2-passed", "audit:l3-pending"]),
    );
  });

  it("requires fixture until live GitHub label sync lands", () => {
    const result = runConveyor("reconcile --json");
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).error.message).toContain("Missing --fixture");
  });

  it("builds a tick manifest from a fixture without live discovery", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`tick --fixture ${fixturePath} --json`);
    const manifest = JSON.parse(result.stdout) as {
      schema: string;
      lanes: {
        implementation: { targets: Array<{ repo: string; number: number }> };
        l3: { targets: Array<{ repo: string; number: number }> };
      };
    };

    expect(result.exitCode).toBe(0);
    expect(manifest.schema).toBe("shirube-conveyor-tick-manifest/v1");
    expect(manifest.lanes.implementation.targets[0]).toEqual(
      expect.objectContaining({ repo: "watchout/aun-platform", number: 24 }),
    );
    expect(manifest.lanes.l3.targets[0]).toEqual(
      expect.objectContaining({ repo, number: 286 }),
    );
  });

  it("selects the next role target deterministically", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`next --role implementation --fixture ${fixturePath} --json`);
    const payload = JSON.parse(result.stdout) as {
      schema: string;
      role: string;
      target: { repo: string; number: number };
    };

    expect(result.exitCode).toBe(0);
    expect(payload.schema).toBe("shirube-conveyor-next-target/v1");
    expect(payload.role).toBe("implementation");
    expect(payload.target).toEqual(expect.objectContaining({ repo: "watchout/aun-platform", number: 24 }));
  });

  it("prints a durable audit-report evidence block without posting it", () => {
    const result = runConveyor(
      "audit-report --repo watchout/agent-memory --pr 132 --role l2 --verdict PASS --head abc123 --reported-by auditor",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("<!-- conveyor:audit-result/v1 -->");
    expect(result.stdout).toContain("repo: watchout/agent-memory");
    expect(result.stdout).toContain("pr: 132");
    expect(result.stdout).toContain("role: l2");
    expect(result.stdout).toContain("verdict: PASS");
    expect(result.stdout).toContain("head: abc123");
  });

  it("builds an observe-only label sync plan from a fixture", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`labels sync --fixture ${fixturePath} --json`);
    const plan = JSON.parse(result.stdout) as {
      schema: string;
      safe_to_apply: boolean;
      actions: Array<{ add: string[]; remove: string[]; blocked: boolean }>;
    };

    expect(result.exitCode).toBe(0);
    expect(plan.schema).toBe("shirube-conveyor-label-sync-plan/v1");
    expect(plan.safe_to_apply).toBe(true);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        add: expect.arrayContaining(["state:impl-l3", "audit:l2-passed"]),
        remove: expect.arrayContaining(["state:impl-l2", "audit:l2-pending"]),
        blocked: false,
      }),
    );
  });
});
