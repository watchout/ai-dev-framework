import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");

function runCli(args: string[]): { stdout: string; exitCode: number; stderr: string } {
  try {
    const stdout = execFileSync(TSX, [CLI_PATH, ...args], {
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

function withTempProjection<T>(
  content: string,
  fn: (file: string, dir: string) => T,
): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-github-queue-"));
  const file = path.join(dir, "queue.json");
  fs.writeFileSync(file, content);
  try {
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function validProjection(): string {
  return JSON.stringify(
    {
      projection_version: "github-queue-projection/v1",
      repository: "watchout/ai-dev-framework",
      labels: [
        "ready-for-implementation",
        "implementing",
        "evidence-ready",
        "audit-pending",
        "changes-requested",
        "rework-implementing",
        "audit-passed",
        "merge-ready",
        "blocked-stop-lane",
      ],
      wip_policy: {
        fast_lane_prs_per_repo: 3,
        governed_draft_prs_per_repo: 2,
        rework_prs_per_repo: 2,
        stop_lane_prs_without_approval: 0,
      },
      items: [
        {
          id: "PR-1",
          type: "pull_request",
          state: "open",
          labels: ["audit-pending"],
          lane: "Fast",
          risk_class: "R2",
        },
      ],
    },
    null,
    2,
  );
}

describe("shirube check github-queue", () => {
  it("passes complete GitHub queue projection in strict mode", () => {
    withTempProjection(validProjection(), (file) => {
      const result = runCli(["check", "github-queue", "--strict", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("GitHub Queue: PASS");
      expect(result.stdout).toContain("fast=1/3");
    });
  });

  it("emits JSON for directory input", () => {
    withTempProjection(validProjection(), (_file, dir) => {
      const nested = path.join(dir, "nested");
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, "second.json"), validProjection());

      const result = runCli(["check", "github-queue", "--json", dir]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        checkedDocuments: unknown[];
        checkedItems: number;
      };

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("PASS");
      expect(parsed.checkedDocuments).toHaveLength(2);
      expect(parsed.checkedItems).toBe(2);
    });
  });

  it("fails Stop Lane PRs without approval evidence", () => {
    const unsafe = JSON.parse(validProjection()) as {
      items: Array<Record<string, unknown>>;
    };
    unsafe.items = [
      {
        id: "PR-4",
        type: "pull_request",
        state: "open",
        labels: ["blocked-stop-lane"],
        lane: "Stop",
        risk_class: "R4",
        approval_refs: "TBD",
      },
    ];

    withTempProjection(JSON.stringify(unsafe, null, 2), (file) => {
      const result = runCli(["check", "github-queue", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("GitHub Queue: BLOCK");
      expect(result.stdout).toContain("Stop Lane PRs without approval");
    });
  });
});
