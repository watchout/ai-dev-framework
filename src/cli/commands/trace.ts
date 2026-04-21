/**
 * framework trace — Traceability verification + graph visualization.
 *
 * Part of ADF v1.2.0 (#92, SPEC-DOC4L).
 * Spec: IMPL §3 (sequences).
 *
 * Principle #0: Pure script — no LLM calls.
 */
import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildGraph,
  verifyTraceability,
  renderGraph,
} from "../lib/trace-engine.js";
import { logger } from "../lib/logger.js";

// ─────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────

interface DocsLayersConfig {
  enabled: boolean;
  strict?: boolean;
}

function readDocsLayersConfig(projectDir: string): DocsLayersConfig | null {
  const configPath = path.join(projectDir, ".framework", "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (raw.docs_layers && typeof raw.docs_layers.enabled === "boolean") {
      return {
        enabled: raw.docs_layers.enabled,
        strict: raw.docs_layers.strict,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Report writer
// ─────────────────────────────────────────────

function writeReport(
  projectDir: string,
  result: ReturnType<typeof verifyTraceability>,
): string {
  const reportsDir = path.join(projectDir, ".framework", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const reportPath = path.join(reportsDir, `trace-verify-${dateStr}.md`);

  const hasIssues =
    result.orphans.length > 0 ||
    result.missing.length > 0 ||
    result.broken.length > 0;

  const status = hasIssues ? "BLOCK" : "PASS";

  const lines: string[] = [
    `# Trace Verify Report`,
    "",
    `- Date: ${now.toISOString()}`,
    `- Status: **${status}**`,
    `- Total nodes: ${result.totalNodes}`,
    `- Pass: ${result.passCount}`,
    "",
  ];

  if (result.orphans.length > 0) {
    lines.push("## Orphans");
    lines.push("");
    for (const o of result.orphans) {
      lines.push(`- ${o.id} (${o.layer})`);
    }
    lines.push("");
  }

  if (result.missing.length > 0) {
    lines.push("## Missing Traces");
    lines.push("");
    for (const m of result.missing) {
      lines.push(
        `- ${m.from} -> expected ${m.expected}: ${m.expectedId}`,
      );
    }
    lines.push("");
  }

  if (result.broken.length > 0) {
    lines.push("## Broken References");
    lines.push("");
    for (const b of result.broken) {
      lines.push(`- ${b.from} -> ${b.to}: ${b.reason}`);
    }
    lines.push("");
  }

  if (result.oversizedFeatures.length > 0) {
    lines.push("## Oversized Features (WARNING)");
    lines.push("");
    for (const o of result.oversizedFeatures) {
      lines.push(`- ${o.feature}: ${o.idCount} ids (> 100)`);
    }
    lines.push("");
  }

  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  return reportPath;
}

// ─────────────────────────────────────────────
// Command registration
// ─────────────────────────────────────────────

export function registerTraceCommand(program: Command): void {
  const trace = program
    .command("trace")
    .description("Traceability verification + graph visualization (doc4l)");

  // framework trace verify [--dir <docsDir>]
  trace
    .command("verify")
    .description(
      "Verify traceability across 4-layer documents (SPEC/IMPL/VERIFY/OPS)",
    )
    .option("--dir <docsDir>", "Path to docs directory", "docs")
    .action((options: { dir: string }) => {
      const projectDir = process.cwd();
      const docsDir = path.resolve(projectDir, options.dir);

      // Check config
      const config = readDocsLayersConfig(projectDir);
      if (!config || !config.enabled) {
        logger.warn(
          "docs_layers.enabled is false or not configured in .framework/config.json",
        );
        logger.info("Skipping trace verification.");
        process.exit(0);
      }

      // Check strict mode
      if (config.strict) {
        logger.error(
          "docs_layers.strict is set — trace verification failures will cause exit code 2",
        );
      }

      logger.header("Trace Verify");
      logger.info(`  docs dir: ${path.relative(projectDir, docsDir)}`);
      logger.info("");

      const graph = buildGraph(docsDir, projectDir);
      const result = verifyTraceability(graph);

      const hasIssues =
        result.orphans.length > 0 ||
        result.missing.length > 0 ||
        result.broken.length > 0;

      // Display results
      logger.info(`  Total nodes: ${result.totalNodes}`);
      logger.info(`  Pass: ${result.passCount}`);

      if (result.orphans.length > 0) {
        logger.warn(`  Orphans: ${result.orphans.length}`);
        for (const o of result.orphans) {
          logger.info(`    - ${o.id} (${o.layer})`);
        }
      }

      if (result.missing.length > 0) {
        logger.error(`  Missing traces: ${result.missing.length}`);
        for (const m of result.missing) {
          logger.info(
            `    - ${m.from} -> expected ${m.expected}: ${m.expectedId}`,
          );
        }
      }

      if (result.broken.length > 0) {
        logger.error(`  Broken references: ${result.broken.length}`);
        for (const b of result.broken) {
          logger.info(`    - ${b.from} -> ${b.to}: ${b.reason}`);
        }
      }

      if (result.oversizedFeatures.length > 0) {
        logger.warn(
          `  Oversized features: ${result.oversizedFeatures.length}`,
        );
        for (const o of result.oversizedFeatures) {
          logger.info(`    - ${o.feature}: ${o.idCount} ids`);
        }
      }

      // Write report on BLOCK
      if (hasIssues) {
        const reportPath = writeReport(projectDir, result);
        logger.info("");
        logger.info(
          `  Report: ${path.relative(projectDir, reportPath)}`,
        );
      }

      logger.info("");

      if (!hasIssues) {
        logger.success("Trace verification PASSED");
        process.exit(0);
      } else if (config.strict) {
        logger.error("Trace verification BLOCKED (strict mode)");
        process.exit(2);
      } else {
        logger.error("Trace verification BLOCKED");
        process.exit(1);
      }
    });

  // framework trace graph [--format mermaid] [--out <path>]
  trace
    .command("graph")
    .description("Generate traceability graph visualization")
    .option("--format <format>", "Output format (mermaid)", "mermaid")
    .option("--out <path>", "Output file path")
    .option("--dir <docsDir>", "Path to docs directory", "docs")
    .action((options: { format: string; out?: string; dir: string }) => {
      const projectDir = process.cwd();
      const docsDir = path.resolve(projectDir, options.dir);

      if (options.format !== "mermaid") {
        logger.error(`Unsupported format: ${options.format}. Only "mermaid" is supported.`);
        process.exit(2);
      }

      const graph = buildGraph(docsDir, projectDir);

      if (graph.size === 0) {
        logger.warn(
          "No documents found (docs_layers may be disabled or docs directory is empty)",
        );
        process.exit(0);
      }

      const output = renderGraph(graph, "mermaid");

      if (options.out) {
        const outPath = path.resolve(projectDir, options.out);
        const outDir = path.dirname(outPath);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, output, "utf-8");
        logger.success(`Graph written to ${path.relative(projectDir, outPath)}`);
      } else {
        // Write to stdout
        process.stdout.write(output + "\n");
      }
    });
}
