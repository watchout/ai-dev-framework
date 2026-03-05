/**
 * Tests for feedback-model.ts
 */
import { describe, it, expect } from "vitest";
import type {
  Proposal,
  ProposalStore,
  ProposalCategory,
  ProposalStatus,
  ApprovalRequest,
  ApprovalStore,
  AutoFeedbackContext,
  AutoFeedbackTrigger,
  LessonEntry,
} from "./feedback-model.js";

describe("feedback-model types", () => {
  it("ProposalCategory covers all expected values", () => {
    const categories: ProposalCategory[] = [
      "coding-rule",
      "ssot-template",
      "skill",
      "gate",
      "workflow",
    ];
    expect(categories).toHaveLength(5);
  });

  it("ProposalStatus covers all expected values", () => {
    const statuses: ProposalStatus[] = ["pending", "approved", "rejected"];
    expect(statuses).toHaveLength(3);
  });

  it("Proposal interface has all required fields", () => {
    const proposal: Proposal = {
      id: "PROP-001",
      createdAt: "2026-03-03T00:00:00.000Z",
      sourceProject: "test-project",
      category: "gate",
      title: "Add Gate D",
      problem: "Gate D is missing",
      proposedChange: {
        target: "src/cli/lib/gate-engine.ts",
        diff: "// new gate logic",
      },
      impact: "Improves quality checks",
      status: "pending",
      approvedAt: null,
      rejectedReason: null,
    };
    expect(proposal.id).toBe("PROP-001");
    expect(proposal.proposedChange.target).toBe("src/cli/lib/gate-engine.ts");
    expect(proposal.proposedChange.diff).toBe("// new gate logic");
    expect(proposal.approvedAt).toBeNull();
    expect(proposal.rejectedReason).toBeNull();
  });

  it("ProposalStore wraps an array of proposals", () => {
    const store: ProposalStore = {
      proposals: [
        {
          id: "PROP-001",
          createdAt: "2026-03-03T00:00:00.000Z",
          sourceProject: "proj-a",
          category: "skill",
          title: "Improve skill",
          problem: "Skill lacks coverage",
          proposedChange: { target: "skills/x.md", diff: "+ new content" },
          impact: "Better skill quality",
          status: "pending",
          approvedAt: null,
          rejectedReason: null,
        },
      ],
    };
    expect(store.proposals).toHaveLength(1);
    expect(store.proposals[0].category).toBe("skill");
  });

  it("approved proposal has approvedAt set", () => {
    const proposal: Proposal = {
      id: "PROP-002",
      createdAt: "2026-03-03T00:00:00.000Z",
      sourceProject: "proj-b",
      category: "workflow",
      title: "Fix workflow",
      problem: "Workflow broken",
      proposedChange: { target: "specs/01.md", diff: "fix" },
      impact: "Smoother workflow",
      status: "approved",
      approvedAt: "2026-03-03T12:00:00.000Z",
      rejectedReason: null,
    };
    expect(proposal.status).toBe("approved");
    expect(proposal.approvedAt).not.toBeNull();
  });

  it("rejected proposal has rejectedReason set", () => {
    const proposal: Proposal = {
      id: "PROP-003",
      createdAt: "2026-03-03T00:00:00.000Z",
      sourceProject: "proj-c",
      category: "coding-rule",
      title: "Add rule",
      problem: "Rule missing",
      proposedChange: { target: "rules.md", diff: "rule" },
      impact: "Better code quality",
      status: "rejected",
      approvedAt: null,
      rejectedReason: "Not applicable to current version",
    };
    expect(proposal.status).toBe("rejected");
    expect(proposal.rejectedReason).toBe("Not applicable to current version");
  });

  it("ApprovalRequest interface has all required fields", () => {
    const request: ApprovalRequest = {
      proposalId: "PROP-001",
      requestedAt: "2026-03-05T00:00:00.000Z",
      status: "awaiting",
      respondedAt: null,
      channel: "telegram",
    };
    expect(request.proposalId).toBe("PROP-001");
    expect(request.status).toBe("awaiting");
    expect(request.channel).toBe("telegram");
  });

  it("ApprovalStore wraps pending requests", () => {
    const store: ApprovalStore = {
      pending: [
        {
          proposalId: "PROP-001",
          requestedAt: "2026-03-05T00:00:00.000Z",
          status: "awaiting",
          respondedAt: null,
          channel: "telegram",
        },
      ],
    };
    expect(store.pending).toHaveLength(1);
  });

  it("AutoFeedbackTrigger covers expected values", () => {
    const triggers: AutoFeedbackTrigger[] = ["run-failure", "audit-low-score"];
    expect(triggers).toHaveLength(2);
  });

  it("AutoFeedbackContext has optional fields", () => {
    const context: AutoFeedbackContext = {
      trigger: "run-failure",
      errorMessage: "TypeError: x is not a function",
    };
    expect(context.trigger).toBe("run-failure");
    expect(context.taskId).toBeUndefined();
    expect(context.auditScore).toBeUndefined();
  });

  it("LessonEntry has all required fields", () => {
    const entry: LessonEntry = {
      date: "2026-03-05",
      proposalId: "PROP-001",
      category: "coding-rule",
      title: "Add type guard",
      problem: "TypeError detected",
      solution: "// add type guard",
      sourceProject: "test-project",
    };
    expect(entry.category).toBe("coding-rule");
    expect(entry.proposalId).toBe("PROP-001");
  });
});
