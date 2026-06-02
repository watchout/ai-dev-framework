import type { Command } from "commander";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import {
  validateActionProfiles,
  type ActionProfileDocument,
  type ActionProfileResult,
} from "../lib/action-profile-validator.js";
import { checkTests, formatTestQualityReport } from "../lib/test-quality-checker.js";

export function registerCheckCommand(program: Command): void {
  const check = program
    .command("check")
    .description("Deterministic pre-checks (tests, etc.)");

  check
    .command("tests")
    .description(
      "Scan test files for fake-test patterns (§3.3/§3.4 of docs/specs/06_CODE_QUALITY.md)",
    )
    .option("--json", "Output machine-readable JSON")
    .action((options: { json?: boolean }) => {
      const result = checkTests(process.cwd());
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(formatTestQualityReport(result) + "\n");
      }
      if (result.verdict === "BLOCK") process.exit(1);
    });

  check
    .command("action-profile")
    .description("Validate governed action surface profile JSON files")
    .argument("<paths...>", "Profile JSON files or directories to validate")
    .option("--strict", "Block when profile fields are missing or invalid")
    .option("--json", "Output machine-readable JSON")
    .action(
      (
        paths: string[],
        options: { strict?: boolean; json?: boolean },
      ) => {
        const files = collectActionProfileFiles(paths);
        const documents: ActionProfileDocument[] = files.map((file) => ({
          path: file,
          content: readFileSync(file, "utf-8"),
        }));

        const result = validateActionProfiles(documents, {
          mode: options.strict ? "strict" : "warning",
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(formatActionProfileResult(result) + "\n");
        }

        if (result.status === "BLOCK") process.exit(1);
      },
    );
}

function collectActionProfileFiles(paths: string[]): string[] {
  const files = new Set<string>();

  for (const inputPath of paths) {
    const stat = statSync(inputPath);
    if (stat.isDirectory()) {
      for (const file of walkJsonFiles(inputPath)) {
        files.add(file);
      }
    } else {
      files.add(inputPath);
    }
  }

  return [...files].sort();
}

function walkJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(fullPath));
    } else if (entry.isFile() && extname(entry.name) === ".json") {
      results.push(fullPath);
    }
  }
  return results;
}

function formatActionProfileResult(result: ActionProfileResult): string {
  const lines = [
    `Governed Action Profile: ${result.status}`,
    `Mode: ${result.mode}`,
    `Checked documents: ${result.checkedDocuments.length}`,
    `Checked surfaces: ${result.checkedSurfaces}`,
  ];

  if (result.findings.length > 0) {
    lines.push("");
    lines.push("Findings:");
    for (const finding of result.findings) {
      const surface = finding.surfaceId ? ` ${finding.surfaceId}` : "";
      const field = finding.field ? ` ${finding.field}:` : "";
      lines.push(
        `- [${finding.severity}]${surface}${field} ${finding.message} (${finding.path})`,
      );
    }
  }

  return lines.join("\n");
}
