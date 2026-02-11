/**
 * framework generate - Document generation command
 *
 * Reference: 10_GENERATION_CHAIN.md, 11_FEATURE_SPEC_FLOW.md
 *
 * Generates SSOT documents from discovery session answers:
 * Step 1: Business (IDEA_CANVAS, USER_PERSONA, COMPETITOR_ANALYSIS, VALUE_PROPOSITION)
 * Step 2: Product (SSOT-0_PRD, SSOT-1_FEATURE_CATALOG)
 */
import { type Command } from "commander";
import {
  runGenerateEngine,
  createGenerateTerminalIO,
  getGenerationSummary,
} from "../lib/generate-engine.js";
import { loadGenerationState } from "../lib/generate-state.js";
import { logger } from "../lib/logger.js";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description(
      "Generate SSOT documents from discovery session answers",
    )
    .option(
      "--step <number>",
      "Generate only a specific step (1=Business, 2=Product)",
      parseInt,
    )
    .option("--status", "Show current generation status")
    .action(
      async (options: { step?: number; status?: boolean }) => {
        const projectDir = process.cwd();

        try {
          if (options.status) {
            printGenerationStatus(projectDir);
            return;
          }

          // Validate step option
          const step = options.step as 1 | 2 | undefined;
          if (step !== undefined && step !== 1 && step !== 2) {
            logger.error(
              "Invalid step. Use --step 1 (Business) or --step 2 (Product).",
            );
            process.exit(1);
          }

          // Check .framework directory
          const fs = await import("node:fs");
          const path = await import("node:path");
          const frameworkDir = path.join(projectDir, ".framework");
          if (!fs.existsSync(frameworkDir)) {
            logger.error(
              "No .framework directory found. Run 'framework init' first.",
            );
            process.exit(1);
          }

          const io = createGenerateTerminalIO();
          const result = await runGenerateEngine({
            projectDir,
            step,
            io,
          });

          // Print errors if any
          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          // Print results
          printResults(result.generatedDocuments, result.state.status);
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}

function printResults(
  generatedDocuments: string[],
  status: string,
): void {
  logger.info("");
  logger.header("Documents Generated");
  logger.info("");
  logger.info(`  Generated: ${generatedDocuments.length} documents`);
  logger.info(`  Status: ${status}`);
  logger.info("");
  logger.header("Next steps:");
  logger.info("  1. Review generated documents in docs/");
  logger.info("  2. Fill in TBD sections");
  logger.info("  3. framework plan    <- Create implementation plan");
  logger.info("");
}

function printGenerationStatus(projectDir: string): void {
  const state = loadGenerationState(projectDir);

  if (!state) {
    logger.info("No generation state found.");
    logger.info("Run 'framework generate' to start.");
    return;
  }

  logger.header("Generation Status");
  logger.info("");
  logger.info(`  Status: ${state.status}`);
  logger.info(`  Current Step: ${state.currentStep}`);
  logger.info(`  Updated: ${state.updatedAt}`);
  logger.info("");

  const summary = getGenerationSummary(state);
  for (const step of summary) {
    const titles: Record<number, string> = {
      1: "Business Design",
      2: "Product Design",
    };
    logger.info(`  Step ${step.step}: ${titles[step.step] ?? ""}`);

    for (const doc of step.documents) {
      const filled = Math.round(doc.completeness / 10);
      const bar =
        "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
      const icon =
        doc.status === "confirmed"
          ? "+"
          : doc.status === "generated"
            ? ">"
            : " ";
      logger.info(
        `    [${icon}] [${bar}] ${doc.completeness}%  ${doc.name}`,
      );
    }
    logger.info("");
  }
}
