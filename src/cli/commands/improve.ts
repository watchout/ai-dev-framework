/**
 * framework improve — Self-improving knowledge management
 *
 * Displays LEARNINGS.md summary and guides to /self-improve skill.
 */
import { type Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../lib/logger.js";

export function registerImproveCommand(program: Command): void {
  program
    .command("improve")
    .description("Show LEARNINGS.md summary and promotion candidates")
    .action(() => {
      const projectDir = process.cwd();
      const learningsPath = path.join(projectDir, ".learnings/LEARNINGS.md");

      if (!fs.existsSync(learningsPath)) {
        logger.error("No .learnings/LEARNINGS.md found.");
        logger.info("  Run 'framework init' or create .learnings/LEARNINGS.md manually.");
        return;
      }

      const content = fs.readFileSync(learningsPath, "utf-8");
      const entries = content.split(/^## \[/m).slice(1);

      if (entries.length === 0) {
        logger.header("Self-Improve Summary");
        logger.info("");
        logger.info("  No learnings recorded yet.");
        logger.info("  Learnings are recorded automatically after Gate 2/3 execution.");
        logger.info("");
        return;
      }

      // Count categories
      const categories: Record<string, number> = {};
      let promoted = 0;
      let criticalCount = 0;
      let promotionCandidates = 0;

      for (const entry of entries) {
        const catMatch = entry.match(/^[\d-]+\]\s*([^:]+):/);
        if (catMatch) {
          const cat = catMatch[1].trim();
          categories[cat] = (categories[cat] ?? 0) + 1;
          if ((categories[cat] ?? 0) >= 3) promotionCandidates++;
        }
        if (entry.includes("promoted: true")) promoted++;
        if (entry.includes("CRITICAL")) criticalCount++;
      }

      logger.header("Self-Improve Summary");
      logger.info("");
      logger.info(`  Total learnings: ${entries.length}`);
      logger.info(`  Promoted to CLAUDE.md: ${promoted}`);
      logger.info(`  CRITICAL entries: ${criticalCount}`);
      logger.info(`  Promotion candidates: ${promotionCandidates}`);
      logger.info("");

      if (Object.keys(categories).length > 0) {
        logger.info("  Categories:");
        for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
          const marker = count >= 3 ? " ← promotion candidate" : "";
          logger.info(`    ${cat}: ${count}${marker}`);
        }
        logger.info("");
      }

      if (promotionCandidates > 0) {
        logger.info(`  ${promotionCandidates} category(s) qualify for CLAUDE.md promotion.`);
        logger.info("  Run /self-improve to generate promotion proposals.");
      } else {
        logger.info("  No promotion candidates yet.");
      }
      logger.info("");
    });
}
