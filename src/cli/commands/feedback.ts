/**
 * framework feedback - Framework feedback management command
 *
 * Subcommands:
 *   framework feedback list                  - List pending proposals
 *   framework feedback approve <id>          - Approve a proposal
 *   framework feedback reject <id> [--reason] - Reject a proposal
 *   framework feedback propose [options]     - Create a new proposal
 */
import { type Command } from "commander";
import type { ProposalCategory } from "../lib/feedback-model.js";
import {
  loadProposals,
  saveProposals,
  listPendingProposals,
  approveProposal,
  rejectProposal,
  notifyProposal,
  requestApproval,
  pushToUpstream,
  appendLessonLearned,
} from "../lib/feedback-engine.js";
import { logger } from "../lib/logger.js";

export function registerFeedbackCommand(program: Command): void {
  const feedback = program
    .command("feedback")
    .description("Framework feedback management (propose, list, approve, reject)");

  // framework feedback list
  feedback
    .command("list")
    .description("List pending proposals")
    .action(() => {
      try {
        const projectDir = process.cwd();
        const proposals = listPendingProposals(projectDir);

        if (proposals.length === 0) {
          logger.info("No pending proposals found.");
          return;
        }

        logger.header("Pending Proposals");
        logger.info("");

        for (const p of proposals) {
          logger.info(`  [${p.category}] ${p.id}  ${p.title}`);
          logger.dim(`      Problem: ${p.problem}`);
          logger.dim(`      Target:  ${p.proposedChange.target}`);
        }

        logger.info("");
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework feedback approve <id> [--push-upstream] [--telegram]
  feedback
    .command("approve")
    .description("Approve a proposal by ID (applies diff and commits)")
    .argument("<id>", "Proposal ID")
    .option("--push-upstream", "Create PR in ai-dev-framework repository")
    .option("--telegram", "Request approval via Telegram before applying")
    .action((id: string, options: { pushUpstream?: boolean; telegram?: boolean }) => {
      try {
        const projectDir = process.cwd();

        // If --telegram, request approval via Telegram and return
        if (options.telegram) {
          const reqResult = requestApproval(projectDir, id);
          if (!reqResult.ok) {
            logger.error(reqResult.error ?? "Unknown error");
            process.exit(1);
            return;
          }
          logger.success(`Approval request sent via Telegram: ${id}`);
          return;
        }

        const result = approveProposal(projectDir, id);

        if (!result.ok) {
          logger.error(result.error ?? "Unknown error");
          process.exit(1);
          return;
        }

        logger.success(`Approved: ${id}`);

        // Append to lessons learned
        const store = loadProposals(projectDir);
        const proposal = store.proposals.find((p) => p.id === id);
        if (proposal) {
          appendLessonLearned(projectDir, proposal);
          logger.info("  Lesson recorded in docs/knowledge/lessons-learned.md");
        }

        // Push upstream if requested
        if (options.pushUpstream) {
          logger.info("  Creating upstream PR...");
          const prResult = pushToUpstream(projectDir, id);
          if (prResult.ok) {
            logger.success(`  PR created: ${prResult.prUrl ?? "(url pending)"}`);
          } else {
            logger.warn(`  Upstream PR failed: ${prResult.error ?? "unknown"}`);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework feedback reject <id> [--reason]
  feedback
    .command("reject")
    .description("Reject a proposal by ID")
    .argument("<id>", "Proposal ID")
    .option("--reason <reason>", "Reason for rejection")
    .action((id: string, options: { reason?: string }) => {
      try {
        const projectDir = process.cwd();
        const result = rejectProposal(projectDir, id, options.reason);

        if (!result.ok) {
          logger.error(result.error ?? "Unknown error");
          process.exit(1);
          return;
        }

        logger.success(`Rejected: ${id}`);
        if (options.reason) {
          logger.info(`  Reason: ${options.reason}`);
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework feedback propose
  feedback
    .command("propose")
    .description("Create a new improvement proposal")
    .requiredOption("--title <title>", "Proposal title")
    .requiredOption("--problem <problem>", "Problem description")
    .requiredOption("--target <target>", "Target file path for the change")
    .requiredOption("--diff <diff>", "Diff content to apply")
    .requiredOption("--impact <impact>", "Expected impact description")
    .requiredOption("--category <category>", "Category: coding-rule, ssot-template, skill, gate, workflow")
    .requiredOption("--source <source>", "Source project name")
    .action(
      (options: {
        title: string;
        problem: string;
        target: string;
        diff: string;
        impact: string;
        category: string;
        source: string;
      }) => {
        try {
          const projectDir = process.cwd();

          const validCategories: ProposalCategory[] = [
            "coding-rule",
            "ssot-template",
            "skill",
            "gate",
            "workflow",
          ];
          if (!validCategories.includes(options.category as ProposalCategory)) {
            logger.error(
              `Invalid category: ${options.category}. Must be one of: ${validCategories.join(", ")}`,
            );
            process.exit(1);
            return;
          }

          const store = loadProposals(projectDir);
          const id = `PROP-${Date.now()}`;

          const proposal = {
            id,
            createdAt: new Date().toISOString(),
            sourceProject: options.source,
            category: options.category as ProposalCategory,
            title: options.title,
            problem: options.problem,
            proposedChange: {
              target: options.target,
              diff: options.diff,
            },
            impact: options.impact,
            status: "pending" as const,
            approvedAt: null,
            rejectedReason: null,
          };

          store.proposals.push(proposal);
          saveProposals(projectDir, store);

          notifyProposal(proposal);

          logger.success(`Proposal created: ${id}`);
          logger.info(`  Title:    ${proposal.title}`);
          logger.info(`  Category: ${proposal.category}`);
          logger.info(`  Target:   ${proposal.proposedChange.target}`);
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}
