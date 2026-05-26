import type { Command } from "commander";
import {
  buildWorkflowState,
  type WorkflowProfile,
} from "../lib/workflow-state.js";
import {
  createWorkflowCheckReport,
  createWorkflowDoctorReport,
  explainWorkflowQuery,
  formatWorkflowDoctor,
  formatWorkflowExplanation,
  formatWorkflowStatus,
  type WorkflowCheckAction,
  type WorkflowCheckFailOn,
} from "../lib/workflow-observability.js";
import { logger } from "../lib/logger.js";

interface WorkflowOptions {
  json?: boolean;
  profile?: string;
  failOn?: string;
  action?: string;
  feature?: string;
}

export function registerWorkflowCommand(program: Command): void {
  const workflow = program
    .command("workflow")
    .description("Inspect Shirube workflow state without changing enforcement");

  workflow
    .command("status")
    .description("Show synthesized workflow-state/v1")
    .option("--json", "Output machine-readable JSON")
    .option("--profile <profile>", "Profile (minimal|standard|strict)")
    .option("--feature <id>", "Feature/task identifier for action-scoped evidence")
    .action((options: WorkflowOptions) => {
      runWorkflowAction(options, () => {
        const state = buildWorkflowState(process.cwd(), {
          profile: parseProfile(options.profile),
          feature: options.feature ?? null,
        });
        if (options.json) {
          process.stdout.write(JSON.stringify(state, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatWorkflowStatus(state) + "\n");
      });
    });

  workflow
    .command("doctor")
    .description("Summarize workflow findings and remediation")
    .option("--json", "Output machine-readable JSON")
    .option("--profile <profile>", "Profile (minimal|standard|strict)")
    .option("--feature <id>", "Feature/task identifier for action-scoped evidence")
    .action((options: WorkflowOptions) => {
      runWorkflowAction(options, () => {
        const state = buildWorkflowState(process.cwd(), {
          profile: parseProfile(options.profile),
          feature: options.feature ?? null,
        });
        const report = createWorkflowDoctorReport(state);
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatWorkflowDoctor(report) + "\n");
      });
    });

  workflow
    .command("check")
    .description("Fail when action-scoped workflow decisions cross a threshold")
    .option("--json", "Output machine-readable JSON")
    .option("--profile <profile>", "Profile (minimal|standard|strict)")
    .option("--feature <id>", "Feature/task identifier for action-scoped evidence")
    .option(
      "--action <action>",
      "Action to evaluate (design_draft|implementation_start|implementation_split|remote_publish|merge|release)",
    )
    .option("--fail-on <decision>", "Decision threshold (block|warn|observe)", "block")
    .action((options: WorkflowOptions) => {
      runWorkflowAction(options, () => {
        const state = buildWorkflowState(process.cwd(), {
          profile: parseProfile(options.profile),
          feature: options.feature ?? null,
        });
        const action = parseAction(options.action);
        const failOn = parseFailOn(options.failOn);
        const report = createWorkflowCheckReport(state, action, failOn);
        const failed = report.check.status === "failed";

        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else if (failed) {
          process.stdout.write(formatWorkflowDoctor(report) + "\n");
        } else {
          process.stdout.write(
            `Shirube Workflow Check: passed (${action})\n`,
          );
        }

        if (failed) {
          process.exitCode = 1;
        }
      });
    });

  workflow
    .command("explain")
    .description("Explain a workflow rule id, gate, decision, or action")
    .argument("<query>", "Rule id or action, such as G2.hearing.required_confirmation")
    .option("--json", "Output machine-readable JSON")
    .option("--profile <profile>", "Profile (minimal|standard|strict)")
    .option("--feature <id>", "Feature/task identifier for action-scoped evidence")
    .action((query: string, options: WorkflowOptions) => {
      runWorkflowAction(options, () => {
        const state = buildWorkflowState(process.cwd(), {
          profile: parseProfile(options.profile),
          feature: options.feature ?? null,
        });
        const explanation = explainWorkflowQuery(state, query);
        if (options.json) {
          process.stdout.write(JSON.stringify(explanation, null, 2) + "\n");
        } else {
          process.stdout.write(formatWorkflowExplanation(explanation) + "\n");
        }
        if (!explanation.found) {
          process.exitCode = 1;
        }
      });
    });
}

function runWorkflowAction(options: WorkflowOptions, action: () => void): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      process.stdout.write(
        JSON.stringify({ error: { message } }, null, 2) + "\n",
      );
    } else {
      logger.error(message);
    }
    process.exitCode = 1;
  }
}

function parseProfile(value: string | undefined): WorkflowProfile | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "minimal" || value === "standard" || value === "strict") {
    return value;
  }
  throw new Error(`Invalid workflow profile: ${value}`);
}

function parseFailOn(value: string | undefined): WorkflowCheckFailOn {
  if (!value || value === "block") {
    return "block";
  }
  if (value === "warn" || value === "observe") {
    return value;
  }
  throw new Error(`Invalid workflow check threshold: ${value}`);
}

function parseAction(value: string | undefined): WorkflowCheckAction {
  if (
    value === "design_draft" ||
    value === "implementation_start" ||
    value === "implementation_split" ||
    value === "remote_publish" ||
    value === "merge" ||
    value === "release"
  ) {
    return value;
  }
  throw new Error(
    `Invalid or missing workflow action: ${value ?? "(missing)"}`,
  );
}
