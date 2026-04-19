/**
 * framework generate-reading-config — Generate required-reading.json from specs.
 *
 * Part of #64 (09_ENFORCEMENT §6).
 *
 * Scans docs/specs/ for .md files and generates grounding questions
 * + challenges for read-receipt verification.
 */
import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  generateReadingConfig,
  saveRequiredReading,
  loadRequiredReading,
} from "../lib/read-receipt-engine.js";

export function registerReadingConfigCommand(program: Command): void {
  program
    .command("generate-reading-config")
    .description("Generate .framework/required-reading.json from spec files")
    .option("--specs <dir>", "Specs directory (default: docs/specs)")
    .option("--dry-run", "Show what would be generated without writing")
    .action(
      async (options: { specs?: string; dryRun?: boolean }) => {
        const projectDir = process.cwd();
        const specsDir = options.specs ?? "docs/specs";
        const fullSpecsDir = path.join(projectDir, specsDir);

        if (!fs.existsSync(fullSpecsDir)) {
          console.error(`Specs directory not found: ${specsDir}`);
          process.exit(1);
        }

        // Find all .md spec files
        const specFiles: string[] = [];
        function scanDir(dir: string, prefix: string): void {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              scanDir(path.join(dir, entry.name), `${prefix}${entry.name}/`);
            } else if (entry.name.endsWith(".md")) {
              const relPath = `${prefix}${entry.name}`;
              const fullPath = path.join(dir, entry.name);
              const stat = fs.statSync(fullPath);
              // Skip files under 10 lines (likely empty/placeholder)
              const content = fs.readFileSync(fullPath, "utf-8");
              if (content.split("\n").length >= 10) {
                specFiles.push(`${specsDir}/${relPath}`);
              }
            }
          }
        }
        scanDir(fullSpecsDir, "");

        if (specFiles.length === 0) {
          console.log(`No spec files found in ${specsDir}/`);
          return;
        }

        console.log(`Found ${specFiles.length} spec files in ${specsDir}/`);

        const config = generateReadingConfig(projectDir, specFiles);

        if (options.dryRun) {
          console.log("\n--- Dry Run ---\n");
          for (const r of config.readings) {
            console.log(`${r.specFile}:`);
            console.log(`  Hash: ${r.expectedHash.slice(0, 16)}...`);
            console.log(`  Grounding: ${r.groundingQuestions.length} questions`);
            console.log(`  Challenges: ${r.challenges.length} questions`);
          }
          console.log(`\nTotal: ${config.readings.length} readings`);
          return;
        }

        // Check for existing config
        const existing = loadRequiredReading(projectDir);
        if (existing) {
          console.log(`Updating existing config (${existing.readings.length} → ${config.readings.length} readings)`);
        }

        saveRequiredReading(projectDir, config);
        console.log(`\nSaved .framework/required-reading.json`);
        console.log(`  ${config.readings.length} specs`);

        let totalG = 0;
        let totalC = 0;
        for (const r of config.readings) {
          totalG += r.groundingQuestions.length;
          totalC += r.challenges.length;
        }
        console.log(`  ${totalG} grounding questions`);
        console.log(`  ${totalC} challenges`);
      },
    );
}
