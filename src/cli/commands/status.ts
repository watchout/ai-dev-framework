/**
 * shirube status - Display project progress
 *
 * Reference: SSOT-3 §2.7, SSOT-2 §4.1-4.2
 *
 * Aggregates state from all pipeline stages and displays:
 * - Current phase and overall progress
 * - Document completeness percentages
 * - Task execution states
 * - Recent audit scores
 */
import * as fs from "node:fs";
import { type Command } from "commander";
import {
  collectStatus,
  enrichTasksFromGitHub,
  printStatus,
  createStatusTerminalIO,
} from "../lib/status-engine.js";
import {
  buildProgressSnapshotFromStatusResult,
  renderProgressSnapshotCompactText,
  renderProgressSnapshotJapaneseAdmin,
  renderProgressSnapshotJson,
  renderProgressSnapshotMarkdown,
} from "../lib/progress-view.js";
import { syncRunStateFromGitHub } from "../lib/run-engine.js";
import { logger } from "../lib/logger.js";

type ProgressFormat = "ja-compact" | "ja-long" | "compact" | "markdown" | "json";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show project progress and status")
    .option("--github", "Fetch live status from GitHub Issues")
    .option("--json", "Output machine-readable JSON")
    .option("--progress-view", "Output a report-time progress snapshot")
    .option(
      "--progress-format <format>",
      "Progress snapshot format: ja-compact, ja-long, compact, markdown, json",
      "ja-compact",
    )
    .action(async (options: {
      github?: boolean;
      json?: boolean;
      progressView?: boolean;
      progressFormat?: ProgressFormat;
    }) => {
      const projectDir = process.cwd();

      try {
        const frameworkDir = `${projectDir}/.framework`;
        if (!fs.existsSync(frameworkDir)) {
          logger.error(
            "Not a framework project. Run 'shirube init' or 'shirube retrofit' first.",
          );
          process.exit(1);
        }

        // Check for project.json (required for status to work correctly)
        const projectJsonPath = `${frameworkDir}/project.json`;
        if (!fs.existsSync(projectJsonPath)) {
          logger.error(
            "Missing .framework/project.json. Run 'shirube retrofit' again to generate it.",
          );
          process.exit(1);
        }

        const io = createStatusTerminalIO();
        const result = await collectStatus(projectDir);

        // Enrich tasks from GitHub if sync state exists
        if (result.tasks.length > 0 || options.github) {
          const enriched = await enrichTasksFromGitHub(
            result.tasks,
            projectDir,
            options.github ?? false,
          );
          if (enriched.ghSynced) {
            result.tasks = enriched.tasks;
          }
        }

        // Writeback: persist GitHub statuses to run-state.json
        if (options.github) {
          const wb = await syncRunStateFromGitHub(projectDir);
          if (wb.updated > 0 || wb.created) {
            if (!options.json) {
              io.print(`  GitHub writeback: ${wb.updated} tasks updated${wb.created ? " (run-state.json created)" : ""}`);
            }
            // Re-collect to show updated state
            const refreshed = await collectStatus(projectDir);
            result.currentPhase = refreshed.currentPhase;
            result.phaseLabel = refreshed.phaseLabel;
            result.overallProgress = refreshed.overallProgress;
            result.profile = refreshed.profile;
            result.gates = refreshed.gates;
            result.phases = refreshed.phases;
            result.documents = refreshed.documents;
            result.tasks = refreshed.tasks;
            result.execution = refreshed.execution;
            result.audits = refreshed.audits;
          }
        }

        if (options.progressView) {
          const progressFormat = parseProgressFormat(
            options.progressFormat ?? "ja-compact",
          );
          const snapshot = buildProgressSnapshotFromStatusResult(
            result.profile?.type ?? "project",
            result,
          );
          process.stdout.write(renderProgressSnapshot(snapshot, progressFormat));
          return;
        }

        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          return;
        }

        printStatus(io, result);
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });
}

function parseProgressFormat(format: string): ProgressFormat {
  const allowed: ProgressFormat[] = [
    "ja-compact",
    "ja-long",
    "compact",
    "markdown",
    "json",
  ];
  if (allowed.includes(format as ProgressFormat)) {
    return format as ProgressFormat;
  }
  throw new Error(
    `Invalid --progress-format "${format}". Expected one of: ${allowed.join(", ")}`,
  );
}

function renderProgressSnapshot(
  snapshot: ReturnType<typeof buildProgressSnapshotFromStatusResult>,
  format: ProgressFormat,
): string {
  switch (format) {
    case "ja-compact":
      return renderProgressSnapshotJapaneseAdmin(snapshot);
    case "ja-long":
      return renderProgressSnapshotJapaneseAdmin(snapshot, { mode: "long" });
    case "compact":
      return renderProgressSnapshotCompactText(snapshot);
    case "markdown":
      return renderProgressSnapshotMarkdown(snapshot);
    case "json":
      return renderProgressSnapshotJson(snapshot);
  }
}
