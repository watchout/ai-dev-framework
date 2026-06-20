import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-phase-command-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runPhase(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} phase ${args}`, {
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

function writeFixture(body: Record<string, unknown>): string {
  const fixturePath = path.join(tmpDir, "phase-fixture.json");
  fs.writeFileSync(fixturePath, JSON.stringify(body), "utf-8");
  return fixturePath;
}

describe("phase check command", () => {
  it("emits deterministic phase check JSON for a passing fixture", () => {
    const fixturePath = writeFixture({
      schema: "shirube-phase-check-fixture/v1",
      repo: "watchout/ai-dev-framework",
      pr: 445,
      head_sha: "head-sha",
      changed_files: [".shirube/cells/CELL-ADF-PHASE-001.yaml"],
      repo_files: [".shirube/repo-spec.yaml"],
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: [
            "planning_hierarchy:",
            "  premise_required: true",
            "  premise_ref: .shirube/specs/SPEC-ADF-PREMISE-001.md",
            "  premise_confirmed: true",
          ].join("\n"),
        },
      ],
    });

    const result = runPhase(`check --fixture ${fixturePath} --format json`);
    const report = JSON.parse(result.stdout) as { schema: string; verdict: string; current_phase: string };

    expect(result.exitCode).toBe(0);
    expect(report.schema).toBe("shirube-phase-check/v1");
    expect(report.verdict).toBe("PASS");
    expect(report.current_phase).toBe("CELL_DRAFTED");
  });

  it("exits nonzero and reports BLOCKED for missing premise evidence", () => {
    const fixturePath = writeFixture({
      schema: "shirube-phase-check-fixture/v1",
      repo: "watchout/ai-dev-framework",
      pr: 445,
      head_sha: "head-sha",
      changed_files: [],
      repo_files: [".shirube/repo-spec.yaml"],
      artifacts: [
        {
          path: ".shirube/repo-spec.yaml",
          body: "planning_hierarchy:\n  premise_required: true\n",
        },
      ],
    });

    const result = runPhase(`check --fixture ${fixturePath} --format json`);
    const report = JSON.parse(result.stdout) as { verdict: string; blockers: Array<{ code: string }> };

    expect(result.exitCode).toBe(1);
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("missing_premise_ref");
  });
});
