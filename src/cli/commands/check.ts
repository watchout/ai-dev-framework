import type { Command } from "commander";
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
}
