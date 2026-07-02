import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const validatorScript = "scripts/shirube/check-script-control-fitness.mjs";
const verifierScript = "scripts/shirube/verify-required-checks-ran.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/script-control-fitness");
const changedFiles = path.join(fixtures, "changed-files");
const requiredChecks = path.join(fixtures, "required-checks");

function changed(name: string): string {
  return path.join(changedFiles, name);
}

function requiredCheckFixture(name: string): string {
  return path.join(requiredChecks, name);
}

function runNode(script: string, args: string[]): { exitCode: number; json: any } {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout) };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout) };
  }
}

function runValidator(changedFileList: string): { exitCode: number; json: any } {
  return runNode(validatorScript, [
    "--root",
    fixtures,
    "--changed-files",
    changed(changedFileList),
    "--as-of",
    "2026-07-01",
    "--format",
    "json",
  ]);
}

function runVerifier(extraArgs: string[]): { exitCode: number; json: any } {
  return runNode(verifierScript, [
    "--repo",
    "watchout/ai-dev-framework",
    "--pr-number",
    "527",
    "--head-sha",
    "abc123",
    "--base-branch",
    "main",
    "--now",
    "2026-07-01T00:35:00Z",
    "--format",
    "json",
    ...extraArgs,
  ]);
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

describe("Shirube script-control fitness validator", () => {
  it("passes deterministic-script enforced control points", () => {
    const result = runValidator("valid.txt");

    expect(result.exitCode).toBe(0);
    expect(result.json.schema).toBe("shirube-script-control-fitness/v1");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.control_points_checked).toHaveLength(1);
  });

  it("does not require control_points for ordinary standards copy", () => {
    const result = runValidator("ordinary.txt");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.control_points_checked).toHaveLength(0);
  });

  it("does not enforce intentionally invalid test fixtures from repository-root scans", () => {
    const result = runNode(validatorScript, [
      "--file",
      "test/fixtures/shirube/script-control-fitness/docs/spec/invalid-llm.md",
      "--as-of",
      "2026-07-01",
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.control_points_checked).toHaveLength(0);
  });

  it("blocks missing control_points in changed control-bearing specs", () => {
    const result = runValidator("missing-control-points.txt");

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("SCF-001");
  });

  it("blocks forbidden LLM/manual/human/owner-prose authorities", () => {
    for (const fixture of [
      "invalid-llm.txt",
      "invalid-manual.txt",
      "invalid-human-discretion.txt",
      "invalid-owner-prose.txt",
    ]) {
      const result = runValidator(fixture);

      expect(result.exitCode).toBe(1);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("SCF-003");
    }
  });

  it("keeps negative proof as a fixture while proving invalid authority blocks", () => {
    const result = runValidator("negative-proof.txt");

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.files_scanned).toContain("docs/spec/negative-proof.md");
    expect(result.json.control_points_checked[0].authority).toBe("llm");
    expect(blockerIds(result)).toContain("SCF-003");
  });

  it("blocks report-only without enforce_by", () => {
    const result = runValidator("report-only-missing-enforce-by.txt");

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("SCF-006");
  });

  it("blocks report-only without owner", () => {
    const result = runValidator("report-only-missing-owner.txt");

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("SCF-007");
  });

  it("blocks report-only without reason", () => {
    const result = runValidator("report-only-missing-reason.txt");

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("SCF-008");
  });

  it("blocks expired report-only enforce_by", () => {
    const result = runValidator("report-only-expired.txt");

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("SCF-009");
  });

  it("passes bounded future report-only/advisory with owner and reason", () => {
    const result = runValidator("report-only-future.txt");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
  });
});

describe("Shirube required-check actually-ran verifier", () => {
  it("fails branch_not_protected for activation proof", () => {
    const result = runVerifier([
      "--branch-protection-fixture",
      requiredCheckFixture("branch-not-protected.json"),
      "--check-runs-fixture",
      requiredCheckFixture("check-runs.empty.json"),
      "--statuses-fixture",
      requiredCheckFixture("statuses.empty.json"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.branch_protected).toBe(false);
    expect(blockerIds(result)).toContain("RCV-001");
  });

  it("uses expected contexts without reading branch protection in CI mode", () => {
    const result = runVerifier([
      "--expected-context",
      "validate-control-points",
      "--expected-context",
      "report-only-expiry",
      "--expected-context",
      "required-checks-actually-ran",
      "--branch-protection-fixture",
      requiredCheckFixture("branch-not-protected.json"),
      "--check-runs-fixture",
      requiredCheckFixture("check-runs.expected-pass.json"),
      "--statuses-fixture",
      requiredCheckFixture("statuses.empty.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.branch_protected).toBeNull();
    expect(result.json.required_contexts_source).toBe("expected_contexts");
    expect(result.json.required_contexts).toEqual([
      "report-only-expiry",
      "required-checks-actually-ran",
      "validate-control-points",
    ]);
  });

  it("fails missing expected contexts without branch-protection lookup", () => {
    const result = runVerifier([
      "--expected-contexts",
      "validate-control-points,report-only-expiry,required-checks-actually-ran",
      "--check-runs-fixture",
      requiredCheckFixture("check-runs.expected-missing.json"),
      "--statuses-fixture",
      requiredCheckFixture("statuses.empty.json"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.required_contexts_source).toBe("expected_contexts");
    expect(result.json.missing_contexts).toContain("required-checks-actually-ran");
    expect(blockerIds(result)).toContain("RCV-003");
  });

  it("fails required check declared but absent on exact head", () => {
    const result = runVerifier([
      "--branch-protection-fixture",
      requiredCheckFixture("protected-required.json"),
      "--check-runs-fixture",
      requiredCheckFixture("check-runs.empty.json"),
      "--statuses-fixture",
      requiredCheckFixture("statuses.empty.json"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.missing_contexts).toContain("Shirube Script-Control Fitness / validate-control-points");
    expect(result.json.missing_contexts).toContain("Shirube Script-Control Fitness / report-only-expiry");
    expect(blockerIds(result)).toContain("RCV-003");
  });

  it("fails skipped required check runs", () => {
    const result = runVerifier([
      "--branch-protection-fixture",
      requiredCheckFixture("protected-required.json"),
      "--check-runs-fixture",
      requiredCheckFixture("check-runs.skipped.json"),
      "--statuses-fixture",
      requiredCheckFixture("statuses.empty.json"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.skipped_contexts).toContain("Shirube Script-Control Fitness / validate-control-points");
    expect(blockerIds(result)).toContain("RCV-005");
  });

  it("passes when required checks ran successfully on the exact head", () => {
    const result = runVerifier([
      "--branch-protection-fixture",
      requiredCheckFixture("protected-required.json"),
      "--check-runs-fixture",
      requiredCheckFixture("check-runs.pass.json"),
      "--statuses-fixture",
      requiredCheckFixture("statuses.empty.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.required_contexts).toEqual([
      "Shirube Script-Control Fitness / report-only-expiry",
      "Shirube Script-Control Fitness / validate-control-points",
    ]);
  });
});
