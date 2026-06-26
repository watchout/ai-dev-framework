import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNextActionSequencing } from "../../scripts/shirube/next-action-sequencing.mjs";

const head = "1111111111111111111111111111111111111111";

function auditReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "shirube-audit-checklist-check/v1",
    generated_by: "scripts/shirube/check-audit-checklist.mjs",
    trusted_checker: true,
    verdict: "PASS",
    pr_head_sha: head,
    target_repo: "watchout/agent-memory",
    target_pr: 213,
    structured_audit_ref: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
    inventory: {
      checklist_items: 11,
      audit_items: 11,
    },
    blockers: [],
    warnings: [],
    ...overrides,
  };
}

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "shirube-comment-backed-audit-source/v1",
    generated_by: "scripts/shirube/resolve-structured-audit-ref.mjs",
    resolver_schema: "shirube-structured-audit-ref-resolution/v1",
    source_type: "github_pr_comment",
    source_comment_url: "https://github.com/watchout/agent-memory/pull/213#issuecomment-1",
    materialized_path: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
    target_repo: "watchout/agent-memory",
    target_pr: 213,
    exact_head_sha: head,
    trusted_base_workflow: true,
    target_branch_mutated: false,
    owner_approval_synthesized: false,
    ...overrides,
  };
}

function structuredAudit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "shirube-structured-audit/v1",
    target_repo: "watchout/agent-memory",
    target_pr: 213,
    exact_head_sha: head,
    reviewer_actor: "codex-audit",
    implementation_actor: "codex-adf",
    items: Array.from({ length: 11 }, (_, index) => ({
      item_id: `AUDIT-${String(index + 1).padStart(3, "0")}`,
      result: "PASS",
      evidence_refs: ["machine-evidence"],
      confidence: "high",
      notes: "Verified.",
    })),
    ...overrides,
  };
}

function owner(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "shirube-owner-decision/v1",
    decision: "APPROVED_EXACT_HEAD",
    approval_granted: true,
    exact_head_sha: head,
    ...overrides,
  };
}

const requiredHandoff = {
  audit_required: true,
  cell: {
    "CELL-ID": "CELL-ADF-AUDIT-SEQUENCE-001",
    risk_class: "R3",
  },
};

function sequence(input: Record<string, unknown> = {}) {
  return buildNextActionSequencing({
    handoff: requiredHandoff,
    actualRepo: "watchout/agent-memory",
    actualPr: 213,
    actualHead: head,
    ...input,
  });
}

