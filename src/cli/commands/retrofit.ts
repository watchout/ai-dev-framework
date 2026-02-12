/**
 * framework retrofit - Retrofit existing projects into framework management
 *
 * Scans an existing codebase, analyzes its architecture,
 * identifies missing SSOT documents, and generates stubs
 * to bring the project under framework management.
 *
 * Usage:
 *   framework retrofit [path]              Scan and report
 *   framework retrofit [path] --generate   Scan and generate missing SSOTs
 *   framework retrofit [path] --dry-run    Show what would be generated
 *   framework retrofit --report            Show last retrofit report
 *   framework retrofit --output <path>     Write markdown report
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import {
  runRetrofit,
  createRetrofitTerminalIO,
  generateRetrofitMarkdown,
} from "../lib/retrofit-engine.js";
import { loadRetrofitReport } from "../lib/retrofit-model.js";
import {
  createGateState,
  loadGateState,
  saveGateState,
} from "../lib/gate-model.js";
import { logger } from "../lib/logger.js";

export function registerRetrofitCommand(program: Command): void {
  program
    .command("retrofit")
    .description(
      "Retrofit an existing project into framework management",
    )
    .argument(
      "[path]",
      "Path to existing project (default: current directory)",
    )
    .option("--generate", "Generate missing SSOT document stubs")
    .option("--dry-run", "Show what would be generated without writing files")
    .option("--report", "Show last retrofit report")
    .option("--output <path>", "Write markdown report to file")
    .action(
      async (
        targetPath: string | undefined,
        options: {
          generate?: boolean;
          dryRun?: boolean;
          report?: boolean;
          output?: string;
        },
      ) => {
        const projectDir = targetPath
          ? path.resolve(process.cwd(), targetPath)
          : process.cwd();

        try {
          // Show existing report
          if (options.report) {
            const existing = loadRetrofitReport(projectDir);
            if (!existing) {
              logger.info(
                "No retrofit report found. Run 'framework retrofit' first.",
              );
              return;
            }
            const md = generateRetrofitMarkdown(existing);
            logger.info(md);
            return;
          }

          // Verify directory exists
          if (!fs.existsSync(projectDir)) {
            logger.error(`Directory not found: ${projectDir}`);
            process.exit(1);
          }

          const io = createRetrofitTerminalIO();
          io.print("");
          io.print("━".repeat(38));
          io.print("  FRAMEWORK RETROFIT");
          io.print("━".repeat(38));
          io.print(`  Target: ${projectDir}`);

          const result = await runRetrofit({
            projectDir,
            io,
            dryRun: options.dryRun ?? false,
            generateStubs: options.generate ?? false,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          // Initialize gate state if not exists
          if (!options.dryRun && !loadGateState(projectDir)) {
            const gateState = createGateState();
            saveGateState(projectDir, gateState);
            logger.success(
              "Initialized Pre-Code Gate state (.framework/gates.json)",
            );
            logger.info(
              "  Run 'framework gate check' to evaluate gate status.",
            );
          }

          // Output markdown if requested
          if (options.output) {
            const markdown = generateRetrofitMarkdown(result.report);
            const outputPath = path.resolve(
              process.cwd(),
              options.output,
            );
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, markdown, "utf-8");
            logger.success(`Report written to ${options.output}`);
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
