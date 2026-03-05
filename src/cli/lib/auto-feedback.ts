/**
 * Auto-feedback engine - Automatically generates improvement proposals
 * from error patterns detected during `framework run` failures and
 * `framework audit` low scores.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Proposal,
  ProposalCategory,
  AutoFeedbackContext,
} from "./feedback-model.js";
import { loadProposals, saveProposals, notifyProposal } from "./feedback-engine.js";

// ─────────────────────────────────────────────
// Error Pattern Detection
// ─────────────────────────────────────────────

interface ErrorPattern {
  pattern: RegExp;
  category: ProposalCategory;
  titleTemplate: string;
  problemTemplate: string;
  targetTemplate: string;
  diffTemplate: string;
  impactTemplate: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /TypeError:.*is not a function/i,
    category: "coding-rule",
    titleTemplate: "Add type guard for function calls",
    problemTemplate: "TypeError detected: {message}",
    targetTemplate: "docs/knowledge/lessons-learned.md",
    diffTemplate: "## Type Safety\n- Always validate function references before calling",
    impactTemplate: "Prevents runtime TypeError in similar scenarios",
  },
  {
    pattern: /Cannot read propert(y|ies) of (undefined|null)/i,
    category: "coding-rule",
    titleTemplate: "Add null check pattern",
    problemTemplate: "Null/undefined access: {message}",
    targetTemplate: "docs/knowledge/lessons-learned.md",
    diffTemplate: "## Null Safety\n- Use optional chaining (?.) for potentially null references",
    impactTemplate: "Prevents null access errors across codebase",
  },
  {
    pattern: /ENOENT.*no such file or directory/i,
    category: "workflow",
    titleTemplate: "Add file existence check in workflow",
    problemTemplate: "Missing file error: {message}",
    targetTemplate: "docs/knowledge/lessons-learned.md",
    diffTemplate: "## File System\n- Always check file existence before operations",
    impactTemplate: "Improves robustness of file-based workflows",
  },
  {
    pattern: /Gate [ABC] failed/i,
    category: "gate",
    titleTemplate: "Gate failure pattern detected",
    problemTemplate: "Gate check failed: {message}",
    targetTemplate: "docs/knowledge/lessons-learned.md",
    diffTemplate: "## Gate Compliance\n- Ensure all gate prerequisites are met before proceeding",
    impactTemplate: "Reduces gate failure frequency",
  },
  {
    pattern: /SSOT.*missing|§\d.*not found/i,
    category: "ssot-template",
    titleTemplate: "SSOT section coverage gap",
    problemTemplate: "SSOT reference missing: {message}",
    targetTemplate: "docs/knowledge/lessons-learned.md",
    diffTemplate: "## SSOT Completeness\n- Verify all required SSOT sections before implementation",
    impactTemplate: "Improves SSOT coverage and traceability",
  },
];

// ─────────────────────────────────────────────
// Proposal Generation
// ─────────────────────────────────────────────

/**
 * Detect matching error patterns from the given context.
 * Returns matching patterns (may be multiple).
 */
export function detectErrorPatterns(
  context: AutoFeedbackContext,
): ErrorPattern[] {
  if (!context.errorMessage) return [];
  return ERROR_PATTERNS.filter((p) => p.pattern.test(context.errorMessage!));
}

/**
 * Generate a proposal from an auto-feedback context.
 * Returns null if no matching error pattern is found.
 */
export function generateAutoProposal(
  context: AutoFeedbackContext,
  sourceProject: string,
): Proposal | null {
  const patterns = detectErrorPatterns(context);
  if (patterns.length === 0 && context.trigger !== "audit-low-score") {
    return null;
  }

  // For audit-low-score, generate a generic proposal
  if (context.trigger === "audit-low-score" && patterns.length === 0) {
    return {
      id: `AUTO-${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceProject,
      category: "workflow",
      title: `Audit score below threshold (${context.auditScore ?? "N/A"}/100)`,
      problem: `Audit score ${context.auditScore ?? "N/A"}/100 detected${context.taskId ? ` for task ${context.taskId}` : ""}`,
      proposedChange: {
        target: "docs/knowledge/lessons-learned.md",
        diff: `## Audit Quality\n- Review audit findings and address recurring deductions\n- Score: ${context.auditScore ?? "N/A"}/100`,
      },
      impact: "Improves overall code quality and audit pass rates",
      status: "pending",
      approvedAt: null,
      rejectedReason: null,
    };
  }

  const matched = patterns[0];
  const message = context.errorMessage ?? "unknown error";

  return {
    id: `AUTO-${Date.now()}`,
    createdAt: new Date().toISOString(),
    sourceProject,
    category: matched.category,
    title: matched.titleTemplate,
    problem: matched.problemTemplate.replace("{message}", message),
    proposedChange: {
      target: matched.targetTemplate,
      diff: matched.diffTemplate,
    },
    impact: matched.impactTemplate,
    status: "pending",
    approvedAt: null,
    rejectedReason: null,
  };
}

/**
 * Process an auto-feedback context: detect errors, generate proposal,
 * save it, and notify. Returns the created proposal or null.
 */
export function processAutoFeedback(
  projectDir: string,
  context: AutoFeedbackContext,
  sourceProject: string,
): Proposal | null {
  const proposal = generateAutoProposal(context, sourceProject);
  if (!proposal) return null;

  // Check for duplicate proposals (same title from same project within 24h)
  const store = loadProposals(projectDir);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const isDuplicate = store.proposals.some(
    (p) =>
      p.title === proposal.title &&
      p.sourceProject === sourceProject &&
      p.createdAt > dayAgo,
  );

  if (isDuplicate) return null;

  store.proposals.push(proposal);
  saveProposals(projectDir, store);
  notifyProposal(proposal);

  return proposal;
}
