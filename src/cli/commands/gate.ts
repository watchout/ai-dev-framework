/**
 * framework gate - Pre-Code Gate management command
 *
 * Reference: CLAUDE.md §Pre-Code Gate (A/B/C)
 *
 * Subcommands:
 *   framework gate check       - Run all gate checks
 *   framework gate check-a     - Run Gate A only (environment)
 *   framework gate check-b     - Run Gate B only (planning)
 *   framework gate check-c     - Run Gate C only (SSOT completeness)
 *   framework gate status      - Show current gate state
 *   framework gate reset       - Reset all gates to pending
 */
import { type Command } from "commander";
import {
  checkAllGates,
  checkSingleGate,
  createGateTerminalIO,
} from "../lib/gate-engine.js";
import {
  loadGateState,
  saveGateState,
  createGateState,
  resetGateState,
  type GateState,
  type GateEntry,
  type SSOTGateEntry,
} from "../lib/gate-model.js";
import { logger } from "../lib/logger.js";

export function registerGateCommand(program: Command): void {
  const gate = program
    .command("gate")
    .description("Pre-Code Gate management (A/B/C checks)");

  // framework gate check
  gate
    .command("check")
    .description("Run all gate checks (A, B, C)")
    .action(async () => {
      const projectDir = process.cwd();

      try {
        const io = createGateTerminalIO();

        io.print("");
        io.print("━".repeat(42));
        io.print("  PRE-CODE GATE CHECK");
        io.print("━".repeat(42));

        const result = checkAllGates(projectDir, io);

        io.print("");
        io.print("━".repeat(42));
        printGateSummary(result.gateA, result.gateB, result.gateC);

        if (result.allPassed) {
          logger.success(
            "All gates passed. 'framework run' is now allowed.",
          );
        } else {
          logger.error(
            "Gate check failed. Resolve issues before running 'framework run'.",
          );
          io.print("");
          for (const failure of result.failures) {
            logger.error(`  ${failure.gate}:`);
            for (const detail of failure.details) {
              logger.info(`    → ${detail}`);
            }
          }
          io.print("");
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework gate check-a
  gate
    .command("check-a")
    .description("Run Gate A only (environment readiness)")
    .action(async () => {
      runSingleGateCheck("A");
    });

  // framework gate check-b
  gate
    .command("check-b")
    .description("Run Gate B only (planning completeness)")
    .action(async () => {
      runSingleGateCheck("B");
    });

  // framework gate check-c
  gate
    .command("check-c")
    .description("Run Gate C only (SSOT §3-E/F/G/H)")
    .action(async () => {
      runSingleGateCheck("C");
    });

  // framework gate status
  gate
    .command("status")
    .description("Show current gate state")
    .action(async () => {
      const projectDir = process.cwd();

      const state = loadGateState(projectDir);

      if (!state) {
        logger.info(
          "No gate state found. Run 'framework gate check' first.",
        );
        return;
      }

      logger.header("Pre-Code Gate Status");
      logger.info("");
      printGateSummary(state.gateA, state.gateB, state.gateC);
      logger.info(`  Last updated: ${state.updatedAt}`);
      logger.info("");

      // Show detail for failed gates
      const hasFailure =
        state.gateA.status !== "passed" ||
        state.gateB.status !== "passed" ||
        state.gateC.status !== "passed";

      if (hasFailure) {
        printFailedDetails(state);
      }
    });

  // framework gate reset
  gate
    .command("reset")
    .description("Reset all gates to pending")
    .action(async () => {
      const projectDir = process.cwd();

      let state = loadGateState(projectDir);
      if (!state) {
        state = createGateState();
      }
      resetGateState(state);
      saveGateState(projectDir, state);

      logger.success("All gates reset to pending.");
      logger.info(
        "Run 'framework gate check' to re-evaluate.",
      );
    });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function runSingleGateCheck(gateId: "A" | "B" | "C"): void {
  const projectDir = process.cwd();

  try {
    const io = createGateTerminalIO();
    const gateLabels: Record<string, string> = {
      A: "Environment",
      B: "Planning",
      C: "SSOT Completeness",
    };

    io.print("");
    io.print("━".repeat(42));
    io.print(`  GATE ${gateId}: ${gateLabels[gateId]}`);
    io.print("━".repeat(42));

    const result = checkSingleGate(projectDir, gateId, io);
    io.print("");

    const gateEntry =
      gateId === "A"
        ? result.gateA
        : gateId === "B"
          ? result.gateB
          : result.gateC;

    if (gateEntry.status === "passed") {
      logger.success(`Gate ${gateId} passed.`);
    } else {
      logger.error(`Gate ${gateId} failed.`);
      const relevantFailures = result.failures.filter(
        (f) => f.gate.includes(`Gate ${gateId}`),
      );
      for (const failure of relevantFailures) {
        for (const detail of failure.details) {
          logger.info(`  → ${detail}`);
        }
      }
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    default:
      return "⏳";
  }
}

function printGateSummary(
  gateA: GateEntry,
  gateB: GateEntry,
  gateC: GateEntry | SSOTGateEntry,
): void {
  logger.info(
    `  ${statusIcon(gateA.status)} Gate A (Environment):       ${gateA.status.toUpperCase()}`,
  );
  logger.info(
    `  ${statusIcon(gateB.status)} Gate B (Planning):          ${gateB.status.toUpperCase()}`,
  );
  logger.info(
    `  ${statusIcon(gateC.status)} Gate C (SSOT Completeness): ${gateC.status.toUpperCase()}`,
  );
  logger.info("");
}

function printFailedDetails(state: GateState): void {
  if (state.gateA.status !== "passed") {
    logger.info("  Gate A issues:");
    for (const check of state.gateA.checks) {
      if (!check.passed) {
        logger.info(`    ❌ ${check.message}`);
      }
    }
    logger.info("");
  }

  if (state.gateB.status !== "passed") {
    logger.info("  Gate B issues:");
    for (const check of state.gateB.checks) {
      if (!check.passed) {
        logger.info(`    ❌ ${check.message}`);
      }
    }
    logger.info("");
  }

  if (state.gateC.status !== "passed") {
    logger.info("  Gate C issues:");
    for (const check of state.gateC.checks) {
      if (!check.passed) {
        logger.info(`    ❌ ${check.message}`);
      }
    }
    logger.info("");
  }
}
