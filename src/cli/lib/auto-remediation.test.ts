import { describe, it, expect } from "vitest";
import {
  extractRemediationFromGate2,
  extractRemediationFromGate3,
  extractRemediation,
  capMaxRetries,
  formatEscalation,
  runGateWithAutoFix,
  type AutoFixCallbacks,
  type GateAutoFixResult,
} from "./auto-remediation.js";

// ─────────────────────────────────────────────
// Extraction tests
// ─────────────────────────────────────────────

describe("extractRemediationFromGate2", () => {
  it("extracts CRITICAL and WARNING findings from report", () => {
    const report = `## Findings
| # | Level | Category | Description |
|---|-------|----------|-------------|
| 1 | CRITICAL | Security | SQL injection in user query |
| 2 | WARNING | Performance | N+1 query in list endpoint |
| 3 | INFO | Style | Missing JSDoc comments |`;

    const result = extractRemediationFromGate2(report, 1);

    expect(result.source).toBe("gate2");
    expect(result.attempt).toBe(1);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].level).toBe("CRITICAL");
    expect(result.findings[1].level).toBe("WARNING");
    expect(result.instruction).toContain("Gate 2");
    expect(result.instruction).toContain("SQL injection");
  });

  it("returns empty findings for report with no CRITICAL/WARNING", () => {
    const report = `## Findings
| # | Level | Description |
|---|-------|-------------|
| 1 | INFO | Minor style issue |`;

    const result = extractRemediationFromGate2(report, 1);
    expect(result.findings).toHaveLength(0);
  });

  it("handles empty report", () => {
    const result = extractRemediationFromGate2("", 1);
    expect(result.findings).toHaveLength(0);
    expect(result.instruction).toContain("No actionable");
  });
});

describe("extractRemediationFromGate3", () => {
  it("extracts GUILTY findings from verdict", () => {
    const verdict = `## 各起訴への裁定
| # | Charge | Prosecution | Defense | Verdict | Reasoning |
|---|--------|-------------|---------|---------|-----------|
| 1 | UNIQUE constraint missing | CRITICAL | ACKNOWLEDGE | GUILTY | Valid concern |
| 2 | Fake tests | CRITICAL | ACKNOWLEDGE | GUILTY | Must fix |`;

    const result = extractRemediationFromGate3(verdict, 2);

    expect(result.source).toBe("gate3");
    expect(result.attempt).toBe(2);
    expect(result.findings.filter((f) => f.level === "GUILTY")).toHaveLength(2);
  });

  it("extracts condition checklist items", () => {
    const verdict = `## 条件
- [ ] Add UNIQUE constraint to venue_member
- [x] Already fixed: logging
- [ ] Add tenant scope check`;

    const result = extractRemediationFromGate3(verdict, 1);

    expect(result.findings.filter((f) => f.level === "CONDITION")).toHaveLength(3);
  });

  it("handles empty verdict", () => {
    const result = extractRemediationFromGate3("", 1);
    expect(result.findings).toHaveLength(0);
  });
});

describe("extractRemediation", () => {
  it("dispatches to gate2 extractor for quality", () => {
    const result = extractRemediation("| 1 | CRITICAL | Sec | Bug |", "quality", 1);
    expect(result.source).toBe("gate2");
  });

  it("dispatches to gate3 extractor for release", () => {
    const result = extractRemediation("| 1 | Bug | CRIT | ACK | GUILTY | Fix |", "release", 1);
    expect(result.source).toBe("gate3");
  });
});

// ─────────────────────────────────────────────
// Safety tests
// ─────────────────────────────────────────────

describe("capMaxRetries", () => {
  it("caps at 3", () => {
    expect(capMaxRetries(5)).toBe(3);
    expect(capMaxRetries(10)).toBe(3);
  });

  it("allows values 1-3", () => {
    expect(capMaxRetries(1)).toBe(1);
    expect(capMaxRetries(2)).toBe(2);
    expect(capMaxRetries(3)).toBe(3);
  });

  it("floors at 1", () => {
    expect(capMaxRetries(0)).toBe(1);
    expect(capMaxRetries(-1)).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Flow tests (with mocks)
// ─────────────────────────────────────────────

describe("runGateWithAutoFix", () => {
  it("returns PASS immediately if gate passes on first run", async () => {
    const callbacks: AutoFixCallbacks = {
      runGate: async () => ({ verdict: "PASS", report: "All good" }),
      onAttemptStart: () => {},
      onAttemptResult: () => {},
      onEscalation: () => {},
    };

    const result = await runGateWithAutoFix("quality", {
      maxRetries: 2,
      timeout: 300,
      runTests: true,
      projectDir: "/tmp/test",
    }, callbacks);

    expect(result.verdict).toBe("PASS");
    expect(result.attempts).toBe(1);
  });

  it("escalates when no findings can be extracted", async () => {
    let callCount = 0;
    const callbacks: AutoFixCallbacks = {
      runGate: async () => {
        callCount++;
        return { verdict: "BLOCK", report: "No table data" };
      },
      onAttemptStart: () => {},
      onAttemptResult: () => {},
      onEscalation: () => {},
    };

    const result = await runGateWithAutoFix("quality", {
      maxRetries: 2,
      timeout: 300,
      runTests: true,
      projectDir: "/tmp/test",
    }, callbacks);

    expect(result.verdict).toBe("ESCALATE");
    expect(result.escalationReason).toContain("No actionable");
    expect(callCount).toBe(1);
  });

  it("extraction works for remediation flow input", () => {
    // Verify that a BLOCK report with findings can be extracted
    // (actual executeRemediation requires filesystem, so we test extraction only)
    const report = "| 1 | CRITICAL | Sec | SQL injection vulnerability |";
    const instruction = extractRemediation(report, "quality", 1);

    expect(instruction.source).toBe("gate2");
    expect(instruction.findings).toHaveLength(1);
    expect(instruction.findings[0].level).toBe("CRITICAL");
    expect(instruction.instruction).toContain("Gate 2");
  });
});

// ─────────────────────────────────────────────
// Formatting tests
// ─────────────────────────────────────────────

describe("formatEscalation", () => {
  it("formats escalation for quality gate", () => {
    const result: GateAutoFixResult = {
      verdict: "ESCALATE",
      attempts: 2,
      reports: ["report1", "report2"],
      escalationReason: "Still BLOCK after 2 attempts",
    };

    const output = formatEscalation("quality", result);
    expect(output).toContain("ESCALATION");
    expect(output).toContain("Quality Sweep");
    expect(output).toContain("2/3");
    expect(output).toContain("Manual review");
  });

  it("formats escalation for release gate", () => {
    const result: GateAutoFixResult = {
      verdict: "ESCALATE",
      attempts: 3,
      reports: [],
      escalationReason: "Tests failed",
    };

    const output = formatEscalation("release", result);
    expect(output).toContain("Adversarial Review");
    expect(output).toContain("Tests failed");
  });
});
