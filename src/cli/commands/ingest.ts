/**
 * framework ingest - Design Ingest Pipeline
 *
 * Reads design documents, uses AI to generate SSOT feature specs,
 * and integrates them into the development workflow.
 *
 * Usage:
 *   framework ingest [path]           Ingest design documents from path or docs/inbox/
 *   framework ingest --status         Show ingestion status
 *   framework ingest --approve [id]   Approve reviewed SSOTs and integrate into plan
 *   framework ingest --dry-run        Preview without writing files
 */
import { type Command } from "commander";
import {
  runIngest,
  approveIngest,
  printIngestStatus,
  createIngestTerminalIO,
} from "../lib/ingest-engine.js";
import { logger } from "../lib/logger.js";

export function registerIngestCommand(program: Command): void {
  program
    .command("ingest")
    .description(
      "Ingest design documents into SSOT feature specs and development plan",
    )
    .argument(
      "[path]",
      "Path to design document or directory (default: docs/inbox/)",
    )
    .option("--status", "Show ingestion status")
    .option("--approve [id]", "Approve reviewed documents and integrate into plan")
    .option("--dry-run", "Preview what would be generated without writing files")
    .action(
      async (
        inputPath: string | undefined,
        options: {
          status?: boolean;
          approve?: string | boolean;
          dryRun?: boolean;
        },
      ) => {
        const projectDir = process.cwd();
        const io = createIngestTerminalIO();

        try {
          // Status mode
          if (options.status) {
            printIngestStatus(projectDir, io);
            return;
          }

          // Approve mode
          if (options.approve !== undefined) {
            const documentId = typeof options.approve === "string"
              ? options.approve
              : undefined;

            const result = await approveIngest({
              projectDir,
              documentId,
              dryRun: options.dryRun,
              io,
            });

            if (result.errors.length > 0) {
              for (const err of result.errors) {
                logger.error(err);
              }
              process.exit(1);
            }

            logger.success(
              `Approved ${result.approvedDocuments.length} documents, ${result.featuresAdded} features added to plan.`,
            );
            return;
          }

          // Ingest mode (default)
          const result = await runIngest({
            projectDir,
            inputPath,
            dryRun: options.dryRun,
            io,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            if (result.processedDocuments.length === 0) {
              process.exit(1);
            }
          }

          const reviewCount = result.processedDocuments.filter(
            (d) => d.status === "review",
          ).length;

          if (reviewCount > 0) {
            logger.success(
              `Ingested ${result.processedDocuments.length} documents. ${reviewCount} ready for review.`,
            );
            logger.info("  Review SSOTs in docs/design/features/, then:");
            logger.info("  framework ingest --approve");
          }
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}
