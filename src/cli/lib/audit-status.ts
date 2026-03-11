/**
 * Audit status display utilities
 */
import { type AuditMode, loadAuditReports } from "./audit-model.js";
import { logger } from "./logger.js";

export function printAuditStatus(
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
