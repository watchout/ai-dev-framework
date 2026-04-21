import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-feature-"));
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runInitFeature(
  args: string,
  cwd?: string,
): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(
      `npx tsx ${path.resolve("src/cli/index.ts")} init-feature ${args}`,
      {
        cwd: cwd ?? tmpDir,
        encoding: "utf8",
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("init-feature CLI", { timeout: 15000 }, () => {
  // VERIFY §1.1: 4ファイル雛形生成
  it("generates 4 files for valid feature name", () => {
    const result = runInitFeature("testfeat");
    expect(result.exitCode).toBe(0);

    for (const layer of ["spec", "impl", "verify", "ops"]) {
      const filePath = path.join(tmpDir, "docs", layer, "testfeat.md");
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("---");
      expect(content).toContain(`id: ${layer.toUpperCase()}-TESTFEAT-001`);
    }
  });

  // VERIFY §2: boundary values
  it("rejects empty feature name", () => {
    const result = runInitFeature('""');
    expect(result.exitCode).toBe(2);
  });

  it("accepts 1-char feature name", () => {
    const result = runInitFeature("a");
    expect(result.exitCode).toBe(0);
  });

  it("accepts 64-char feature name", () => {
    const name = "a".repeat(64);
    const result = runInitFeature(name);
    expect(result.exitCode).toBe(0);
  });

  it("rejects 65-char feature name", () => {
    const name = "a".repeat(65);
    const result = runInitFeature(name);
    expect(result.exitCode).toBe(2);
  });

  it("rejects feature name with spaces", () => {
    const result = runInitFeature('"my feature"');
    expect(result.exitCode).toBe(2);
  });

  it("rejects Japanese feature name", () => {
    const result = runInitFeature("認証");
    expect(result.exitCode).toBe(2);
  });

  // VERIFY §3: FeatureAlreadyExists
  it("rejects existing feature without --force", () => {
    runInitFeature("existing");
    const result = runInitFeature("existing");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("already exists");
  }, 15000);

  it("overwrites with --force", () => {
    runInitFeature("overwrite");
    const result = runInitFeature("overwrite --force");
    expect(result.exitCode).toBe(0);
  }, 15000);

  // VERIFY §3: PathOutOfScope
  it("rejects path traversal in feature name", () => {
    const result = runInitFeature("../../evil");
    expect(result.exitCode).toBe(2);
  });
});
