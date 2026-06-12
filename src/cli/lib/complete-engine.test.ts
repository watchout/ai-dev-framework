/**
 * Tests for complete-engine.ts
 * Ref: #367 — merge-vs-complete separation
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  evaluateCompletionGate,
  loadCompleteEvidence,
  saveCompleteEvidence,
  loadShirubeProfile,
  buildRecord,
  isCompleted,
  renderCompletionGateReport,
  renderStatus,
} from "./complete-engine.js";
import type {
  CompleteEvidenceStore,
  CompletionGateInput,
  CompletionGateStageId,
  ShirubeProfile,
} from "./complete-model.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "complete-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// loadCompleteEvidence
// ─────────────────────────────────────────────

describe("loadCompleteEvidence", () => {
  it("returns empty store when file missing", () => {
    const store = loadCompleteEvidence(tmpDir);
    expect(store.records).toEqual([]);
  });

  it("returns empty store on corrupt JSON", () => {
    const dir = path.join(tmpDir, ".framework");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "complete-evidence.json"), "not-json", "utf-8");
    const store = loadCompleteEvidence(tmpDir);
    expect(store.records).toEqual([]);
  });

  it("round-trips saved evidence", () => {
    const store: CompleteEvidenceStore = {
      records: [
        buildRecord({
          prNumber: "42",
          sha: "abc123",
          checks: [{ name: "deploy-confirmed", passed: true }],
          forced: false,
        }),
      ],
    };
    saveCompleteEvidence(tmpDir, store);
    const loaded = loadCompleteEvidence(tmpDir);
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0].prNumber).toBe("42");
    expect(loaded.records[0].sha).toBe("abc123");
  });
});

// ─────────────────────────────────────────────
// saveCompleteEvidence
// ─────────────────────────────────────────────

describe("saveCompleteEvidence", () => {
  it("creates directories and file", () => {
    saveCompleteEvidence(tmpDir, { records: [] });
    expect(
      fs.existsSync(path.join(tmpDir, ".framework/complete-evidence.json")),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────
// loadShirubeProfile
// ─────────────────────────────────────────────

describe("loadShirubeProfile", () => {
  it("returns null when profile missing", () => {
    expect(loadShirubeProfile(tmpDir)).toBeNull();
  });

  it("loads runtime profile", () => {
    const profile: ShirubeProfile = {
      repo_id: "watchout/agent-comms-mcp",
      repo_type: "mcp-core",
      runtime: true,
      protected_surfaces: ["routing"],
      allowed_tier: "all",
      ci_gate_0: { required_checks: ["test"] },
      complete_evidence: {
        types: ["health-check"],
        health_endpoint: "/health",
        smoke_command: "npm run smoke",
      },
    };
    const dir = path.join(tmpDir, ".shirube");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(profile), "utf-8");

    const loaded = loadShirubeProfile(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.runtime).toBe(true);
    expect(loaded!.complete_evidence?.health_endpoint).toBe("/health");
  });

  it("loads non-runtime profile", () => {
    const profile: ShirubeProfile = {
      repo_id: "watchout/ai-dev-framework",
      repo_type: "framework",
      runtime: false,
      protected_surfaces: ["governance"],
      allowed_tier: "all",
      ci_gate_0: { required_checks: ["test"] },
    };
    const dir = path.join(tmpDir, ".shirube");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(profile), "utf-8");

    const loaded = loadShirubeProfile(tmpDir);
    expect(loaded!.runtime).toBe(false);
  });
});

// ─────────────────────────────────────────────
// buildRecord
// ─────────────────────────────────────────────

describe("buildRecord", () => {
  it("builds a record with all fields", () => {
    const record = buildRecord({
      prNumber: "99",
      sha: "deadbeef",
      checks: [
        { name: "deploy-confirmed", passed: true },
        { name: "health-check", passed: false, detail: "timeout" },
      ],
      forced: true,
    });

    expect(record.prNumber).toBe("99");
    expect(record.sha).toBe("deadbeef");
    expect(record.forced).toBe(true);
    expect(record.checks).toHaveLength(2);
    expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─────────────────────────────────────────────
// isCompleted
// ─────────────────────────────────────────────

describe("isCompleted", () => {
  it("returns null for unknown PR", () => {
    const store: CompleteEvidenceStore = { records: [] };
    expect(isCompleted("999", store)).toBeNull();
  });

  it("returns the record for a known PR", () => {
    const record = buildRecord({
      prNumber: "42",
      sha: "abc",
      checks: [],
      forced: false,
    });
    const store: CompleteEvidenceStore = { records: [record] };
    expect(isCompleted("42", store)).not.toBeNull();
    expect(isCompleted("42", store)!.prNumber).toBe("42");
  });
});

// ─────────────────────────────────────────────
// renderStatus
// ─────────────────────────────────────────────

describe("renderStatus", () => {
  it("shows 'No complete records' when empty", () => {
    const output = renderStatus({ records: [] }, null);
    expect(output).toContain("No complete records");
  });

  it("shows repo type when profile present", () => {
    const profile: ShirubeProfile = {
      repo_id: "watchout/agent-comms-mcp",
      repo_type: "mcp-core",
      runtime: true,
      protected_surfaces: [],
      allowed_tier: "all",
      ci_gate_0: { required_checks: [] },
    };
    const output = renderStatus({ records: [] }, profile);
    expect(output).toContain("watchout/agent-comms-mcp");
    expect(output).toContain("runtime");
  });

  it("shows forced warning", () => {
    const record = buildRecord({
      prNumber: "7",
      sha: "abc",
      checks: [{ name: "deploy-confirmed", passed: false }],
      forced: true,
    });
    const output = renderStatus({ records: [record] }, null);
    expect(output).toContain("--force");
    expect(output).toContain("⚠");
  });

  it("shows checkmark for all-passed record", () => {
    const record = buildRecord({
      prNumber: "8",
      sha: "abc",
      checks: [{ name: "deploy-confirmed", passed: true }],
      forced: false,
    });
    const output = renderStatus({ records: [record] }, null);
    expect(output).toContain("✓ PR #8");
  });
});

// ─────────────────────────────────────────────
// evaluateCompletionGate
// ─────────────────────────────────────────────

describe("evaluateCompletionGate", () => {
  it("passes when all required stages have evidence and no defects remain", () => {
    const report = evaluateCompletionGate({
      subject: "PR #123",
      pr: "123",
      stages: passingStages(),
      defects: [],
    });

    expect(report.schema).toBe("shirube-completion-gate-report/v1");
    expect(report.verdict).toBe("PASS");
    expect(report.can_pass).toBe(true);
    expect(report.required_stage_ids).not.toContain("live_processing");
  });

  it("fails closed when a blocking defect is present", () => {
    const report = evaluateCompletionGate({
      subject: "PR #124",
      stages: passingStages(),
      defects: [
        {
          id: "runtime-regression",
          classification: "blocking",
          summary: "Touched-surface regression prevents required live evidence.",
          evidence_refs: ["https://github.example/pr/124#discussion_r1"],
        },
      ],
    });

    expect(report.verdict).toBe("FAIL");
    expect(report.can_pass).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain("blocking_defect_runtime-regression");
  });

  it("blocks PASS when required stage evidence is missing", () => {
    const stages = passingStages()!;
    stages.audit = { status: "pass", evidence_refs: [] };

    const report = evaluateCompletionGate({
      subject: "PR #125",
      stages,
      defects: [],
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.can_pass).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain("missing_audit_evidence");
  });

  it("requires live processing evidence only when live processing is applicable", () => {
    const report = evaluateCompletionGate({
      subject: "runtime PR",
      live_processing_applicable: true,
      stages: passingStages(),
      defects: [],
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.required_stage_ids).toContain("live_processing");
    expect(report.findings.map((finding) => finding.code)).toContain("missing_live_processing_stage");
  });

  it("returns conditional pass for accepted debt with owner, issue, severity, reason, due, and evidence", () => {
    const report = evaluateCompletionGate({
      subject: "PR #126",
      stages: passingStages(),
      defects: [
        {
          id: "docs-polish",
          classification: "accepted_debt",
          summary: "Follow-up wording polish for runbook examples.",
          owner: "adf-lead",
          issue: "https://github.com/watchout/ai-dev-framework/issues/999",
          severity: "low",
          reason: "Does not affect completion gate behavior.",
          due: "before public docs launch",
          evidence_refs: ["https://github.com/watchout/ai-dev-framework/pull/126#issuecomment-1"],
        },
      ],
    });

    expect(report.verdict).toBe("CONDITIONAL PASS");
    expect(report.can_pass).toBe(true);
    expect(report.findings.map((finding) => finding.code)).toContain("accepted_debt_docs-polish_recorded");
  });

  it("blocks accepted debt without required metadata", () => {
    const report = evaluateCompletionGate({
      subject: "PR #127",
      stages: passingStages(),
      defects: [
        {
          id: "unknown-risk",
          classification: "accepted_debt",
          summary: "Debt without an owner or follow-up.",
        },
      ],
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.can_pass).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain(
      "accepted_debt_unknown-risk_missing_metadata",
    );
  });

  it("blocks material out-of-scope defects without a follow-up link", () => {
    const report = evaluateCompletionGate({
      subject: "PR #128",
      stages: passingStages(),
      defects: [
        {
          id: "adjacent-timeout",
          classification: "out_of_scope",
          summary: "Adjacent timeout discovered during QA.",
          material: true,
          evidence_refs: ["https://github.com/watchout/ai-dev-framework/issues/128#issuecomment-1"],
        },
      ],
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.findings.map((finding) => finding.code)).toContain(
      "out_of_scope_adjacent-timeout_missing_metadata",
    );
  });
});

describe("renderCompletionGateReport", () => {
  it("renders a human-readable PR evidence report", () => {
    const report = evaluateCompletionGate({
      subject: "PR #129",
      pr: "129",
      stages: passingStages(),
      defects: [],
    });

    const output = renderCompletionGateReport(report);
    expect(output).toContain("Completion Gate Report");
    expect(output).toContain("Verdict: PASS");
    expect(output).toContain("Scope Gate");
    expect(output).toContain("Next required review");
  });
});

function passingStages(): CompletionGateInput["stages"] {
  const stageIds: CompletionGateStageId[] = [
    "scope",
    "contract",
    "implementation_evidence",
    "audit",
    "qa_check",
  ];

  return Object.fromEntries(
    stageIds.map((stageId) => [
      stageId,
      {
        status: "pass",
        evidence_refs: [`https://github.com/watchout/ai-dev-framework/pull/1#${stageId}`],
      },
    ]),
  ) as CompletionGateInput["stages"];
}
