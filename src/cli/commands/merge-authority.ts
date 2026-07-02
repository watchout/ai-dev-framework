import { type Command } from "commander";
import * as fs from "node:fs";
import { detectRepoSlug } from "../lib/github-model.js";
import { fetchMergeAuthorityData } from "../lib/github-reviews.js";
import { loadFrameworkConfig } from "../lib/workflow-config.js";
import { evaluateMergeAuthority } from "../lib/merge-authority.js";
import { logger } from "../lib/logger.js";

interface MergeAuthorityOptions {
  repo?: string;
  pr?: string;
  auditLevel?: string;
  json?: boolean;
}

export function registerMergeAuthorityCommand(program: Command): void {
  program
    .command("merge-authority")
    .description("Evaluate Shirube merge authority for a GitHub pull request")
    .option("--repo <owner/repo>", "GitHub repository slug")
    .option("--pr <number>", "Pull request number")
    .option("--audit-level <level>", "Audit level (minimal|standard|strict)", "strict")
    .option("--json", "Print machine-readable JSON")
    .action(async (options: MergeAuthorityOptions) => {
      try {
        const result = await runMergeAuthority(process.cwd(), options);
        if (!result) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          console.log(JSON.stringify({ status: "block", reason: "error", details: [message] }, null, 2));
        } else {
          logger.error(message);
        }
        process.exit(1);
      }
    });
}

export async function runMergeAuthority(
  projectDir: string,
  options: MergeAuthorityOptions,
): Promise<boolean> {
  const repo = options.repo ?? await detectRepoSlug(projectDir);
  if (!repo) {
    throw new Error("GitHub repository could not be resolved. Pass --repo <owner/repo>.");
  }
  const prNumber = parsePullRequestNumber(options.pr ?? readPullRequestNumberFromEvent());
  const config = loadFrameworkConfig(projectDir);
  const data = await fetchMergeAuthorityData(repo, prNumber);
  const decision = evaluateMergeAuthority({
    config,
    pullRequest: data.pullRequest,
    reviews: data.reviews,
    ownerDecisionComments: data.ownerDecisionComments,
    auditLevel: options.auditLevel ?? "strict",
  });

  if (options.json) {
    console.log(JSON.stringify(decision, null, 2));
  } else {
    printDecision(decision);
  }
  return decision.status === "pass";
}

function printDecision(decision: ReturnType<typeof evaluateMergeAuthority>): void {
  logger.header("Shirube Merge Authority");
  if (decision.status === "pass") {
    logger.success("Merge authority evidence is valid.");
    for (const item of decision.required) {
      logger.info(`  ${item.role}: ${item.githubIdentity}`);
    }
    return;
  }

  logger.error(`Merge authority blocked: ${decision.reason}`);
  for (const detail of decision.details) {
    logger.info(`  - ${detail}`);
  }
  for (const item of decision.missing) {
    logger.info(`  Missing: ${item.role}`);
  }
}

function parsePullRequestNumber(value: string | null): number {
  const number = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("Pull request number could not be resolved. Pass --pr <number>.");
  }
  return number;
}

function readPullRequestNumberFromEvent(): string | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(eventPath, "utf-8")) as {
    pull_request?: { number?: number };
    number?: number;
  };
  return String(parsed.pull_request?.number ?? parsed.number ?? "");
}
