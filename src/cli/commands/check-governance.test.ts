import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

function withTempMarkdown<T>(content: string, fn: (file: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-governance-"));
  const file = path.join(dir, "work-order.md");
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const completeGovernanceIssue = `
## Governance Bone

- Goal: Govern hotel work.
- Phase: Phase 1.
- Work Order: WO-001.
- Risk classification: medium.
- PR slice: Slice 1.
- Script/gate owner: Shirube.
- Action tools: not applicable.
- Context evidence: context-pack/v1.
- Memory/recovery evidence: recovery-pack/v1.
- Approval policy: human approval for risky changes.
- Audit evidence: audit ref.
- Rollback/replay: revert PR and replay audit.
- Architecture owner: IYASAKA ARC.
- Implementation owner: repo maintainer.
- Review owner: independent reviewer.
- Merge authority: repo maintainer.
- Audit owner: independent auditor.
`;

describe("shirube check governance", () => {
  it("returns warning status without failing in warning mode", () => {
    withTempMarkdown("This Work Order changes customer data mutation.", (file) => {
      const result = runCli(["check", "governance", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Governance Bone: WARNING");
      expect(result.stdout).toContain("Missing governance bone field: Goal");
    });
  });

  it("fails in strict mode when governance fields are missing", () => {
    withTempMarkdown("This Work Order changes customer data mutation.", (file) => {
      const result = runCli(["check", "governance", "--strict", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Governance Bone: BLOCK");
    });
  });

  it("fails for high-risk work when mode is risk-derived", () => {
    withTempMarkdown("This Work Order changes customer data mutation.", (file) => {
      const result = runCli(["check", "governance", "--risk", "high", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Governance Bone: BLOCK");
      expect(result.stdout).toContain("Mode: strict");
      expect(result.stdout).toContain("Risk: high");
    });
  });

  it("keeps explicit warning mode for warning-first high-risk adoption", () => {
    withTempMarkdown("This Work Order changes customer data mutation.", (file) => {
      const result = runCli([
        "check",
        "governance",
        "--mode",
        "warning",
        "--risk",
        "high",
        file,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Governance Bone: WARNING");
      expect(result.stdout).toContain("Mode: warning");
      expect(result.stdout).toContain("Risk: high");
    });
  });

  it("uses profile-specific triggers", () => {
    withTempMarkdown("Update guest reservation recovery behavior.", (file) => {
      const result = runCli(["check", "governance", "--profile", "hotel", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Governance Bone: WARNING");
      expect(result.stdout).toContain("Profile: hotel");
      expect(result.stdout).toContain("Governance detected: yes");
    });
  });

  it("outputs JSON for complete governance evidence", () => {
    withTempMarkdown(completeGovernanceIssue, (file) => {
      const result = runCli(["check", "governance", "--json", "--strict", file]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        profile: string;
        risk: string;
      };

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("PASS");
      expect(parsed.profile).toBe("default");
      expect(parsed.risk).toBe("low");
    });
  });

  it("rejects invalid governance option values", () => {
    withTempMarkdown(completeGovernanceIssue, (file) => {
      const result = runCli(["check", "governance", "--risk", "severe", file]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Invalid governance risk");
    });
  });

  it("fails when implementation owner is unset in strict mode", () => {
    withTempMarkdown(
      completeGovernanceIssue.replace(
        "- Implementation owner: repo maintainer.",
        "- Implementation owner: TBD.",
      ),
      (file) => {
        const result = runCli(["check", "governance", "--strict", file]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toContain("Governance Bone: BLOCK");
        expect(result.stdout).toContain("Implementation owner");
      },
    );
  });

  it("blocks ARC implementation ownership without explicit delegation", () => {
    withTempMarkdown(
      completeGovernanceIssue.replace(
        "- Implementation owner: repo maintainer.",
        "- Implementation owner: IYASAKA ARC.",
      ),
      (file) => {
        const result = runCli(["check", "governance", "--mode", "warning", file]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toContain("Governance Bone: BLOCK");
        expect(result.stdout).toContain("explicit repository-owner delegation");
      },
    );
  });
});
