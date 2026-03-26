/**
 * Tests for gate-quality-engine.ts (ADR-016 Phase B-3)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseValidatorOutput,
  runQualitySweep,
  formatSweepOutput,
  setValidatorRunner,
  type ValidatorResult,
  type QualitySweepResult,
} from "./gate-quality-engine.js";

// ─────────────────────────────────────────────
// parseValidatorOutput
// ─────────────────────────────────────────────

describe("parseValidatorOutput", () => {
  it("parses standard output with counts", () => {
    const output = `## Report
### Summary
- Critical: 2
- Warning: 3
- Info: 1

#### CRITICAL
- [SEC-001] SQL injection in db.ts:42
- [SEC-002] Hardcoded API key

#### WARNING
- [COV-001] Missing boundary test
`;
    const result = parseValidatorOutput(output);
    expect(result.critical).toBe(2);
    expect(result.warning).toBe(3);
    expect(result.info).toBe(1);
    expect(result.criticalFindings).toHaveLength(2);
    expect(result.warningFindings).toHaveLength(1);
  });

  it("returns parse failure warning for missing counts", () => {
    const output = "Some output without proper format";
    const result = parseValidatorOutput(output);
    expect(result.warning).toBe(1);
    expect(result.warningFindings[0]).toContain("PARSE");
  });

  it("returns critical for empty output", () => {
    const result = parseValidatorOutput("");
    expect(result.critical).toBe(1);
    expect(result.criticalFindings[0]).toContain("no output");
  });

  it("handles zero counts", () => {
    const output = `### Summary
- Critical: 0
- Warning: 0
- Info: 5`;
    const result = parseValidatorOutput(output);
    expect(result.critical).toBe(0);
    expect(result.warning).toBe(0);
    expect(result.info).toBe(5);
  });

  it("handles case-insensitive count labels", () => {
    const output = `critical: 1\nwarning: 2\ninfo: 3`;
    const result = parseValidatorOutput(output);
    expect(result.critical).toBe(1);
    expect(result.warning).toBe(2);
    expect(result.info).toBe(3);
  });
});

// ─────────────────────────────────────────────
// runQualitySweep (with mock runner)
// ─────────────────────────────────────────────

describe("runQualitySweep", () => {
  let tmpDir: string;
  let restoreRunner: () => void;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-quality-"));
    fs.mkdirSync(path.join(tmpDir, ".framework/gate-context"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".claude/agents/validators"), { recursive: true });

    // Write context file
    fs.writeFileSync(path.join(tmpDir, ".framework/gate-context/quality-sweep.md"),
      "# Quality Sweep Context\n\n## Branch\nmain\n\n## Changed Files\nsrc/app.ts\n");

    // Write validator prompts
    for (const name of ["ssot-drift-detector", "security-scanner", "test-coverage-auditor", "perf-profiler"]) {
      fs.writeFileSync(path.join(tmpDir, `.claude/agents/validators/${name}.md`), `# ${name}\n## Prompt\nTest prompt`);
    }
  });

  afterEach(() => {
    if (restoreRunner) restoreRunner();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns PASS when all validators report zero critical and warning <= threshold", async () => {
    restoreRunner = setValidatorRunner(async () => {
      return "### Summary\n- Critical: 0\n- Warning: 1\n- Info: 2\n";
    });

    const result = await runQualitySweep(tmpDir, { sequential: true });
    expect(result.verdict).toBe("PASS");
    expect(result.totalCritical).toBe(0);
    expect(result.totalWarning).toBe(4); // 1 per validator × 4
    expect(result.validators).toHaveLength(4);
  });

  it("returns BLOCK when any validator reports critical", async () => {
    let callCount = 0;
    restoreRunner = setValidatorRunner(async () => {
      callCount++;
      if (callCount === 2) {
        return "### Summary\n- Critical: 1\n- Warning: 0\n\n#### CRITICAL\n- [SEC-001] Bad thing\n";
      }
      return "### Summary\n- Critical: 0\n- Warning: 0\n";
    });

    const result = await runQualitySweep(tmpDir, { sequential: true });
    expect(result.verdict).toBe("BLOCK");
    expect(result.totalCritical).toBe(1);
  });

  it("returns BLOCK when total warnings exceed threshold", async () => {
    restoreRunner = setValidatorRunner(async () => {
      return "### Summary\n- Critical: 0\n- Warning: 2\n";
    });

    const result = await runQualitySweep(tmpDir, { warningThreshold: 5, sequential: true });
    expect(result.totalWarning).toBe(8); // 2 × 4
    expect(result.verdict).toBe("BLOCK");
  });

  it("PASS at exactly warning threshold", async () => {
    restoreRunner = setValidatorRunner(async () => {
      return "### Summary\n- Critical: 0\n- Warning: 1\n";
    });

    // 1 × 4 = 4, threshold = 5 → PASS
    const result = await runQualitySweep(tmpDir, { warningThreshold: 5, sequential: true });
    expect(result.totalWarning).toBe(4);
    expect(result.verdict).toBe("PASS");
  });

  it("BLOCK at warning threshold + 1", async () => {
    restoreRunner = setValidatorRunner(async () => {
      return "### Summary\n- Critical: 0\n- Warning: 2\n";
    });

    // 2 × 4 = 8 > 5 → BLOCK
    const result = await runQualitySweep(tmpDir, { warningThreshold: 5, sequential: true });
    expect(result.verdict).toBe("BLOCK");
  });

  it("handles validator timeout gracefully", async () => {
    restoreRunner = setValidatorRunner(async () => {
      throw new Error("timeout");
    });

    const result = await runQualitySweep(tmpDir, { sequential: true });
    expect(result.verdict).toBe("BLOCK");
    expect(result.totalCritical).toBe(4); // 1 error per validator
  });

  it("saves individual reports to .framework/reports/", async () => {
    restoreRunner = setValidatorRunner(async () => {
      return "### Summary\n- Critical: 0\n- Warning: 0\n";
    });

    await runQualitySweep(tmpDir, { sequential: true });
    expect(fs.existsSync(path.join(tmpDir, ".framework/reports/gate2-ssot-drift-detector.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".framework/reports/gate2-security-scanner.md"))).toBe(true);
  });

  it("saves integrated report", async () => {
    restoreRunner = setValidatorRunner(async () => {
      return "### Summary\n- Critical: 0\n- Warning: 0\n";
    });

    await runQualitySweep(tmpDir, { sequential: true });
    const files = fs.readdirSync(path.join(tmpDir, ".framework/reports"));
    expect(files.some((f) => f.startsWith("quality-sweep-"))).toBe(true);
  });

  it("runs in parallel mode by default", async () => {
    const starts: number[] = [];
    restoreRunner = setValidatorRunner(async () => {
      starts.push(Date.now());
      return "### Summary\n- Critical: 0\n- Warning: 0\n";
    });

    await runQualitySweep(tmpDir); // parallel by default
    expect(starts).toHaveLength(4);
    // In parallel, all start times should be very close
    const maxDiff = Math.max(...starts) - Math.min(...starts);
    expect(maxDiff).toBeLessThan(100); // within 100ms
  });

  it("throws when context file is missing", async () => {
    fs.rmSync(path.join(tmpDir, ".framework/gate-context/quality-sweep.md"));
    await expect(runQualitySweep(tmpDir)).rejects.toThrow("No quality sweep context");
  });
});

// ─────────────────────────────────────────────
// formatSweepOutput
// ─────────────────────────────────────────────

describe("formatSweepOutput", () => {
  it("formats PASS result", () => {
    const result: QualitySweepResult = {
      validators: [
        { name: "SSOT Drift", critical: 0, warning: 1, info: 0, criticalFindings: [], warningFindings: ["[W1] test"], rawOutput: "", elapsedMs: 1000 },
        { name: "Security", critical: 0, warning: 0, info: 0, criticalFindings: [], warningFindings: [], rawOutput: "", elapsedMs: 2000 },
        { name: "Test Coverage", critical: 0, warning: 0, info: 0, criticalFindings: [], warningFindings: [], rawOutput: "", elapsedMs: 1500 },
        { name: "Performance", critical: 0, warning: 0, info: 0, criticalFindings: [], warningFindings: [], rawOutput: "", elapsedMs: 1200 },
      ],
      totalCritical: 0,
      totalWarning: 1,
      totalInfo: 0,
      verdict: "PASS",
      elapsedMs: 2000,
      warningThreshold: 5,
    };

    const output = formatSweepOutput(result);
    expect(output).toContain("PASS");
    expect(output).toContain("SSOT Drift");
    expect(output).toContain("Security");
  });

  it("formats BLOCK result with critical findings", () => {
    const result: QualitySweepResult = {
      validators: [
        { name: "Security", critical: 1, warning: 0, info: 0, criticalFindings: ["[SEC-001] Bad thing"], warningFindings: [], rawOutput: "", elapsedMs: 1000 },
        { name: "SSOT Drift", critical: 0, warning: 0, info: 0, criticalFindings: [], warningFindings: [], rawOutput: "", elapsedMs: 1000 },
        { name: "Test Coverage", critical: 0, warning: 0, info: 0, criticalFindings: [], warningFindings: [], rawOutput: "", elapsedMs: 1000 },
        { name: "Performance", critical: 0, warning: 0, info: 0, criticalFindings: [], warningFindings: [], rawOutput: "", elapsedMs: 1000 },
      ],
      totalCritical: 1,
      totalWarning: 0,
      totalInfo: 0,
      verdict: "BLOCK",
      elapsedMs: 1000,
      warningThreshold: 5,
    };

    const output = formatSweepOutput(result);
    expect(output).toContain("BLOCK");
    expect(output).toContain("SEC-001");
  });
});
