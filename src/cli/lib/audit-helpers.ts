/**
 * Audit command helper functions
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type AuditResult, generateAuditMarkdown } from "./audit-model.js";
import { logger } from "./logger.js";

/**
 * Resolve audit target path
 * If no target specified, use default ssot/SSOT-0_PRD.md
 */
export function resolveAuditTarget(
  projectDir: string,
  target: string | undefined,
): { targetPath: string; target: string } {
  if (!target) {
    // Default: use ssot/SSOT-0_PRD.md for project-level audit
    const defaultTarget = path.join(projectDir, "ssot", "SSOT-0_PRD.md");
    if (!fs.existsSync(defaultTarget)) {
      logger.error(
        "No target specified and default SSOT file not found.\n" +
          "Usage: framework audit <mode> <target>\n" +
          "Or create: ssot/SSOT-0_PRD.md",
      );
      process.exit(1);
    }
    return { targetPath: defaultTarget, target: "ssot/SSOT-0_PRD.md" };
  }

  const targetPath = path.resolve(projectDir, target);
  if (!fs.existsSync(targetPath)) {
    logger.error(`Target not found: ${target}`);
    process.exit(1);
  }

  return { targetPath, target };
}

/**
 * Output audit result as JSON
 */
export function outputJson(mode: string, target: string, result: AuditResult): void {
  const jsonOutput = {
    mode,
    target,
    verdict: result.report.verdict,
    totalScore: result.report.totalScore,
    scorecard: result.report.scorecard,
    findings: result.report.findings,
    absoluteConditions: result.report.absoluteConditions,
  };
  process.stdout.write(JSON.stringify(jsonOutput, null, 2) + "\n");
  process.exit(result.report.verdict === "pass" ? 0 : 1);
}

/**
 * Output audit result as markdown file
 */
export function outputMarkdown(
  projectDir: string,
  outputPath: string,
  result: AuditResult,
): void {
  const markdown = generateAuditMarkdown(result.report);
  const fullPath = path.resolve(projectDir, outputPath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, markdown, "utf-8");
  logger.success(`Report written to ${outputPath}`);
}
