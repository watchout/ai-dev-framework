import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readStructuredFile } from "../../scripts/shirube/lib.mjs";

const root = process.cwd();
const mirrorScript = "scripts/shirube/mirror-control-source.mjs";
const renderPackScript = "scripts/shirube/render-adoption-pack.mjs";
const checkPackScript = "scripts/shirube/check-adoption-pack.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/source-mirror");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function frameworkRef(): string {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return `watchout/ai-dev-framework@${head}`;
}

function run(script: string, args: string[]): { exitCode: number; json: any; stdout: string } {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout), stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout), stdout };
  }
}

function mirrorArgs(out: string, overrides: Record<string, string> = {}): string[] {
  const values = {
    "--source-control": "watchout/control#1",
    "--target-repo": "watchout/example",
    "--product": "Example",
    "--framework-ref": frameworkRef(),
    "--out": out,
    "--format": "json",
    "--fetched-at": "<FETCHED_AT_UTC>",
    "--generated-by": "codex-adf",
    ...overrides,
  };
  return Object.entries(values).flatMap(([key, value]) => [key, value]);
}

function renderMirror(out: string, overrides: Record<string, string> = {}): { exitCode: number; json: any; stdout: string } {
  return run(mirrorScript, mirrorArgs(out, overrides));
}

function renderPack(out: string): { exitCode: number; json: any; stdout: string } {
  return run(renderPackScript, [
    "--profile",
    "hotel-lite",
    "--target-repo",
    "watchout/example",
    "--product",
    "Example",
    "--source-control",
    "watchout/control#1",
    "--framework-ref",
    frameworkRef(),
    "--owner-actor",
    "watchout",
    "--owner-confirmation-ref",
    "https://github.com/watchout/control/issues/1#issuecomment-owner-confirmed",
    "--cell-id",
    "CELL-EXAMPLE-ADOPTION-001",
    "--mode",
    "render",
    "--out",
    out,
    "--format",
    "json",
  ]);
}

function checkPack(out: string): { exitCode: number; json: any; stdout: string } {
  return run(checkPackScript, [
    "--pack-root",
    out,
    "--target-repo",
    "watchout/example",
    "--profile",
    "hotel-lite",
    "--format",
    "json",
  ]);
}

function errorCodes(result: { json: any }): string[] {
  return result.json.errors.map((error: { code: string }) => error.code);
}

describe("Shirube source mirror generator", () => {
  it("renders a valid GitHub issue source mirror skeleton", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-"));
    try {
      const out = path.join(dir, "control-issue.yaml");
      const result = renderMirror(out);
      const mirror = readStructuredFile(out);

      expect(result.exitCode).toBe(0);
      expect(result.json.schema).toBe("shirube-source-mirror-render/v1");
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.live_fetch_performed).toBe(false);
      expect(result.json.external_repo_mutated).toBe(false);
      expect(existsSync(out)).toBe(true);

      expect(mirror.schema_version).toBe("shirube-source-mirror/v1");
      expect(mirror.source_type).toBe("github_issue");
      expect(mirror.source_ref).toBe("watchout/control#1");
      expect(mirror.source_repo).toBe("watchout/control");
      expect(mirror.issue_number).toBe(1);
      expect(mirror.source_url).toBe("https://github.com/watchout/control/issues/1");
      expect(mirror.target_repo).toBe("watchout/example");
      expect(mirror.product).toBe("Example");
      expect(mirror.framework_ref).toBe(frameworkRef());
      expect(mirror.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(mirror.mirror_is_truth).toBe(false);
      expect(mirror.source_authority.remains_authority).toBe(true);
      expect(mirror.extracted_fields.owner_confirmation).toBe("pending");
      expect(mirror.extracted_fields.control_source_status).toBe("snapshot");

      const required = readFileSync(fixture("required-fields.txt"), "utf8").split(/\r?\n/).filter(Boolean);
      expect(required).toContain("extracted_fields.owner_confirmation");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the digest stable for the same inputs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-"));
    try {
      const first = renderMirror(path.join(dir, "one.yaml"));
      const second = renderMirror(path.join(dir, "two.yaml"));

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(first.json.sha256).toBe(second.json.sha256);
      expect(readStructuredFile(path.join(dir, "one.yaml")).sha256).toBe(readStructuredFile(path.join(dir, "two.yaml")).sha256);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails invalid source-control format", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-"));
    try {
      const result = renderMirror(path.join(dir, "control-issue.yaml"), { "--source-control": "watchout/control/issues/1" });

      expect(result.exitCode).toBe(1);
      expect(result.json.verdict).toBe("FAILURE");
      expect(errorCodes(result)).toContain("invalid_source_control");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails invalid target repo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-"));
    try {
      const result = renderMirror(path.join(dir, "control-issue.yaml"), { "--target-repo": "not-a-repo" });

      expect(result.exitCode).toBe(1);
      expect(result.json.verdict).toBe("FAILURE");
      expect(errorCodes(result)).toContain("invalid_target_repo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails if mirror_is_truth is requested", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-"));
    try {
      const result = renderMirror(path.join(dir, "control-issue.yaml"), { "--mirror-is-truth": "true" });

      expect(result.exitCode).toBe(1);
      expect(result.json.verdict).toBe("FAILURE");
      expect(errorCodes(result)).toContain("mirror_truth_forbidden");
      expect(result.json.mirror_is_truth).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes YAML that parses", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-"));
    try {
      const out = path.join(dir, "control-issue.yaml");
      const result = renderMirror(out);
      const mirror = readStructuredFile(out);

      expect(result.exitCode).toBe(0);
      expect(mirror.target_repo).toBe("watchout/example");
      expect(mirror.extracted_fields.target_repo).toBe("watchout/example");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can replace the adoption-pack source mirror and pass check-adoption-pack", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-source-mirror-pack-"));
    try {
      const packRoot = path.join(dir, "pack");
      const rendered = renderPack(packRoot);
      expect(rendered.exitCode).toBe(0);

      const mirrorOut = path.join(packRoot, ".shirube/source-mirrors/control-issue.yaml");
      const mirrored = renderMirror(mirrorOut);
      expect(mirrored.exitCode).toBe(0);

      const checked = checkPack(packRoot);
      expect(checked.exitCode).toBe(0);
      expect(checked.json.verdict).toBe("PASS");
      expect(checked.json.blockers).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
