import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/failure-semantics");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function runSafeFixture(filePath: string): { exitCode: number; json: any } {
  const script = [
    "import { readStructuredFile, safeRun } from './scripts/shirube/lib.mjs';",
    "safeRun(() => readStructuredFile(process.argv[1]));",
  ].join(" ");
  try {
    const stdout = execFileSync("node", ["--input-type=module", "-e", script, filePath], {
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

describe("Shirube report-only failure semantics", () => {
  it("exits zero for PASS", () => {
    const result = runSafeFixture(fixture("pass.json"));
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
  });

  it("exits zero and records would_block for valid BLOCK", () => {
    const result = runSafeFixture(fixture("valid-block.json"));
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.would_block).toBe(true);
  });

  it("fails for malformed JSON", () => {
    const result = runSafeFixture(fixture("malformed.json"));
    expect(result.exitCode).not.toBe(0);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("script_error");
  });

  it("fails for missing artifacts", () => {
    const result = runSafeFixture(fixture("missing-artifact.json"));
    expect(result.exitCode).not.toBe(0);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("script_error");
  });

  it("fails for unknown verdict values", () => {
    const result = runSafeFixture(fixture("unknown-verdict.json"));
    expect(result.exitCode).not.toBe(0);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("unknown_verdict");
  });
});
