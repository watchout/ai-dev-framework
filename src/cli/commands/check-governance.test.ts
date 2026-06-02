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

function withTempFile<T>(
  name: string,
  content: string,
  fn: (file: string) => T,
): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-check-"));
  const file = path.join(dir, name);
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
});

describe("shirube check action-profile", () => {
  it("passes strict stage 0 inventory rows", () => {
    withTempFile(
      "inventory.md",
      `
| Surface ID | Type | Capability | Risk | Owner repo |
|---|---|---|---|---|
| kodama.get_context | mcp_tool | read, reveal | medium | watchout/kodama |
`,
      (file) => {
        const result = runCli([
          "check",
          "action-profile",
          "--strict",
          "--stage",
          "inventory",
          file,
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Action Surface Profile: PASS");
        expect(result.stdout).toContain("Surfaces checked: 1");
      },
    );
  });

  it("warns without failing for incomplete profile-stage surfaces", () => {
    withTempFile(
      "surface.json",
      JSON.stringify({
        surface_id: "hotel_saas.ai_response.send",
        surface_type: "api_endpoint",
        owner_repo: "watchout/hotel-kanri",
        capability_classes: ["external_send", "action"],
        risk_level: "high",
      }),
      (file) => {
        const result = runCli(["check", "action-profile", file]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Action Surface Profile: WARNING");
        expect(result.stdout).toContain("approval_policy");
      },
    );
  });

  it("fails in strict mode for risky profiles without approval evidence", () => {
    withTempFile(
      "surface.json",
      JSON.stringify({
        surface_id: "aun.execute_tool",
        surface_type: "agent_action",
        product: "AUN",
        owner_repo: "watchout/agent-comms-mcp",
        display_name: "Execute tool",
        description: "Execute an action tool through a broker.",
        capability_classes: ["action", "execute_code"],
        risk_level: "critical",
        resource_scope: { tenant_scoped: false, resource_patterns: [], data_categories: [] },
        identity_requirements: { actor_required: true },
        context_requirements: { context_pack_required: true },
        memory_requirements: { recovery_pack_required: true },
        approval_policy: {},
        audit_policy: { audit_required: true },
        rollback_policy: {},
        execution_policy: {},
      }),
      (file) => {
        const result = runCli(["check", "action-profile", "--strict", file]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toContain("Action Surface Profile: BLOCK");
        expect(result.stdout).toContain("approval policy");
      },
    );
  });

  it("rejects invalid action profile stage", () => {
    withTempFile("surface.json", "[]", (file) => {
      const result = runCli([
        "check",
        "action-profile",
        "--stage",
        "live",
        file,
      ]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Invalid action profile stage");
    });
  });
});