describe("Shirube audit/owner next-action sequencing", () => {
  it("requests independent audit when audit is required and no audit exists", () => {
    const result = sequence();

    expect(result.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
    expect(result.merge_ready_allowed).toBe(false);
    expect(result.forbidden_next_actions).toContain("owner_exact_head_approval");
  });

  it("does not allow owner approval when machine-readable audit is missing", () => {
    const result = sequence({ structuredAudit: { pr_head_sha: head } });

    expect(result.audit_completion.machine_readable).toBe(false);
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("does not treat PR-body audit alone as independent completion", () => {
    const result = sequence({ auditChecklistReport: auditReport() });

    expect(result.audit_completion.machine_readable).toBe(true);
    expect(result.audit_completion.independent).toBe(false);
    expect(result.audit_completion.complete).toBe(false);
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("does not trust self-reported audit_completion booleans without observable evidence", () => {
    const result = sequence({
      auditChecklistReport: {
        schema: "shirube-audit-checklist-check/v1",
        verdict: "PASS",
        blockers: [],
        warnings: [],
        audit_completion: {
          machine_readable: true,
          independent: true,
          exact_head_matches: true,
          target_repo_matches: true,
          target_pr_matches: true,
          required_items_answered: true,
          complete: true,
        },
      },
    });

    expect(result.audit_completion.complete).toBe(false);
    expect(result.audit_completion.independent).toBe(false);
    expect(result.audit_completion.observed_head).toBeNull();
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
    expect(result.merge_ready_allowed).toBe(false);
  });

  it("does not trust self-reported independence without a trusted source", () => {
    const result = sequence({
      auditChecklistReport: auditReport({
        audit_completion: {
          independent: true,
          exact_head_matches: true,
          target_repo_matches: true,
          target_pr_matches: true,
          required_items_answered: true,
        },
      }),
    });

    expect(result.audit_completion.exact_head_matches).toBe(true);
    expect(result.audit_completion.target_repo_matches).toBe(true);
    expect(result.audit_completion.target_pr_matches).toBe(true);
    expect(result.audit_completion.independent).toBe(false);
    expect(result.audit_completion.complete).toBe(false);
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("does not combine current-head report fields with mismatched source provenance", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      auditSource: source({
        target_pr: 212,
        source_comment_url: "https://github.com/watchout/agent-memory/pull/212#issuecomment-1",
      }),
    });

    expect(result.audit_completion.exact_head_matches).toBe(true);
    expect(result.audit_completion.target_repo_matches).toBe(true);
    expect(result.audit_completion.target_pr_matches).toBe(true);
    expect(result.audit_completion.source_pr_matches).toBe(false);
    expect(result.audit_completion.independent).toBe(false);
    expect(result.audit_completion.complete).toBe(false);
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("does not combine current-head report fields with unbound source materialized path", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      structuredAudit: structuredAudit(),
      structuredAuditPath: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      auditSource: source({
        materialized_path: "test/fixtures/shirube/audit-checklist/other-audit.yaml",
      }),
    });

    expect(result.audit_completion.source_materialized_path_matches).toBe(false);
    expect(result.audit_completion.independent).toBe(false);
    expect(result.audit_completion.complete).toBe(false);
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("does not trust self-asserted github comment source metadata without resolver provenance", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      structuredAudit: structuredAudit(),
      structuredAuditPath: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      auditSource: source({
        generated_by: undefined,
        resolver_schema: undefined,
      }),
    });

    expect(result.audit_completion.trusted_source).toBe(false);
    expect(result.audit_completion.independent).toBe(false);
    expect(result.audit_completion.complete).toBe(false);
    expect(result.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("does not complete audit when structured audit violates maker checker separation", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      structuredAudit: structuredAudit({ reviewer_actor: "codex-adf", implementation_actor: "codex-adf" }),
      structuredAuditPath: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      auditSource: source(),
    });

    expect(result.audit_completion.maker_checker_separated).toBe(false);
    expect(result.audit_completion.complete).toBe(false);
    expect(result.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
  });

  it("requests owner exact-head decision only after independent audit completion", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      structuredAudit: structuredAudit(),
      structuredAuditPath: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      auditSource: source(),
    });

    expect(result.current_phase).toBe("OWNER_DECISION_REQUIRED");
    expect(result.next_action.action).toBe("request_owner_exact_head_decision");
    expect(result.owner_approval_allowed).toBe(true);
    expect(result.merge_ready_allowed).toBe(false);
  });

  it("blocks owner approval posted before independent audit completion", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      ownerDecision: owner(),
    });

    expect(result.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("OWNER-SEQ-001");
    expect(result.owner_approval_allowed).toBe(false);
    expect(result.merge_ready_allowed).toBe(false);
  });

  it("allows merge readiness after independent audit and exact-head owner approval", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      structuredAudit: structuredAudit(),
      structuredAuditPath: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      auditSource: source(),
      ownerDecision: owner(),
    });

    expect(result.current_phase).toBe("MERGE_READY");
    expect(result.owner_approval_allowed).toBe(true);
    expect(result.merge_ready_allowed).toBe(true);
    expect(result.forbidden_next_actions).toEqual([]);
  });

  it("keeps owner decision blocked on exact-head mismatch", () => {
    const result = sequence({
      auditChecklistReport: auditReport(),
      structuredAudit: structuredAudit(),
      structuredAuditPath: "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      auditSource: source(),
      ownerDecision: owner({ exact_head_sha: "2222222222222222222222222222222222222222" }),
    });

    expect(result.current_phase).toBe("OWNER_DECISION_REQUIRED");
    expect(result.owner_decision_status.head_mismatch).toBe(true);
    expect(result.merge_ready_allowed).toBe(false);
  });

  it("orders #515 YAML stubs as audit first and owner decision second", () => {
    const fixture = readFileSync(
      path.join(process.cwd(), "test/fixtures/shirube/next-action-sequencing/generated-stubs.sequence.yaml"),
      "utf8",
    );

    expect(fixture.indexOf("stub: structured_audit")).toBeLessThan(fixture.indexOf("stub: owner_exact_head_decision"));
    expect(fixture).toContain("requires:\n      - independent_audit_complete");
  });
});
