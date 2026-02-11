/**
 * framework audit - Quality audit command
 *
 * Reference: 13_SSOT_AUDIT.md, 17_CODE_AUDIT.md
 *
 * Runs quality audits on SSOT documents and code:
 * - SSOT audit: 10 categories, 95+ to pass
 * - Code audit: Adversarial Review, 8 categories, 100 mandatory
 *
 * Note: Prompt audit is deprecated. Use --legacy flag to enable.
 * New flow: SSOT → Implementation → Code Audit → Test
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import {
  runAudit,
  createAuditTerminalIO,
} from "../lib/audit-engine.js";
import {
  type AuditMode,
  loadAuditReports,
  generateAuditMarkdown,
} from "../lib/audit-model.js";
import { loadProjectProfile, isAuditEnabled } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";

/** Audit modes available by default (prompt is deprecated) */
const DEFAULT_AUDIT_MODES = ["ssot", "code"];

/** All audit modes including legacy */
const ALL_AUDIT_MODES = ["ssot", "prompt", "code"];

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .description(
      "Run quality audits (ssot, code). Use --legacy for prompt mode.",
    )
    .argument("<mode>", "Audit mode: ssot | code (prompt with --legacy)")
    .argument("[target]", "Path to file to audit")
    .option("--output <path>", "Write report to markdown file")
    .option("--id <id>", "Target identifier (default: filename)")
    .option("--status", "Show recent audit results")
    .option("--legacy", "Enable deprecated prompt audit mode")
    .action(
      async (
        mode: string,
        target: string | undefined,
        options: {
          output?: string;
          id?: string;
          status?: boolean;
          legacy?: boolean;
        },
      ) => {
        const projectDir = process.cwd();

        try {
          if (options.status) {
            const auditMode = ALL_AUDIT_MODES.includes(mode)
              ? (mode as AuditMode)
              : undefined;
            printAuditStatus(projectDir, auditMode);
            return;
          }

          // Validate mode (prompt requires --legacy)
          const availableModes = options.legacy
            ? ALL_AUDIT_MODES
            : DEFAULT_AUDIT_MODES;

          if (!availableModes.includes(mode)) {
            if (mode === "prompt" && !options.legacy) {
              logger.error(
                `Prompt audit is deprecated. Use --legacy to enable it.`,
              );
              logger.info(
                `New flow: SSOT → Implementation → Code Audit (Adversarial Review) → Test`,
              );
            } else {
              logger.error(
                `Invalid audit mode: ${mode}. Use: ${availableModes.join(", ")}`,
              );
            }
            process.exit(1);
          }

          // Check if audit mode is enabled for this project type
          const profile = loadProjectProfile(projectDir);
          if (profile && !isAuditEnabled(profile, mode)) {
            logger.error(
              `Audit mode "${mode}" is not enabled for project type "${profile.id}". ` +
                `Enabled modes: ${profile.enabledAudit.join(", ")}`,
            );
            process.exit(1);
          }

          // Validate target
          if (!target) {
            logger.error(
              "Target file required. Usage: framework audit <mode> <target>",
            );
            process.exit(1);
          }

          const targetPath = path.resolve(projectDir, target);
          if (!fs.existsSync(targetPath)) {
            logger.error(`Target not found: ${target}`);
            process.exit(1);
          }

          const io = createAuditTerminalIO();
          const result = await runAudit({
            projectDir,
            io,
            mode: mode as AuditMode,
            targetPath: target,
            targetId: options.id,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          // Output markdown if requested
          if (options.output) {
            const markdown = generateAuditMarkdown(result.report);
            const outputPath = path.resolve(
              projectDir,
              options.output,
            );
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, markdown, "utf-8");
            logger.success(`Report written to ${options.output}`);
          }

          logger.info("");
          if (result.report.verdict === "pass") {
            logger.success("Audit passed!");
          } else if (result.report.verdict === "conditional") {
            logger.warn(
              "Conditional pass - fix findings and re-audit",
            );
          } else {
            logger.error(
              "Audit failed - address findings before proceeding",
            );
          }
          logger.info("");

          if (result.report.verdict !== "pass") {
            process.exit(1);
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

function printAuditStatus(
  projectDir: string,
  mode?: AuditMode,
): void {
  const reports = loadAuditReports(projectDir, mode);

  if (reports.length === 0) {
    logger.info(
      "No audit reports found. Run 'framework audit <mode> <target>' to audit.",
    );
    return;
  }

  logger.header("Recent Audit Results");
  logger.info("");

  for (const report of reports.slice(0, 10)) {
    const verdictLabel =
      report.verdict === "pass"
        ? "PASS"
        : report.verdict === "conditional"
          ? "COND"
          : "FAIL";
    logger.info(
      `  [${report.mode.toUpperCase()}] ${report.target.name} - ${report.totalScore}/100 ${verdictLabel} (${report.target.auditDate})`,
    );
  }

  logger.info("");
}
