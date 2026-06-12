import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendLifecycleEvent,
  resolveLifecycleSinkReadiness,
} from "./lifecycle-events.js";
import type { FrameworkConfig } from "./workflow-config.js";

describe("lifecycle-events", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-lifecycle-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("treats the default local sink as ready when .framework is writable", () => {
    fs.mkdirSync(path.join(tmpDir, ".framework"));

    const readiness = resolveLifecycleSinkReadiness(tmpDir, {});

    expect(readiness.ready).toBe(true);
    expect(readiness.path).toBe(".framework/lifecycle-events.jsonl");
    expect(readiness.destination).toBe("file://.framework/lifecycle-events.jsonl");
  });

  it("reports sink readiness failure when the parent directory is missing", () => {
    const readiness = resolveLifecycleSinkReadiness(tmpDir, {});

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain("lifecycle sink directory is missing");
  });

  it("appends task lifecycle records as JSONL", () => {
    fs.mkdirSync(path.join(tmpDir, ".framework"));
    const config: FrameworkConfig = {};

    const result = appendLifecycleEvent(tmpDir, config, {
      event: "blocked",
      task_id: "FEAT-001",
      phase: "ready",
      timestamp: "2026-05-27T00:00:00.000Z",
      actor: "test-agent",
      blocking_rule_ids: ["G10.goal_contract.approved"],
    });

    expect(result).toEqual({
      ok: true,
      path: ".framework/lifecycle-events.jsonl",
    });
    const raw = fs.readFileSync(
      path.join(tmpDir, ".framework/lifecycle-events.jsonl"),
      "utf-8",
    );
    const record = JSON.parse(raw.trim()) as {
      schema_version: string;
      event: string;
      result: string;
      destination: string;
      blocking_rule_ids: string[];
    };
    expect(record.schema_version).toBe("lifecycle-event/v1");
    expect(record.event).toBe("blocked");
    expect(record.result).toBe("recorded");
    expect(record.destination).toBe("file://.framework/lifecycle-events.jsonl");
    expect(record.blocking_rule_ids).toEqual(["G10.goal_contract.approved"]);
  });
});
