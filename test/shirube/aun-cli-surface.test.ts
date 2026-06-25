import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const cli = path.join(root, "src/cli/index.ts");
const fixtures = path.join(root, "fixtures/orchestration");

function runCli(args: string[], env: Record<string, string | undefined> = {}): { exitCode: number; json: any; stdout: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", cli, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        DATABASE_URL: "",
        SHIRUBE_ORCHESTRATION_DB_URL: "",
        ...env,
      },
    });
    return { exitCode: 0, json: JSON.parse(stdout), stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout), stdout };
  }
}

function runCliRaw(args: string[]): string {
  return execFileSync("npx", ["tsx", cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeTempJson(document: any): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "shirube-aun-cli-"));
  const file = path.join(dir, "document.json");
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return { dir, file };
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function exportArgs(out: string): string[] {
  return [
    "work-order",
    "export",
    "--format",
    "json",
    "--out",
    out,
    "--work-order-id",
    "WO-ADF-511-AUN-CLI-001",
    "--repo",
    "watchout/ai-dev-framework",
    "--head-branch",
    "codex/511-aun-cli-surface",
    "--head-sha",
    "0123456789abcdef0123456789abcdef01234567",
    "--source-type",
    "github_issue",
    "--source-repo",
    "watchout/ai-dev-framework",
    "--source-ref",
    "refs/heads/codex/511-aun-cli-surface",
    "--source-commit",
    "0123456789abcdef0123456789abcdef01234567",
    "--source-url",
    "https://github.com/watchout/ai-dev-framework/issues/511",
    "--source-issue",
    "watchout/ai-dev-framework#511",
    "--framework-ref",
    "watchout/ai-dev-framework@0123456789abcdef0123456789abcdef01234567",
    "--target-package",
    "aun",
    "--target-capability",
    "work_order_execution",
    "--cell-id",
    "CELL-ADF-AUN-CLI-001",
    "--spec-id",
    "SPEC-ADF-AUN-CLI-001",
    "--impl-id",
    "IMPL-ADF-AUN-CLI-001",
    "--risk-tier",
    "R2",
    "--cell-type",
    "contract_cli",
    "--title",
    "Export AUN-compatible Work Order",
    "--goal",
    "Expose a stable Shirube Work Order envelope for AUN integration.",
    "--scope",
    "CLI export and validation surface",
    "--non-scope",
    "AUN runtime execution",
    "--non-scope",
    "DB runtime",
    "--allowed-path",
    "schemas/shirube/**",
    "--allowed-path",
    "src/cli/**",
    "--forbidden-path",
    "db/**",
    "--forbidden-path",
    "package.json",
    "--check",
    "npm run test -- test/shirube/aun-cli-surface.test.ts",
    "--required-evidence",
    "validation_result",
    "--acceptance-criterion",
    "AUN can consume exported Work Order JSON.",
    "--context-ref",
    "docs/contracts/shirube-aun-cli-integration-surface.md",
    "--evidence-ref",
    "fixtures/orchestration/core-event.work-order-ready.json",
    "--owner-actor",
    "watchout",
    "--repo-spec-ref",
    ".shirube/repo-spec.yaml",
    "--handoff-ref",
    ".shirube/work-orders/511/aun-cli-surface/control-handoff.yaml",
    "--created-at",
    "2026-06-25T00:00:00Z",
  ];
}

describe("Shirube AUN public CLI surface", () => {
  it("exports a schema-valid AUN-targeted Work Order", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-aun-cli-export-"));
    const out = path.join(dir, "work-order.json");
    try {
      const exported = runCli(exportArgs(out));
      const written = readJson(out);

      expect(exported.exitCode).toBe(0);
      expect(exported.json.schema_version).toBe("shirube-work-order/v1");
      expect(exported.json.idempotency_key).toMatch(/^shirube:/);
      expect(exported.json.target).toEqual({
        package: "aun",
        capability: "work_order_execution",
      });
      expect(written).toEqual(exported.json);

      const validated = runCli(["work-order", "validate", "--file", out, "--format", "json"]);
      expect(validated.exitCode).toBe(0);
      expect(validated.json.verdict).toBe("PASS");
      expect(validated.json.aun_consumable).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates the ready-for-AUN fixture through the public CLI", () => {
    const result = runCli([
      "work-order",
      "validate",
      "--file",
      path.join(fixtures, "shirube-work-order.ready-for-aun.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.idempotency_key).toContain("WO-ADF-511-ORCHESTRATION-CONTRACT-001");
    expect(result.json.target.package).toBe("aun");
  });

  it("validates completed and failed AUN result fixtures against the Work Order", () => {
    const workOrder = path.join(fixtures, "shirube-work-order.ready-for-aun.json");
    for (const [fixtureName, status] of [
      ["aun-work-result.completed.json", "COMPLETED"],
      ["aun-work-result.failed.json", "FAILED"],
    ] as const) {
      const result = runCli([
        "work-result",
        "validate",
        "--file",
        path.join(fixtures, fixtureName),
        "--work-order",
        workOrder,
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.status).toBe(status);
      expect(result.json.idempotency_key).toBe(readJson(workOrder).idempotency_key);
    }
  });

  it("blocks mismatched work_order_id results", () => {
    const document = readJson(path.join(fixtures, "aun-work-result.completed.json"));
    document.work_order_id = "WO-ADF-511-MISMATCHED";
    const { dir, file } = writeTempJson(document);

    try {
      const result = runCli([
        "work-result",
        "validate",
        "--file",
        file,
        "--work-order",
        path.join(fixtures, "shirube-work-order.ready-for-aun.json"),
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("WR-018");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks results with missing idempotency_key", () => {
    const document = readJson(path.join(fixtures, "aun-work-result.completed.json"));
    delete document.idempotency_key;
    const { dir, file } = writeTempJson(document);

    try {
      const result = runCli([
        "work-result",
        "validate",
        "--file",
        file,
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("WR-023");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dry-run imports valid AUN results without DB or AUN runtime", () => {
    const result = runCli([
      "work-result",
      "import",
      "--file",
      path.join(fixtures, "aun-work-result.completed.json"),
      "--work-order",
      path.join(fixtures, "shirube-work-order.ready-for-aun.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.schema).toBe("shirube-work-result-import/v1");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.mode).toBe("dry-run");
    expect(result.json.imported).toBe(false);
    expect(result.json.aun_state_mutated).toBe(false);
    expect(result.json.db_required).toBe(false);
    expect(result.json.owner_approval_synthesized).toBe(false);
  });

  it("dry-run import blocks invalid results", () => {
    const document = readJson(path.join(fixtures, "aun-work-result.completed.json"));
    delete document.idempotency_key;
    const { dir, file } = writeTempJson(document);

    try {
      const result = runCli([
        "work-result",
        "import",
        "--file",
        file,
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(result.json.would_block).toBe(true);
      expect(result.json.imported).toBe(false);
      expect(blockerIds(result)).toContain("WR-023");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes the public work-order and work-result command help", () => {
    expect(runCliRaw(["work-order", "--help"])).toContain("export");
    expect(runCliRaw(["work-result", "--help"])).toContain("import");
  });
});
