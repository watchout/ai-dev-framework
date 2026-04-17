/**
 * migrate command — Migrate local state files to GitHub Issues
 *
 * Part of ADF overhaul #61 sub-PR 2/7.
 *
 * Usage:
 *   framework migrate plan-state            # dry-run (default)
 *   framework migrate plan-state --apply    # create Issues + backup local files
 */
import type { Command } from "commander";
import {
  analyzeMigration,
  executeMigration,
  findAlreadyMigrated,
  formatDryRunReport,
  formatApplyResult,
} from "../lib/migrate-engine.js";
import { checkGhEnvironment } from "../lib/task-state.js";

export function registerMigrateCommand(program: Command): void {
  const migrate = program
    .command("migrate")
    .description("Migrate local state files to GitHub Issues");

  migrate
    .command("plan-state")
    .description(
      "Migrate .framework/plan.json features/tasks to GitHub Issues (run-state.json is backed up only)",
    )
    .option("--apply", "Execute migration (default: dry-run)")
    .option("--force", "Allow migration even if plan.json is empty/template-only")
    .action(
      async (options: { apply?: boolean; force?: boolean }) => {
        const projectDir = process.cwd();

        // Check for already-migrated Issues (idempotent: skip duplicates)
        const alreadyMigrated = await findAlreadyMigrated();
        const report = analyzeMigration(projectDir, alreadyMigrated);

        if (!options.apply) {
          console.log(formatDryRunReport(report));
          console.log(
            "\nThis was a dry-run. To execute, run: framework migrate plan-state --apply",
          );
          return;
        }

        // --apply mode: verify gh environment first
        const ghCheck = await checkGhEnvironment();
        if (!ghCheck.ok) {
          console.error("❌ gh CLI environment check failed:");
          for (const err of ghCheck.errors) {
            console.error(`  ${err}`);
          }
          console.error(
            "\nPlease install and authenticate gh CLI before migrating.",
          );
          process.exit(1);
        }

        if (report.planFile.isEmpty && !options.force) {
          console.log(
            "plan.json is empty or template-only. No real data to migrate.",
          );
          console.log(
            "To proceed anyway, run: framework migrate plan-state --apply --force",
          );
          return;
        }

        if (report.toCreate.length === 0) {
          console.log("Nothing to migrate (all items are boilerplate or files not found).");
          return;
        }

        console.log(
          `Migrating ${report.toCreate.length} items to GitHub Issues...`,
        );
        const result = await executeMigration(projectDir, report);
        console.log(formatApplyResult(result));

        if (result.errors.length > 0) {
          process.exit(1);
        }
      },
    );
}
