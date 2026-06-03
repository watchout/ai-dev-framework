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

function withTempPr<T>(content: string, fn: (file: string, dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-pr-evidence-"));
  const file = path.join(dir, "pull-request.md");
  fs.writeFileSync(file, content);
  try {
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function validPrEvidence(): string {
  return `
- Work Order: SHIRUBE-CONVEYOR-001
- Delivery strategy: pr_conveyor
- Lane: Fast
- Risk class: R2
- Audit timing: after_pr
- Queue state: audit_pending
- Runner identity: codex
- Runtime mode: codex exec
- Implementation owner: Shirube repo maintainer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Changed files: src/cli/lib/pr-evidence-validator.ts
- Verification commands: npm test -- pr-evidence
- Verification results: PASS
- Residual risk: warning-first migration only
- Stop conditions encountered: none
- Merge readiness: audit_pending
`;
}

describe("shirube check pr-evidence", () => {
  it("passes complete PR Conveyor evidence in strict mode", () => {
    withTempPr(validPrEvidence(), (file) => {
      const result = runCli(["check", "pr-evidence", "--strict", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("PR Evidence: PASS");
    });
  });

  it("emits JSON for directory input", () => {
    withTempPr(validPrEvidence(), (_file, dir) => {
      const nested = path.join(dir, "nested");
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, "second.md"), validPrEvidence());

      const result = runCli(["check", "pr-evidence", "--json", dir]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        checkedDocuments: string[];
      };

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("PASS");
      expect(parsed.checkedDocuments).toHaveLength(2);
    });
  });

  it("fails R4 merge-ready claims without approval evidence", () => {
    const unsafe = validPrEvidence()
      .replace("Risk class: R2", "Risk class: R4")
      .replace("Lane: Fast", "Lane: Stop")
      .replace("Delivery strategy: pr_conveyor", "Delivery strategy: serial_gate")
      .replace("Audit timing: after_pr", "Audit timing: before_execution")
      .replace("Merge readiness: audit_pending", "Merge readiness: merge_ready")
      .concat("\n- Audit refs: L3 audit PASS\n- Approval refs: TBD\n");

    withTempPr(unsafe, (file) => {
      const result = runCli(["check", "pr-evidence", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("PR Evidence: BLOCK");
      expect(result.stdout).toContain("R4 PR evidence cannot claim merge-ready");
    });
  });

  it("fails R4 merge-ready claims with negative audit and approval refs", () => {
    const unsafe = validPrEvidence()
      .replace("Risk class: R2", "Risk class: R4")
      .replace("Lane: Fast", "Lane: Stop")
      .replace("Delivery strategy: pr_conveyor", "Delivery strategy: serial_gate")
      .replace("Audit timing: after_pr", "Audit timing: before_execution")
      .replace("Merge readiness: audit_pending", "Merge readiness: merge_ready")
      .concat("\n- Audit refs: no audit\n- Approval refs: no approval\n");

    withTempPr(unsafe, (file) => {
      const result = runCli(["check", "pr-evidence", "--strict", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("PR Evidence: BLOCK");
      expect(result.stdout).toContain("R4 PR evidence cannot claim merge-ready");
    });
  });

  it("fails R3 merge-ready claims with requested audit refs", () => {
    const unsafe = validPrEvidence()
      .replace("Risk class: R2", "Risk class: R3")
      .replace("Lane: Fast", "Lane: Governed")
      .replace("Delivery strategy: pr_conveyor", "Delivery strategy: phase_conveyor")
      .replace("Audit timing: after_pr", "Audit timing: before_merge")
      .replace("Merge readiness: audit_pending", "Merge readiness: merge_ready")
      .concat("\n- Audit refs: L3 audit requested #283\n");

    withTempPr(unsafe, (file) => {
      const result = runCli(["check", "pr-evidence", "--strict", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("PR Evidence: BLOCK");
      expect(result.stdout).toContain("R3 PR evidence cannot claim merge-ready");
    });
  });

  it("fails R4 merge-ready claims with requested audit and pending approval refs", () => {
    const unsafe = validPrEvidence()
      .replace("Risk class: R2", "Risk class: R4")
      .replace("Lane: Fast", "Lane: Stop")
      .replace("Delivery strategy: pr_conveyor", "Delivery strategy: serial_gate")
      .replace("Audit timing: after_pr", "Audit timing: before_execution")
      .replace("Merge readiness: audit_pending", "Merge readiness: merge_ready")
      .concat("\n- Audit refs: L3 audit requested #283\n- Approval refs: CTO approval pending #283\n");

    withTempPr(unsafe, (file) => {
      const result = runCli(["check", "pr-evidence", "--strict", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("PR Evidence: BLOCK");
      expect(result.stdout).toContain("R4 PR evidence cannot claim merge-ready");
    });
  });
});
