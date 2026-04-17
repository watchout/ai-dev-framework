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
import { basename } from "node:path";
import {
  checkAllGates,
  checkSingleGate,
  createGateTerminalIO,
} from "../lib/gate-engine.js";
import {
  loadGateState,
  loadGateStatusFromCheckRuns,
  saveGateState,
  createGateState,
  resetGateState,
  type GateState,
  type GateEntry,
  type SSOTGateEntry,
} from "../lib/gate-model.js";
import { scaffoldGateCsections } from "../lib/gate-scaffold.js";
import {
  loadProjectProfile,
  PROFILE_TYPES,
  isValidProfileType,
  type ProfileType,
} from "../lib/profile-model.js";

const PROFILE_HELP = `Project profile (${PROFILE_TYPES.join("|")}). Overrides .framework/project.json. Affects Gate A requirements.`;
const PROFILE_VALID_LIST = PROFILE_TYPES.join(", ");
import { logger } from "../lib/logger.js";
import {
  runGateDVerify,
  saveGateDEntry,
  type GateDResult,
} from "../lib/gate-d-engine.js";
import {
  runQualitySweep,
  formatSweepOutput,
} from "../lib/gate-quality-engine.js";
import {
  qualitySweepToJSON,
  buildGateContextJSON,
} from "../lib/gate-json-output.js";
import { loadProviderConfig } from "../lib/llm-provider.js";

