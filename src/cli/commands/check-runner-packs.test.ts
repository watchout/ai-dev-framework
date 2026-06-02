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

function withTempPack<T>(content: string, fn: (file: string, dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-runner-packs-"));
  const file = path.join(dir, "runner-packs.json");
  fs.writeFileSync(file, content);
  try {
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function validPack(): string {
  const requiredSteps = [
    "read_work_order",
    "verify_authority_and_lane_risk",
    "execute_allowed_files_actions_only",
    "run_verification",
    "open_or_update_pr_or_report_no_pr_needed",
    "write_pr_evidence",
    "return_result_state",
  ];

  const pack = {
    pack_version: "runner-instruction-pack/v1",
    profile_id: "iyasaka-internal.pr-conveyor",
    runner_agnostic: true,
    common_contract: {
      required_steps: requiredSteps,
      result_states: [
        "completed_pr_opened",
        "completed_no_pr_needed",
        "blocked_requires_input",
        "blocked_requires_audit",
        "blocked_requires_approval",
        "failed_verification",
        "skipped_not_authorized",
      ],
      required_evidence: [
        "runner_identity",
        "runtime_mode",
        "work_order_id",
        "branch_or_pr_ref",
        "changed_files",
        "verification_results",
        "residual_risk",
        "stop_conditions_encountered",
      ],
      forbidden_interfaces: [
        "codex_goal_required",
        "aun_live_dispatch_required",
      ],
      stop_behavior: "record_blocker_and_stop",
    },
    runner_packs: [
      "human",
      "codex",
      "claude_code",
      "ci_headless_script",
      "aun_dispatched_runner",
    ].map((runner) => ({
      runner,
      required_steps: requiredSteps,
      requires_codex_goal: false,
      live_aun_dispatch_enabled: false,
      activation_condition:
        runner === "aun_dispatched_runner"
          ? "after_safety_stack_acceptance"
          : "available_now",
    })),
  };

  return JSON.stringify(pack, null, 2);
}

describe("shirube check runner-packs", () => {
  it("passes complete runner packs in strict mode", () => {
    withTempPack(validPack(), (file) => {
      const result = runCli(["check", "runner-packs", "--strict", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Runner Packs: PASS");
    });
  });

  it("emits JSON for directory input", () => {
    withTempPack(validPack(), (_file, dir) => {
      const nested = path.join(dir, "nested");
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, "second.json"), validPack());

      const result = runCli(["check", "runner-packs", "--json", dir]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        checkedDocuments: unknown[];
        checkedPacks: number;
      };

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("PASS");
      expect(parsed.checkedDocuments).toHaveLength(2);
      expect(parsed.checkedPacks).toBe(2);
    });
  });

  it("fails when live AUN dispatch is enabled", () => {
    const pack = JSON.parse(validPack()) as {
      runner_packs: Array<Record<string, unknown>>;
    };
    const aunPack = pack.runner_packs.find(
      (runnerPack) => runnerPack.runner === "aun_dispatched_runner",
    );
    if (aunPack) aunPack.live_aun_dispatch_enabled = true;

    withTempPack(JSON.stringify(pack, null, 2), (file) => {
      const result = runCli(["check", "runner-packs", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Runner Packs: BLOCK");
      expect(result.stdout).toContain("live AUN dispatch");
    });
  });
});
