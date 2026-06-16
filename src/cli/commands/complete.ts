/**
 * shirube complete — Post-merge evidence gate.
 *
 * Enforces the "merge ≠ complete" principle: records and validates
 * post-deploy evidence so a PR is only counted as done when runtime
 * health can be confirmed.
 *
 * Ref: #367 — merge-vs-complete separation
 */
import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { CompletionGateInput } from "../lib/complete-model.js";
import {
  evaluateCompletionGate,
  loadCompleteEvidence,
  saveCompleteEvidence,
  loadShirubeProfile,
  buildRecord,
  isCompleted,
  renderCompletionGateReport,
  renderStatus,
} from "../lib/complete-engine.js";

export function registerCompleteCommand(program: Command): void {
  program
    .command("complete")
    .description(
      "Record post-merge evidence and confirm complete status (merge ≠ complete)",
    )
    .option("--pr <number>", "PR number to mark as complete")
    .option("--sha <hash>", "Deployed commit SHA to verify against")
    .option("--health-check", "Run health endpoint check (runtime repos)")
    .option("--smoke", "Run smoke test command from profile")
    .option("--status", "Show current complete status without recording")
    .option("--gate-file <path>", "Evaluate a Work Order / PR completion gate JSON file")
    .option("--json", "Print completion gate output as JSON")
    .option("--force", "Mark complete even if checks fail (with warning)")
    .action(
      async (options: {
        pr?: string;
        sha?: string;
        healthCheck?: boolean;
        smoke?: boolean;
        status?: boolean;
        gateFile?: string;
        json?: boolean;
        force?: boolean;
      }) => {
        const projectDir = process.cwd();
        const profile = loadShirubeProfile(projectDir);

        if (options.gateFile) {
          const input = loadCompletionGateInput(projectDir, options.gateFile);
          const report = evaluateCompletionGate(input);
          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            console.log(renderCompletionGateReport(report));
          }
          if (!report.can_pass) {
            process.exit(1);
          }
          return;
        }

        if (options.status) {
          const evidence = loadCompleteEvidence(projectDir);
          console.log(renderStatus(evidence, profile));
          return;
        }

        if (!options.pr) {
          console.error("Error: --pr <number> is required");
          process.exit(2);
        }

        const prNumber = options.pr;
        const sha = options.sha ?? resolveCurrentSha(projectDir);

        console.log(`\nComplete gate — PR #${prNumber}`);
        console.log(`SHA: ${sha ?? "(unknown)"}`);
        console.log(`Repo type: ${profile?.runtime ? "runtime" : "non-runtime"}\n`);

        const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];

        // ── 1. Deploy confirmed ────────────────────────────────────────────
        checks.push({
          name: "deploy-confirmed",
          passed: sha !== null,
          detail: sha ?? "No deployed SHA detected",
        });

        // ── 2. Health check (runtime repos only) ──────────────────────────
        if (profile?.runtime && options.healthCheck) {
          const endpoint = profile.complete_evidence?.health_endpoint;
          if (endpoint) {
            const result = runHealthCheck(endpoint);
            checks.push({ name: "health-check", passed: result.ok, detail: result.detail });
          } else {
            checks.push({
              name: "health-check",
              passed: false,
              detail: "No health_endpoint in .shirube/profile.json",
            });
          }
        }

        // ── 3. Smoke test ─────────────────────────────────────────────────
        if (options.smoke || profile?.complete_evidence?.smoke_command) {
          const smokeCmd = profile?.complete_evidence?.smoke_command;
          if (smokeCmd) {
            const result = runSmokeCommand(projectDir, smokeCmd);
            checks.push({ name: "smoke-test", passed: result.ok, detail: result.detail });
          }
        }

        // ── Print results ─────────────────────────────────────────────────
        let allPassed = true;
        for (const check of checks) {
          const icon = check.passed ? "✓" : "✗";
          const status = check.passed ? "PASS" : "FAIL";
          console.log(`  ${icon} ${check.name.padEnd(20)} ${status}${check.detail ? ` — ${check.detail}` : ""}`);
          if (!check.passed) allPassed = false;
        }

        const overallPassed = allPassed || options.force === true;

        if (!overallPassed) {
          console.error("\nComplete gate FAILED. Fix issues above, then re-run.");
          console.error("Use --force to override (records as complete with warnings).");
          process.exit(1);
        }

        if (!allPassed && options.force) {
          console.warn("\nWARNING: Marking complete with --force despite failures.");
        }

        // ── Save evidence record ──────────────────────────────────────────
        const record = buildRecord({
          prNumber,
          sha: sha ?? "unknown",
          checks,
          forced: !allPassed && options.force === true,
        });

        const store = loadCompleteEvidence(projectDir);
        store.records = store.records.filter((r) => r.prNumber !== prNumber);
        store.records.push(record);
        saveCompleteEvidence(projectDir, store);

        console.log(`\n✓ PR #${prNumber} marked as complete.`);
        console.log(`  Evidence written to .framework/complete-evidence.json`);
      },
    );
}

function loadCompletionGateInput(projectDir: string, filePath: string): CompletionGateInput {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath);
  try {
    const raw = fs.readFileSync(resolved, "utf-8");
    return JSON.parse(raw) as CompletionGateInput;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read completion gate file ${resolved}: ${reason}`);
  }
}

function resolveCurrentSha(projectDir: string): string | null {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim().slice(0, 12);
    }
  } catch {
    // ignore
  }
  return null;
}

function runHealthCheck(endpoint: string): { ok: boolean; detail: string } {
  try {
    const result = spawnSync("curl", ["-sf", "--max-time", "10", endpoint], {
      encoding: "utf-8",
      timeout: 15000,
    });
    if (result.status === 0) {
      return { ok: true, detail: `HTTP 200 from ${endpoint}` };
    }
    return { ok: false, detail: `curl exited ${result.status} for ${endpoint}` };
  } catch {
    return { ok: false, detail: `curl not available or timed out` };
  }
}

function runSmokeCommand(
  projectDir: string,
  cmd: string,
): { ok: boolean; detail: string } {
  const parts = cmd.split(/\s+/);
  const bin = parts[0];
  const args = parts.slice(1);
  try {
    const result = spawnSync(bin, args, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 60000,
    });
    if (result.status === 0) {
      return { ok: true, detail: `${cmd} passed` };
    }
    const errDetail = (result.stderr ?? "").slice(0, 120) || `exit ${result.status}`;
    return { ok: false, detail: errDetail };
  } catch {
    return { ok: false, detail: `smoke command failed to execute: ${cmd}` };
  }
}
