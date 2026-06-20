import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { combineVerdicts, isMain, parseArgs, safeRun } from "./lib.mjs";

export function renderReport(paths) {
  const reports = paths.map((path) => ({ path, report: JSON.parse(readFileSync(path, "utf8")) }));
  const verdict = combineVerdicts(reports.map(({ report }) => report.verdict));
  const wouldBlock = reports.filter(({ report }) => report.verdict === "BLOCK").length;
  const warnings = reports.filter(({ report }) => report.verdict === "WARN").length;
  const rows = reports.map(({ path, report }) => `| ${report.gate ?? basename(path)} | ${report.verdict ?? "UNKNOWN"} | ${(report.reasons ?? []).length} | ${path} |`);
  const body = [
    "<!-- shirube-gates-report/v1 -->",
    "# Shirube Script Gates Report",
    "",
    `- Aggregate verdict: \`${verdict}\``,
    `- Would-block count if required: \`${wouldBlock}\``,
    `- Warning count: \`${warnings}\``,
    "",
    "This workflow is report-only. It records what would block if enforcement were enabled, but it exits successfully during the pilot.",
    "",
    "| Gate | Verdict | Finding count | Artifact |",
    "| --- | --- | ---: | --- |",
    ...rows,
    "",
  ].join("\n");
  return { verdict, wouldBlock, warnings, body };
}

if (isMain(import.meta.url)) {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  safeRun(() => {
    const report = renderReport(positionals);
    if (options.out) writeFileSync(options.out, report.body);
    return {
      gate: "script-gates-report",
      verdict: "PASS",
      reasons: [],
      remediation: { what: "No remediation required.", doc_ref: "scripts/shirube/render-report.mjs" },
      aggregate_verdict: report.verdict,
      would_block_count: report.wouldBlock,
      warning_count: report.warnings,
      report_path: options.out ?? null,
    };
  });
}
