/**
 * framework config - Configuration management
 *
 * Subcommands:
 *   framework config testing  — View/update testing layer configuration
 */
import { type Command } from "commander";
import {
  loadTestingConfig,
  saveTestingConfig,
  recommendTestTools,
  recommendationToConfig,
  type TestingConfig,
} from "../lib/testing-model.js";
import { logger } from "../lib/logger.js";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage project configuration");

  config
    .command("testing")
    .description("View or reset testing layer configuration (L1/L2/L3)")
    .option("--reset", "Reset testing config to auto-detected defaults")
    .action((options: { reset?: boolean }) => {
      const projectDir = process.cwd();

      if (options.reset) {
        resetTestingConfig(projectDir);
        return;
      }

      showTestingConfig(projectDir);
    });
}

function showTestingConfig(projectDir: string): void {
  const config = loadTestingConfig(projectDir);
  if (!config) {
    logger.error("No testing config found. Run 'framework init' or 'framework config testing --reset'.");
    return;
  }

  logger.header("Testing Configuration (ADR-010)");
  logger.info("");
  printLayer("L1 (Unit)", config.l1);
  printLayer("L2 (Integration)", config.l2);
  printLayer("L3 (E2E/Browser)", config.l3);
  logger.info("");
}

function printLayer(name: string, layer?: { tool: string; database?: string; autoDetected: boolean; userApproved?: boolean }): void {
  if (!layer) {
    logger.info(`  ${name}: not configured`);
    return;
  }
  const db = layer.database ? ` + ${layer.database}` : "";
  const src = layer.autoDetected ? "(auto-detected)" : "(user-configured)";
  logger.info(`  ${name}: ${layer.tool}${db} ${src}`);
}

function resetTestingConfig(projectDir: string): void {
  const rec = recommendTestTools({ profileType: "app" });
  const config = recommendationToConfig(rec);
  try {
    saveTestingConfig(projectDir, config);
    logger.success("Testing config reset to defaults.");
    showTestingConfig(projectDir);
  } catch (err) {
    logger.error(`Failed to save testing config: ${err instanceof Error ? err.message : String(err)}`);
  }
}
