import { describe, it, expect } from "vitest";
import {
  parseFindingString,
  qualitySweepToJSON,
  gate3VerdictToJSON,
  buildGateContextJSON,
} from "./gate-json-output.js";
import type { QualitySweepResult } from "./gate-quality-engine.js";

describe("parseFindingString", () => {
  it("extracts id, category, message, file and line", () => {
    const f = parseFindingString(
      "- [SEC-001] SQL injection in db.ts (src/db.ts:42)",
      "CRITICAL",
    );
    expect(f.id).toBe("SEC-001");
    expect(f.category).toBe("sec");
    expect(f.severity).toBe("CRITICAL");
    expect(f.file).toBe("src/db.ts");
    expect(f.line).toBe(42);
    expect(f.message).toMatch(/SQL injection/);
  });

  it("falls back to message-only when unparsable", () => {
    const f = parseFindingString("random finding text", "WARNING");
    expect(f.id).toBe("UNKNOWN");
    expect(f.message).toBe("random finding text");
  });
});

describe("qualitySweepToJSON", () => {
  it("produces §6.1-shaped JSON", () => {
    const input: QualitySweepResult = {
      validators: [
        {
          name: "SSOT Drift",
          critical: 1,
          warning: 2,
          info: 0,
          criticalFindings: ["[SSOT-001] Drift detected (src/foo.ts:10)"],
          warningFindings: ["[SSOT-010] Minor drift"],
          rawOutput: "raw",
          elapsedMs: 1200,
        },
      ],
      totalCritical: 1,
      totalWarning: 2,
      totalInfo: 0,
      verdict: "BLOCK",
      elapsedMs: 1500,
      warningThreshold: 5,
    };
    const json = qualitySweepToJSON(input, "claude");
    expect(json.gate).toBe("quality");
    expect(json.verdict).toBe("BLOCK");
    expect(json.provider).toBe("claude");
    expect(json.summary.critical).toBe(1);
    expect(json.validators).toHaveLength(1);
    expect(json.validators[0].status).toBe("BLOCK");
    expect(json.validators[0].findings[0].id).toBe("SSOT-001");
    expect(json.validators[0].findings[0].file).toBe("src/foo.ts");
    expect(json.validators[0].findings[0].line).toBe(10);
  });

  it("marks validator as PASS when critical is 0", () => {
    const input: QualitySweepResult = {
      validators: [
        {
          name: "Security",
          critical: 0,
          warning: 0,
          info: 0,
          criticalFindings: [],
          warningFindings: [],
          rawOutput: "",
          elapsedMs: 500,
        },
      ],
      totalCritical: 0,
      totalWarning: 0,
      totalInfo: 0,
      verdict: "PASS",
      elapsedMs: 600,
      warningThreshold: 5,
    };
    const json = qualitySweepToJSON(input, "codex");
    expect(json.validators[0].status).toBe("PASS");
    expect(json.provider).toBe("codex");
  });

  it("is valid JSON (serializable + parseable)", () => {
    const input: QualitySweepResult = {
      validators: [],
      totalCritical: 0,
      totalWarning: 0,
      totalInfo: 0,
      verdict: "PASS",
      elapsedMs: 100,
      warningThreshold: 5,
    };
    const json = qualitySweepToJSON(input, "claude");
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized);
    expect(parsed.verdict).toBe("PASS");
  });
});

describe("gate3VerdictToJSON", () => {
  it("produces a release-gate JSON with SHIP_WITH_CONDITIONS + conditions meta", () => {
    const json = gate3VerdictToJSON({
      verdict: "SHIP_WITH_CONDITIONS",
      provider: "claude",
      elapsedMs: 300000,
      rawReport: "...",
      prosecutorCritical: 0,
      prosecutorWarning: 3,
      conditions: ["Add E2E for login", "Document rollback plan"],
    });
    expect(json.gate).toBe("release");
    expect(json.verdict).toBe("SHIP_WITH_CONDITIONS");
    expect(json.validators[0].name).toBe("Prosecutor");
    expect((json.meta?.conditions as string[]).length).toBe(2);
  });
});

describe("buildGateContextJSON (honesty-by-construction)", () => {
  it("omits the verdict field entirely so consumers cannot misread context as a verdict", () => {
    const json = buildGateContextJSON({
      gate: "release",
      provider: "claude",
      contextPath: ".framework/gate-context/adversarial-review.md",
    });
    expect(json.gate).toBe("release");
    expect(json.stage).toBe("context-collected");
    expect(json.provider).toBe("claude");
    expect(json.contextPath).toBe(
      ".framework/gate-context/adversarial-review.md",
    );
    // Critical: no `verdict` field at all.
    expect("verdict" in json).toBe(false);
  });

  it("includes a timestamp and round-trips through JSON.stringify/parse", () => {
    const json = buildGateContextJSON({
      gate: "quality",
      provider: "codex",
      contextPath: ".framework/gate-context/quality-sweep.md",
      meta: { nextStep: "run validators" },
    });
    const parsed = JSON.parse(JSON.stringify(json));
    expect(parsed.stage).toBe("context-collected");
    expect(new Date(parsed.timestamp).toString()).not.toBe("Invalid Date");
    expect(parsed.meta.nextStep).toBe("run validators");
    expect("verdict" in parsed).toBe(false);
  });
});
