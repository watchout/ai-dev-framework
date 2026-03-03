/**
 * Feedback model - Types for framework feedback proposals
 *
 * Proposals capture improvement suggestions from projects
 * and store them in .framework/feedback/proposals.json.
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ProposalCategory =
  | "coding-rule"
  | "ssot-template"
  | "skill"
  | "gate"
  | "workflow";

export type ProposalStatus = "pending" | "approved" | "rejected";

export interface Proposal {
  id: string;
  createdAt: string;
  sourceProject: string;
  category: ProposalCategory;
  title: string;
  problem: string;
  proposedChange: {
    target: string;
    diff: string;
  };
  impact: string;
  status: ProposalStatus;
  approvedAt: string | null;
  rejectedReason: string | null;
}

export interface ProposalStore {
  proposals: Proposal[];
}
