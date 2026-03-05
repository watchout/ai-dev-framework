/**
 * Tests for auto-feedback.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AutoFeedbackContext } from "./feedback-model.js";
import {
  detectErrorPatterns,
  generateAutoProposal,
  processAutoFeedback,
} from "./auto-feedback.js";
import { saveProposals } from "./feedback-engine.js";

// ─────────────────────────────────────────────
// detectErrorPatterns
// ─────────────────────────────────────────────

describe("detectErrorPatterns", () => {
  it("detects TypeError pattern", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "TypeError: foo.bar is not a function",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("coding-rule");
  });

  it("detects null/undefined access pattern", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "Cannot read properties of undefined (reading 'x')",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("coding-rule");
  });

  it("detects ENOENT pattern", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "ENOENT: no such file or directory, open '/tmp/missing.ts'",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("workflow");
  });

  it("detects Gate failure pattern", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "Gate B failed: plan.json not found",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("gate");
  });

  it("detects SSOT missing pattern", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "SSOT section missing: §3-E not found",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("ssot-template");
  });

  it("returns empty for unrecognized errors", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "Something completely different happened",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns).toHaveLength(0);
  });

  it("returns empty when no error message", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
    };
    const patterns = detectErrorPatterns(context);
    expect(patterns).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// generateAutoProposal
// ─────────────────────────────────────────────

describe("generateAutoProposal", () => {
  it("generates proposal for matching error", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "TypeError: x.y is not a function",
      taskId: "TASK-001",
    };
    const proposal = generateAutoProposal(context, "test-project");
    expect(proposal).not.toBeNull();
    expect(proposal!.id).toMatch(/^AUTO-/);
    expect(proposal!.category).toBe("coding-rule");
    expect(proposal!.sourceProject).toBe("test-project");
    expect(proposal!.status).toBe("pending");
  });

  it("generates audit-low-score proposal without pattern match", () => {
    const context: AutoFeedbackContext = {
      trigger: "audit-low-score",
      auditScore: 72,
      errorMessage: "Some custom audit message",
    };
    const proposal = generateAutoProposal(context, "test-project");
    expect(proposal).not.toBeNull();
    expect(proposal!.title).toContain("72");
    expect(proposal!.category).toBe("workflow");
  });

  it("returns null for unrecognized run-failure", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "Unknown thing happened",
    };
    const proposal = generateAutoProposal(context, "test-project");
    expect(proposal).toBeNull();
  });
});

// ─────────────────────────────────────────────
// processAutoFeedback
// ─────────────────────────────────────────────

describe("processAutoFeedback", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-fb-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates and saves a proposal for matching error", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "TypeError: foo is not a function",
    };
    const proposal = processAutoFeedback(tmpDir, context, "my-project");
    expect(proposal).not.toBeNull();

    // Verify it was persisted
    const filePath = path.join(tmpDir, ".framework/feedback/proposals.json");
    expect(fs.existsSync(filePath)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(stored.proposals).toHaveLength(1);
    expect(stored.proposals[0].id).toBe(proposal!.id);
  });

  it("returns null for unrecognized errors", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "Unknown error xyz",
    };
    const proposal = processAutoFeedback(tmpDir, context, "my-project");
    expect(proposal).toBeNull();
  });

  it("deduplicates proposals with same title within 24h", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "TypeError: foo is not a function",
    };
    const first = processAutoFeedback(tmpDir, context, "my-project");
    expect(first).not.toBeNull();

    const second = processAutoFeedback(tmpDir, context, "my-project");
    expect(second).toBeNull();

    // Only one proposal should exist
    const filePath = path.join(tmpDir, ".framework/feedback/proposals.json");
    const stored = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(stored.proposals).toHaveLength(1);
  });
});
