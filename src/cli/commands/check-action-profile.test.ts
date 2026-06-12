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

function withTempProfile<T>(
  content: string,
  fn: (file: string, dir: string) => T,
): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-action-profile-"));
  const file = path.join(dir, "profile.json");
  fs.writeFileSync(file, content);
  try {
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function validProfile(): string {
  return JSON.stringify(
    {
      profile_version: "0.1.0",
      product: "kodama",
      owner_repo: "watchout/kodama",
      surfaces: [
        {
          surface_id: "kodama.get_context",
          surface_type: "mcp_tool",
          display_name: "Get Context",
          description: "Build a trusted context pack.",
          capability_classes: ["read", "reveal"],
          risk_level: "high",
          boundary: {
            standalone_required: true,
            state_owner: "kodama",
            execution_owner: "kodama",
            policy_owner: "kodama",
            audit_owner: "kodama",
            interop_modes: ["artifact_ref"],
            allowed_dependencies: ["artifact_reference"],
            forbidden_dependencies: [
              "direct_db_write",
              "shared_internal_state",
              "shared_credentials",
            ],
            direct_db_access_to_other_products: false,
            receiving_product_revalidates: false,
          },
          resource_scope: {
            tenant_scoped: false,
            resource_patterns: ["context-pack/v1"],
            data_categories: ["context"],
          },
          identity_requirements: {
            actor_required: true,
            agent_id_required: true,
            human_user_required: false,
            service_account_allowed: true,
          },
          context_requirements: {
            context_pack_required: false,
            required_labels: ["source_permission"],
            denied_labels: [],
            prompt_injection_check_required: true,
          },
          memory_requirements: {
            recovery_pack_required: false,
            approval_note_required: false,
            human_intent_ref_required: false,
          },
          approval_policy: {
            approval_required: false,
            approver_role: null,
            approval_ttl_seconds: null,
            reuse_allowed: false,
          },
          audit_policy: {
            audit_required: true,
            input_summary_required: true,
            output_summary_required: true,
            mutation_summary_required: false,
            egress_summary_required: false,
            redaction_required: true,
          },
          rollback_policy: {
            rollback_required: false,
            rollback_kind: "none",
            replay_supported: true,
          },
          execution_policy: {
            dry_run_supported: false,
            idempotency_key_required: false,
            rate_limit_policy: "per-agent",
            timeout_seconds: 30,
          },
        },
      ],
    },
    null,
    2,
  );
}

describe("shirube check action-profile", () => {
  it("passes a complete profile in strict mode", () => {
    withTempProfile(validProfile(), (file) => {
      const result = runCli(["check", "action-profile", "--strict", file]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Governed Action Profile: PASS");
      expect(result.stdout).toContain("Checked surfaces: 1");
    });
  });

  it("validates all JSON profile files in a directory", () => {
    withTempProfile(validProfile(), (_file, dir) => {
      const nested = path.join(dir, "nested");
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, "second.json"), validProfile());

      const result = runCli(["check", "action-profile", "--json", dir]);
      const parsed = JSON.parse(result.stdout) as { status: string; checkedSurfaces: number };

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("PASS");
      expect(parsed.checkedSurfaces).toBe(2);
    });
  });

  it("fails when a command request does not revalidate at the receiving product", () => {
    const unsafe = JSON.parse(validProfile()) as Record<string, unknown>;
    const surface = (unsafe.surfaces as Record<string, unknown>[])[0];
    surface.boundary = {
      standalone_required: true,
      state_owner: "ai_concierge",
      execution_owner: "ai_concierge",
      policy_owner: "ai_concierge",
      audit_owner: "ai_concierge",
      interop_modes: ["command_request"],
      allowed_dependencies: ["signed_command_request"],
      forbidden_dependencies: [
        "direct_db_write",
        "shared_internal_state",
        "shared_credentials",
      ],
      direct_db_access_to_other_products: false,
      receiving_product_revalidates: false,
    };

    withTempProfile(JSON.stringify(unsafe), (file) => {
      const result = runCli(["check", "action-profile", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Governed Action Profile: BLOCK");
      expect(result.stdout).toContain("command_request surfaces must require");
    });
  });
});
