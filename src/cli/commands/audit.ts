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
import { type AuditMode } from "../lib/audit-model.js";
import { printAuditStatus } from "../lib/audit-status.js";
import {
  resolveAuditTarget,
  outputJson,
  outputMarkdown,
} from "../lib/audit-helpers.js";
import { loadProjectProfile, isAuditEnabled } from "../lib/profile-model.js";
import {
  loadGateState,
  createGateState,
  updateGateC,
  saveGateState,
} from "../lib/gate-model.js";
import { checkGateC } from "../lib/gate-engine.js";
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
    .option("--json", "Output result as JSON")
    .action(
      async (
        mode: string,
        target: string | undefined,
        options: {
          output?: string;
          id?: string;
          status?: boolean;
          legacy?: boolean;
          json?: boolean;
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

          // Resolve target path
          const resolved = resolveAuditTarget(projectDir, target);
          const targetPath = resolved.targetPath;
          target = resolved.target;

          // Use silent IO for JSON output mode
          const io = options.json
            ? { print: () => {} }  // Silent IO
            : createAuditTerminalIO();
          
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

          // Output JSON if requested
          if (options.json) {
            outputJson(mode, target, result);
          }

          // Output markdown if requested
          if (options.output) {
            outputMarkdown(projectDir, options.output, result);
          }

          // Auto-update Gate C after SSOT audit
          if (mode === "ssot") {
            const gateState = loadGateState(projectDir) ?? createGateState();
            const gateCChecks = checkGateC(projectDir);
            updateGateC(gateState, gateCChecks);
            saveGateState(projectDir, gateState);

            if (gateState.gateC.status === "passed") {
              logger.success("Gate C (SSOT Completeness) automatically passed.");
            }
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