export function registerGateCommand(program: Command): void {
  const gate = program
    .command("gate")
    .description("Pre-Code Gate management (A/B/C checks)");

  // framework gate check
  gate
    .command("check")
    .description("Run all gate checks (A, B, C)")
    .option("--profile <type>", PROFILE_HELP)
    .action(async (options: { profile?: string }) => {
      const projectDir = process.cwd();

      try {
        if (options.profile && !isValidProfileType(options.profile)) {
          logger.error(
            `Invalid --profile value: "${options.profile}". Valid: ${PROFILE_VALID_LIST}.`,
          );
          process.exit(1);
        }
        const profile = options.profile as ProfileType | undefined;

        const io = createGateTerminalIO();

        io.print("");
        io.print("━".repeat(42));
        io.print("  PRE-CODE GATE CHECK");
        io.print("━".repeat(42));

        const result = checkAllGates(projectDir, io, profile);

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
    .option("--profile <type>", PROFILE_HELP)
    .action(async (options: { profile?: string }) => {
      if (options.profile && !isValidProfileType(options.profile)) {
        logger.error(
          `Invalid --profile value: "${options.profile}". Valid: ${PROFILE_VALID_LIST}.`,
        );
        process.exit(1);
      }
      runSingleGateCheck("A", options.profile as ProfileType | undefined);
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
    .option("--check-runs", "Read gate status from GitHub Actions check runs instead of local gates.json")
    .option("--ref <ref>", "Git ref for check runs (default: HEAD)")
    .action(async (options: { checkRuns?: boolean; ref?: string }) => {
      const projectDir = process.cwd();

      let state: GateState | null;

      if (options.checkRuns) {
        state = await loadGateStatusFromCheckRuns(options.ref);
        if (!state) {
          logger.info(
            "No check runs found. Ensure Gate A/B/C workflows are configured.",
          );
          return;
        }
        logger.header("Pre-Code Gate Status (from GitHub Actions check runs)");
      } else {
        state = loadGateState(projectDir);
        if (!state) {
          logger.info(
            "No gate state found. Run 'framework gate check' or use --check-runs.",
          );
          return;
        }
        logger.header("Pre-Code Gate Status");
      }

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

  // framework gate scaffold
  gate
    .command("scaffold")
    .description("Generate missing §3-E/F/G/H templates in SSOT files")
    .option("--dry-run", "Show what would be generated without writing files")
    .action(async (options: { dryRun?: boolean }) => {
      const projectDir = process.cwd();
      const dryRun = options.dryRun ?? false;

      try {
        // Load profile type for section requirements
        const profile = loadProjectProfile(projectDir);
        const profileType = profile?.id;

        logger.header("Gate C Scaffold");
        logger.info("");

        if (profileType) {
          logger.info(`  Profile: ${profileType}`);
        }
        if (dryRun) {
          logger.info("  Mode: dry-run (no files will be modified)");
        }
        logger.info("");

        const results = scaffoldGateCsections(projectDir, dryRun, profileType);

        if (results.length === 0) {
          logger.info("  No SSOT feature spec files found.");
          logger.info("  Create feature specs in docs/design/features/ first.");
          return;
        }

        let scaffoldedCount = 0;
        let alreadyCompleteCount = 0;

        for (const result of results) {
          if (result.missingSections.length === 0) {
            alreadyCompleteCount++;
            logger.info(`  ✅ ${result.relativePath} — all sections present`);
          } else {
            scaffoldedCount++;
            const verb = dryRun ? "would add" : "added";
            logger.info(
              `  📝 ${result.relativePath} — ${verb}: ${result.missingSections.join(", ")}`,
            );
          }
        }

        logger.info("");
        if (dryRun) {
          logger.info(
            `  ${scaffoldedCount} file(s) need scaffolding, ${alreadyCompleteCount} already complete.`,
          );
          logger.info("  Run without --dry-run to generate templates.");
        } else {
          if (scaffoldedCount > 0) {
            logger.success(
              `  Scaffolded ${scaffoldedCount} file(s). Review the <!-- AUTO-GENERATED --> sections.`,
            );
          }
          if (alreadyCompleteCount > 0) {
            logger.info(`  ${alreadyCompleteCount} file(s) already complete.`);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework gate verify — Gate D Post-Deploy Verification (Phase 1)
  gate
    .command("verify")
    .description("Run Gate D post-deploy verification (D-1 Health + D-3 Pages)")
    .requiredOption("--url <url>", "Base URL of deployed environment (e.g. https://staging.example.com)")
    .option("--env <environment>", "Environment name", "staging")
    .option("--health <path>", "Health check path", "/api/health")
    .option("--pages <pages>", "Comma-separated page paths to check", "/,/login")
    .option("--commit <sha>", "Deploy commit SHA")
    .option("--skip-ssl", "Skip SSL/TLS certificate check (for local dev)")
    .action(
      async (options: {
        url: string;
        env: string;
        health: string;
        pages: string;
        commit?: string;
        skipSsl?: boolean;
      }) => {
        const projectDir = process.cwd();

        logger.header("Gate D — Post-Deploy Verification");
        logger.info("");
        logger.info(`  URL: ${options.url}`);
        logger.info(`  Environment: ${options.env}`);
        if (options.skipSsl) logger.info("  SSL check: skipped");
        logger.info("");

        try {
          const result = await runGateDVerify({
            baseUrl: options.url,
            environment: options.env,
            healthPath: options.health,
            pages: options.pages.split(",").map((p) => p.trim()),
            deployCommit: options.commit,
            skipSsl: options.skipSsl,
          });

          // Print results
          for (const check of result.entry.checks) {
            const icon = check.passed ? "PASS" : "FAIL";
            const skip = check.message.startsWith("Skipped") ? " (skipped)" : "";
            const warn = check.warning ? " ⚠️" : "";
            logger.info(`  [${icon}] ${check.id}: ${check.name}${skip}${warn}`);
            if (!check.passed && !skip) {
              logger.info(`         ${check.message}`);
            } else if (check.warning) {
              logger.info(`         ${check.message}`);
            }
          }

          logger.info("");

          // Save to gates.json
          saveGateDEntry(projectDir, result.entry);
          logger.info("  Result saved to .framework/gates.json");

          if (result.allPassed) {
            logger.success("Gate D PASSED — deploy verified.");
          } else {
            logger.error("Gate D FAILED — deploy verification failed:");
            for (const err of result.errors) {
              logger.error(`  ${err}`);
            }
            process.exit(1);
          }
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Gate D error: ${error.message}`);
          }
          process.exit(1);
        }
      },
    );

  // framework gate design — Gate 1: Design Validation context collection
  gate
    .command("design")
    .description("Collect context for Gate 1 Design Validation (run /gate-design after)")
    .option("--project <name>", "Project name for report")
    .action(
      async (options: { project?: string }) => {
        const projectDir = process.cwd();
        const projectName = options.project ?? basename(projectDir);

        logger.header("Gate 1 — Design Validation Context Collection");
        logger.info("");

        try {
          const fs = await import("node:fs");
          const path = await import("node:path");

          // Design document paths
          const designDocs = [
            { name: "SSOT-0_PRD", paths: ["docs/requirements/SSOT-0_PRD.md", "docs/SSOT-0_PRD.md"] },
            { name: "SSOT-1_FEATURE_CATALOG", paths: ["docs/requirements/SSOT-1_FEATURE_CATALOG.md", "docs/SSOT-1_FEATURE_CATALOG.md"] },
            { name: "SSOT-2_UI_STATE", paths: ["docs/design/core/SSOT-2_UI_STATE.md", "docs/SSOT-2_UI_STATE.md"] },
            { name: "SSOT-3_API_CONTRACT", paths: ["docs/design/core/SSOT-3_API_CONTRACT.md", "docs/SSOT-3_API_CONTRACT.md"] },
            { name: "SSOT-4_DATA_MODEL", paths: ["docs/design/core/SSOT-4_DATA_MODEL.md", "docs/SSOT-4_DATA_MODEL.md"] },
            { name: "SSOT-5_CROSS_CUTTING", paths: ["docs/design/core/SSOT-5_CROSS_CUTTING.md", "docs/SSOT-5_CROSS_CUTTING.md"] },
            { name: "TECH_STACK", paths: ["docs/standards/TECH_STACK.md", "docs/TECH_STACK.md"] },
          ];

          let contextBody = "";
          let found = 0;
          let missing = 0;

          for (const doc of designDocs) {
            let content: string | null = null;
            for (const p of doc.paths) {
              const fp = path.join(projectDir, p);
              if (fs.existsSync(fp)) {
                content = fs.readFileSync(fp, "utf-8");
                break;
              }
            }
            if (content) {
              found++;
              contextBody += `\n### ${doc.name}\n\n${content}\n`;
              logger.info(`  Found: ${doc.name}`);
            } else {
              missing++;
              contextBody += `\n### ${doc.name}\n\n**(NOT FOUND)**\n`;
              logger.info(`  Missing: ${doc.name}`);
            }
          }

          // Feature specs
          const featureDir = path.join(projectDir, "docs/design/features");
          if (fs.existsSync(featureDir)) {
            const features = fs.readdirSync(featureDir).filter((f: string) => f.endsWith(".md"));
            for (const f of features) {
              const content = fs.readFileSync(path.join(featureDir, f), "utf-8");
              contextBody += `\n### Feature: ${f}\n\n${content}\n`;
            }
            logger.info(`  Feature specs: ${features.length} files`);
          }

          // Write context
          const contextDir = path.join(projectDir, ".framework/gate-context");
          if (!fs.existsSync(contextDir)) fs.mkdirSync(contextDir, { recursive: true });

          const contextContent = `# Design Validation Context

## Date
${new Date().toISOString()}

## Project
${projectName}

## Documents Found
${found}/${designDocs.length} (${missing} missing)

## Design Documents
${contextBody}

## Instructions
以下の3つのValidatorを順次実行し、統合判定を行ってください:

1. **feasibility-checker**: PRD↔API/DB技術的実現可能性
2. **coherence-auditor**: SSOT間の矛盾検出
3. **gap-detector**: 設計欠落の検出

判定基準:
- PASS: 全CRITICAL = 0 かつ WARNING合計 ≤ 3
- BLOCK: CRITICAL ≥ 1 または WARNING > 3
`;

          fs.writeFileSync(path.join(contextDir, "design-validation.md"), contextContent, "utf-8");

          logger.info("");
          logger.success(`Context saved: .framework/gate-context/design-validation.md`);
          logger.info(`  Documents: ${found} found, ${missing} missing`);
          logger.info("");
          logger.info("  Next: Run /gate-design to execute validators");
          logger.info("");
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Gate design error: ${error.message}`);
          }
          process.exit(1);
        }
      },
    );

  // framework gate release — Gate 3: Adversarial Review context collection
  gate
    .command("release")
    .description("Collect context for Gate 3 Adversarial Review (run /gate-release after)")
    .option("--branch <branch>", "Branch to diff against", "main")
    .option("--auto-fix", "Auto-remediate BLOCK findings (opt-in)")
    .option("--max-retries <n>", "Max auto-fix retries (default: 2, hard limit: 3)", "2")
    .option("--output <format>", "Output format (text|json). When json, stdout=JSON, stderr=logs.", "text")
    .action(
      async (options: { branch: string; autoFix?: boolean; maxRetries?: string; output?: string }) => {
        const projectDir = process.cwd();
        const jsonMode = options.output === "json";
        let restoreLogger: (() => void) | undefined;
        if (jsonMode) {
          const { redirectInfoToStderr } = await import("../lib/logger.js");
          restoreLogger = redirectInfoToStderr();
        }

        logger.header("Gate 3 — Adversarial Review Context Collection");
        logger.info("");
        logger.info("  This gate uses a trial structure (Prosecutor → Defense → Judge).");
        logger.info("  Estimated time: ~5-10 minutes.");
        logger.info("");

        try {
          const { execSync } = await import("node:child_process");
          const fs = await import("node:fs");
          const path = await import("node:path");

          // 1. git diff
          let diff = "";
          let changedFiles = "";
          try {
            diff = execSync(`git diff ${options.branch}...HEAD`, { cwd: projectDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
            changedFiles = execSync(`git diff --name-only ${options.branch}...HEAD`, { cwd: projectDir, encoding: "utf-8" });
          } catch {
            diff = execSync("git diff HEAD~1", { cwd: projectDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
            changedFiles = execSync("git diff --name-only HEAD~1", { cwd: projectDir, encoding: "utf-8" });
          }
          logger.info(`  Changed files: ${changedFiles.trim().split("\n").length}`);

          // 2. Gate 1/2 reports
          let gate1Report = "(No Gate 1 report found)";
          let gate2Report = "(No Gate 2 report found)";
          const reportsDir = path.join(projectDir, ".framework/reports");
          if (fs.existsSync(reportsDir)) {
            const files = fs.readdirSync(reportsDir);
            const g1 = files.find((f: string) => f.startsWith("design-validation"));
            const g2 = files.find((f: string) => f.startsWith("quality-sweep"));
            if (g1) { gate1Report = fs.readFileSync(path.join(reportsDir, g1), "utf-8"); logger.info("  Gate 1 report: found"); }
            if (g2) { gate2Report = fs.readFileSync(path.join(reportsDir, g2), "utf-8"); logger.info("  Gate 2 report: found"); }
          }

          // 3. SSOT
          let ssotContent = "";
          const ssotFiles = ["docs/requirements/SSOT-0_PRD.md", "docs/requirements/SSOT-1_FEATURE_CATALOG.md"];
          for (const sf of ssotFiles) {
            const fp = path.join(projectDir, sf);
            if (fs.existsSync(fp)) {
              ssotContent += `\n### ${sf}\n${fs.readFileSync(fp, "utf-8").slice(0, 3000)}\n`;
            }
          }

          // 4. Test results
          let testOutput = "";
          try {
            testOutput = execSync("npm test 2>&1 || true", { cwd: projectDir, encoding: "utf-8", timeout: 120000 });
          } catch (e) {
            testOutput = e instanceof Error ? e.message : "Test execution failed";
          }

          // Write context
          const contextDir = path.join(projectDir, ".framework/gate-context");
          if (!fs.existsSync(contextDir)) fs.mkdirSync(contextDir, { recursive: true });

          const contextContent = `# Adversarial Review Context

## Date
${new Date().toISOString()}

## Branch
${options.branch}

## Changed Files
\`\`\`
${changedFiles.trim()}
\`\`\`

## Git Diff
\`\`\`diff
${diff.slice(0, 50000)}${diff.length > 50000 ? "\n... (truncated)" : ""}
\`\`\`

## Gate 1 Report (Design Validation)
${gate1Report}

## Gate 2 Report (Quality Sweep)
${gate2Report}

## SSOT Reference
${ssotContent || "(No SSOT files found)"}

## Test Results
\`\`\`
${testOutput.slice(0, 5000)}${testOutput.length > 5000 ? "\n... (truncated)" : ""}
\`\`\`

## Instructions
裁判構造で3つのValidatorを**順次**実行してください（並列不可）:

1. **Prosecutor（検察）**: リリースを止める理由を全力で探す → 起訴状作成
2. **Defense（弁護）**: 起訴状を受け取り、各起訴を検証 → 弁護書作成
3. **Judge（裁判官）**: 起訴状+弁護書のみで判決 → SHIP / SHIP_WITH_CONDITIONS / BLOCK
`;

          fs.writeFileSync(path.join(contextDir, "adversarial-review.md"), contextContent, "utf-8");

          // Save auto-fix config for use by /gate-release skill
          if (options.autoFix) {
            const { capMaxRetries } = await import("../lib/auto-remediation.js");
            const maxRetries = capMaxRetries(parseInt(options.maxRetries ?? "2", 10));
            const autoFixConfig = JSON.stringify({ enabled: true, maxRetries }, null, 2);
            fs.writeFileSync(
              path.join(contextDir, "auto-fix-config.json"),
              autoFixConfig,
              "utf-8",
            );
          }

          logger.info("");
          logger.success("Context saved: .framework/gate-context/adversarial-review.md");
          logger.info("");
          logger.info("  Next: Run /gate-release to start the trial");
          if (options.autoFix) {
            const { capMaxRetries } = await import("../lib/auto-remediation.js");
            const maxRetries = capMaxRetries(parseInt(options.maxRetries ?? "2", 10));
            logger.info(`  Auto-fix: enabled (max ${maxRetries} retries)`);
            logger.info("  Config saved: .framework/gate-context/auto-fix-config.json");
            logger.info("  After BLOCK verdict, auto-remediation will execute.");
          }
          logger.info("");

          if (jsonMode) {
            // Context-collection phase emits GateContextJSON (NO verdict field).
            // The actual Ship/Block verdict is produced later by the
            // /gate-release skill, which should emit a separate GateResultJSON.
            // Emitting a fake "SHIP" here would be dishonest and could be
            // misread by machine consumers as a real green-light decision.
            const providerConfig = loadProviderConfig(projectDir);
            const json = buildGateContextJSON({
              gate: "release",
              provider: providerConfig.default,
              contextPath: ".framework/gate-context/adversarial-review.md",
              meta: { nextStep: "/gate-release skill (trial structure)" },
            });
            process.stdout.write(JSON.stringify(json, null, 2) + "\n");
            restoreLogger?.();
          }
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Gate release error: ${error.message}`);
          }
          process.exit(1);
        }
      },
    );

  // framework gate quality — Gate 2: Quality Sweep (parallel execution + auto-aggregation)
  gate
    .command("quality")
    .description("Run Gate 2 Quality Sweep: collect context, run 4 validators, auto-aggregate")
    .option("--branch <branch>", "Branch to diff against", "main")
    .option("--phase <phase>", "Project phase for WARNING threshold (early|standard|release)", "standard")
    .option("--full", "Check entire repo, not just git diff")
    .option("--sequential", "Run validators sequentially (debug mode)")
    .option("--timeout <seconds>", "Validator timeout in seconds", "120")
    .option("--context-only", "Only collect context, skip validator execution")
    .option("--auto-fix", "Auto-remediate BLOCK findings (opt-in)")
    .option("--max-retries <n>", "Max auto-fix retries (default: 2, hard limit: 3)", "2")
    .option("--output <format>", "Output format (text|json). When json, stdout=JSON, stderr=logs.", "text")
    .action(
      async (options: { branch: string; phase: string; full?: boolean; sequential?: boolean; timeout?: string; contextOnly?: boolean; autoFix?: boolean; maxRetries?: string; output?: string }) => {
        const projectDir = process.cwd();
        const jsonMode = options.output === "json";
        let restoreLogger: (() => void) | undefined;
        if (jsonMode) {
          const { redirectInfoToStderr } = await import("../lib/logger.js");
          restoreLogger = redirectInfoToStderr();
        }

        logger.header("Gate 2 — Quality Sweep Context Collection");
        logger.info("");

        try {
          const { execSync } = await import("node:child_process");
          const fs = await import("node:fs");
          const path = await import("node:path");

          // 1. git diff
          let diff = "";
          let changedFiles = "";
          try {
            diff = execSync(`git diff ${options.branch}...HEAD`, { cwd: projectDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
            changedFiles = execSync(`git diff --name-only ${options.branch}...HEAD`, { cwd: projectDir, encoding: "utf-8" });
          } catch {
            diff = execSync("git diff HEAD~1", { cwd: projectDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }).toString();
            changedFiles = execSync("git diff --name-only HEAD~1", { cwd: projectDir, encoding: "utf-8" }).toString();
          }
          logger.info(`  Changed files: ${changedFiles.trim().split("\n").length}`);

          // 2. SSOT reference
          const ssotFiles = ["docs/requirements/SSOT-0_PRD.md", "docs/requirements/SSOT-1_FEATURE_CATALOG.md"];
          let ssotContent = "";
          for (const sf of ssotFiles) {
            const fp = path.join(projectDir, sf);
            if (fs.existsSync(fp)) {
              ssotContent += `\n### ${sf}\n${fs.readFileSync(fp, "utf-8").slice(0, 2000)}\n`;
            }
          }
          // Also include feature SSOTs for changed features
          const featureDocsDir = path.join(projectDir, "docs/design/features");
          if (fs.existsSync(featureDocsDir)) {
            const featureDocs = fs.readdirSync(featureDocsDir).filter((f: string) => f.endsWith(".md")).slice(0, 5);
            for (const fd of featureDocs) {
              ssotContent += `\n### docs/design/features/${fd}\n${fs.readFileSync(path.join(featureDocsDir, fd), "utf-8").slice(0, 2000)}\n`;
            }
          }

          // 3. npm test
          let testOutput = "";
          try {
            testOutput = execSync("npm test 2>&1 || true", { cwd: projectDir, encoding: "utf-8", timeout: 120000 });
          } catch (e) {
            testOutput = e instanceof Error ? e.message : "Test execution failed";
          }
          logger.info("  Test results collected");

          // 4. Write context file
          const contextDir = path.join(projectDir, ".framework/gate-context");
          if (!fs.existsSync(contextDir)) fs.mkdirSync(contextDir, { recursive: true });

          const warningThreshold = options.phase === "early" ? 10 : options.phase === "release" ? 3 : 5;
          const scopeMode = options.full ? "full" : "diff-only";

          const contextContent = `# Quality Sweep Context

## Date
${new Date().toISOString()}

## Branch
${options.branch}

## Phase
${options.phase} (WARNING threshold: ≤${warningThreshold})

## Scope
${scopeMode}

## Changed Files
\`\`\`
${changedFiles.trim()}
\`\`\`

## Git Diff
\`\`\`diff
${diff.slice(0, 50000)}${diff.length > 50000 ? "\n... (truncated)" : ""}
\`\`\`

## SSOT Reference
${ssotContent || "(No SSOT files found)"}

## Test Results
\`\`\`
${testOutput.slice(0, 5000)}${testOutput.length > 5000 ? "\n... (truncated)" : ""}
\`\`\`

## Instructions
以下の4つのValidatorを順次実行し、統合判定を行ってください:

1. **ssot-drift-detector**: SSOT仕様との乖離を検出
2. **security-scanner**: セキュリティ脆弱性を検出
3. **test-coverage-auditor**: テストカバレッジを監査
4. **perf-profiler**: パフォーマンス問題を検出

判定基準:
- PASS: 全CRITICAL = 0 かつ WARNING合計 ≤ 5
- BLOCK: CRITICAL ≥ 1 または WARNING > 5
`;

          const contextPath = path.join(contextDir, "quality-sweep.md");
          fs.writeFileSync(contextPath, contextContent, "utf-8");

          logger.info("");
          logger.success(`Context saved: .framework/gate-context/quality-sweep.md`);

          if (options.contextOnly) {
            logger.info("");
            logger.info("  Next: Run /gate-quality to execute validators manually");
            logger.info("");
            return;
          }

          // Run validators (parallel by default)
          logger.info("");
          logger.info(options.sequential
            ? "  Running 4 validators sequentially..."
            : "  Running 4 validators in parallel...");
          logger.info("");

          const sweepResult = await runQualitySweep(projectDir, {
            sequential: options.sequential,
            timeoutMs: parseInt(options.timeout ?? "120", 10) * 1000,
            warningThreshold,
          });

          if (jsonMode) {
            const providerConfig = loadProviderConfig(projectDir);
            const json = qualitySweepToJSON(sweepResult, providerConfig.default);
            process.stdout.write(JSON.stringify(json, null, 2) + "\n");
            restoreLogger?.();
            if (sweepResult.verdict === "BLOCK") process.exit(1);
            return;
          }

          // Display results
          const output = formatSweepOutput(sweepResult);
          for (const line of output.split("\n")) {
            logger.info(line);
          }
          logger.info("");

          const reportPath = `.framework/reports/quality-sweep-${options.branch.replace(/\//g, "-")}.md`;
          logger.info(`  Report: ${reportPath}`);
          logger.info("");

          if (sweepResult.verdict === "BLOCK") {
            if (options.autoFix) {
              const { runGateWithAutoFix, formatEscalation, capMaxRetries } = await import("../lib/auto-remediation.js");
              const maxRetries = capMaxRetries(parseInt(options.maxRetries ?? "2", 10));

              logger.info("");
              logger.header("Auto-remediation enabled");
              logger.info(`  Max retries: ${maxRetries}`);
              logger.info("");

              const autoResult = await runGateWithAutoFix("quality", {
                maxRetries,
                timeout: 300,
                runTests: true,
                projectDir,
              }, {
                runGate: async () => {
                  const re = await runQualitySweep(projectDir, {
                    sequential: options.sequential,
                    timeoutMs: parseInt(options.timeout ?? "120", 10) * 1000,
                    warningThreshold,
                  });
                  return { verdict: re.verdict, report: formatSweepOutput(re) };
                },
                onAttemptStart: (attempt, max) => {
                  logger.info(`  Remediation attempt ${attempt}/${max}...`);
                },
                onAttemptResult: (attempt, result) => {
                  if (result.success) {
                    logger.success(`  Attempt ${attempt}: fix applied, re-running gate...`);
                  } else {
                    logger.error(`  Attempt ${attempt}: ${result.error}`);
                  }
                },
                onEscalation: (reason) => {
                  logger.error(`  Escalation: ${reason}`);
                },
              });

              if (autoResult.verdict === "PASS") {
                logger.success("Gate 2 PASSED after auto-remediation.");
                return;
              }

              logger.info(formatEscalation("quality", autoResult));
            }
            process.exit(1);
          }
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Gate quality error: ${error.message}`);
          }
          process.exit(1);
        }
      },
    );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function runSingleGateCheck(
  gateId: "A" | "B" | "C",
  profile?: ProfileType,
): void {
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

    const result = checkSingleGate(projectDir, gateId, io, profile);
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
