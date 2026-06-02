import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");
const TEMPLATE_PATH = path.resolve(
  REPO_ROOT,
  "templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json",
);

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-delivery-profile-"));
  const file = path.join(dir, "profile.json");
  fs.writeFileSync(file, content);
  try {
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function validProfile(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf-8")) as Record<string, unknown>;
}

describe("shirube check delivery-profile", () => {
  it("passes the bundled IYASAKA internal profile in strict mode", () => {
    const result = runCli(["check", "delivery-profile", "--strict", TEMPLATE_PATH]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Delivery Profile: PASS");
    expect(result.stdout).toContain("Checked profiles: 1");
  });

  it("validates all JSON delivery profiles in a directory", () => {
    withTempProfile(JSON.stringify(validProfile()), (_file, dir) => {
      const nested = path.join(dir, "nested");
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, "second.json"), JSON.stringify(validProfile()));

      const result = runCli(["check", "delivery-profile", "--json", dir]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        checkedProfiles: number;
      };

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("PASS");
      expect(parsed.checkedProfiles).toBe(2);
    });
  });

  it("fails when R4 tries to use PR Conveyor after PR creation", () => {
    const profile = validProfile();
    profile.strategy_by_risk = {
      ...(profile.strategy_by_risk as Record<string, unknown>),
      R4: {
        delivery_strategy: "pr_conveyor",
        audit_timing: "after_pr",
        pr_mode: "normal",
      },
    };

    withTempProfile(JSON.stringify(profile), (file) => {
      const result = runCli(["check", "delivery-profile", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Delivery Profile: BLOCK");
      expect(result.stdout).toContain("R4 work must not use pr_conveyor");
    });
  });

  it("fails when R3 uses normal PR mode", () => {
    const profile = validProfile();
    profile.strategy_by_risk = {
      ...(profile.strategy_by_risk as Record<string, unknown>),
      R3: {
        delivery_strategy: "phase_conveyor",
        audit_timing: "before_merge",
        pr_mode: "normal",
      },
    };

    withTempProfile(JSON.stringify(profile), (file) => {
      const result = runCli(["check", "delivery-profile", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Delivery Profile: BLOCK");
      expect(result.stdout).toContain("R3 work must remain governed");
    });
  });

  it("fails when stop_policy is missing in warning mode", () => {
    const profile = validProfile();
    delete profile.stop_policy;

    withTempProfile(JSON.stringify(profile), (file) => {
      const result = runCli(["check", "delivery-profile", file]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Delivery Profile: BLOCK");
      expect(result.stdout).toContain("Missing delivery profile field: stop_policy");
    });
  });
});
