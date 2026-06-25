import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workOrderScript = "scripts/shirube/validate-work-order.mjs";
const workResultScript = "scripts/shirube/validate-work-result.mjs";
const fixtures = path.join(root, "fixtures/orchestration");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"));
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

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function writeTempJson(document: any): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "shirube-orchestration-contract-"));
  const file = path.join(dir, "document.json");
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return { dir, file };
}

describe("Shirube AUN orchestration contract", () => {
  it("ships parseable schemas and fixtures", () => {
    const schemaFiles = [
      "schemas/shirube/work-order.v1.schema.json",
      "schemas/shirube/work-result.v1.schema.json",
      "schemas/core/event.v1.schema.json",
      "schemas/core/evidence-ref.v1.schema.json",
    ];
    const fixtureFiles = [
      "fixtures/orchestration/shirube-work-order.ready-for-aun.json",
      "fixtures/orchestration/aun-work-result.completed.json",
      "fixtures/orchestration/aun-work-result.failed.json",
      "fixtures/orchestration/core-event.work-order-ready.json",
    ];

    for (const file of schemaFiles) {
      const schema = readJson(path.join(root, file));
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$id).toMatch(/^https:\/\/.+\/schemas\//);
    }

    for (const file of fixtureFiles) {
      const document = readJson(path.join(root, file));
      expect(document.schema_version).toMatch(/\/v1$/);
    }
  });

  it("accepts the ready-for-AUN Work Order fixture", () => {
    const result = run(workOrderScript, [
      "--file",
      fixture("shirube-work-order.ready-for-aun.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.schema).toBe("shirube-work-order-validation/v1");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(result.json.aun_consumable).toBe(true);
    expect(result.json.work_order_id).toBe("WO-ADF-511-ORCHESTRATION-CONTRACT-001");
    expect(result.json.idempotency_key).toContain("WO-ADF-511-ORCHESTRATION-CONTRACT-001");
    expect(result.json.blockers).toEqual([]);
  });

  it("accepts completed and failed AUN Work Result fixtures", () => {
    const workOrder = fixture("shirube-work-order.ready-for-aun.json");
    for (const [name, expectedStatus] of [
      ["aun-work-result.completed.json", "COMPLETED"],
      ["aun-work-result.failed.json", "FAILED"],
    ] as const) {
      const result = run(workResultScript, [
        "--file",
        fixture(name),
        "--work-order",
        workOrder,
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.schema).toBe("shirube-work-result-validation/v1");
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.would_block).toBe(false);
      expect(result.json.status).toBe(expectedStatus);
      expect(result.json.work_order_id).toBe("WO-ADF-511-ORCHESTRATION-CONTRACT-001");
      expect(result.json.idempotency_key).toBe(readJson(workOrder).idempotency_key);
      expect(result.json.blockers).toEqual([]);
    }
  });

  it("blocks Work Results without an idempotency key", () => {
    const document = readJson(fixture("aun-work-result.completed.json"));
    delete document.idempotency_key;
    const { dir, file } = writeTempJson(document);

    try {
      const result = run(workResultScript, ["--file", file, "--format", "json"]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("WR-023");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks Work Orders that make DB runtime mandatory", () => {
    const document = readJson(fixture("shirube-work-order.ready-for-aun.json"));
    document.metadata.db_runtime_required = true;
    const { dir, file } = writeTempJson(document);

    try {
      const result = run(workOrderScript, ["--file", file, "--format", "json"]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(result.json.would_block).toBe(true);
      expect(blockerIds(result)).toContain("WO-021");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks Work Orders without explicit path scope", () => {
    const document = readJson(fixture("shirube-work-order.ready-for-aun.json"));
    document.task.allowed_paths = [];
    const { dir, file } = writeTempJson(document);

    try {
      const result = run(workOrderScript, ["--file", file, "--format", "json"]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("WO-011");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks Work Results that do not match the referenced Work Order", () => {
    const document = readJson(fixture("aun-work-result.completed.json"));
    document.work_order_id = "WO-ADF-511-MISMATCHED";
    const { dir, file } = writeTempJson(document);

    try {
      const result = run(workResultScript, [
        "--file",
        file,
        "--work-order",
        fixture("shirube-work-order.ready-for-aun.json"),
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

  it("fails unsupported output formats", () => {
    const result = run(workOrderScript, [
      "--file",
      fixture("shirube-work-order.ready-for-aun.json"),
      "--format",
      "yaml",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json.verdict).toBe("FAILURE");
    expect(blockerIds(result)).toContain("WO-FAILURE");
  });
});
