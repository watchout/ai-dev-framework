/**
 * framework retrofit - Retrofit existing projects into framework management
 *
 * Scans an existing codebase, analyzes its architecture,
 * identifies missing SSOT documents, and generates stubs
 * to bring the project under framework management.
 *
 * Usage:
 *   framework retrofit [path]              Scan and report
 *   framework retrofit [path] --generate   Scan and generate missing SSOTs
 *   framework retrofit [path] --dry-run    Show what would be generated
 *   framework retrofit --report            Show last retrofit report
 *   framework retrofit --output <path>     Write markdown report
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import {
  runRetrofit,
  createRetrofitTerminalIO,
  generateRetrofitMarkdown,
} from "../lib/retrofit-engine.js";
import { loadRetrofitReport } from "../lib/retrofit-model.js";
import {
  createGateState,
  loadGateState,
  saveGateState,
} from "../lib/gate-model.js";
import { installAllHooks } from "../lib/hooks-installer.js";
import { installGitHubTemplates } from "../lib/github-templates.js";
import { loadProfileType, inferProfileType } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";
import { generateProjectState, type ProjectConfig } from "../lib/templates.js";
import { installMcpJson } from "../lib/mcp-installer.js";

export function registerRetrofitCommand(program: Command): void {
  program
    .command("retrofit")
    .description(
      "Retrofit an existing project into framework management",
    )
    .argument(
      "[path]",
      "Path to existing project (default: current directory)",
    )
    .option("--generate", "Generate missing SSOT document stubs")
    .option("--dry-run", "Show what would be generated without writing files")
    .option("--report", "Show last retrofit report")
    .option("--output <path>", "Write markdown report to file")
    .action(
      async (
        targetPath: string | undefined,
        options: {
          generate?: boolean;
          dryRun?: boolean;
          report?: boolean;
          output?: string;
        },
      ) => {
        const projectDir = targetPath
          ? path.resolve(process.cwd(), targetPath)
          : process.cwd();

        try {
          // Show existing report
          if (options.report) {
            const existing = loadRetrofitReport(projectDir);
            if (!existing) {
              logger.info(
                "No retrofit report found. Run 'framework retrofit' first.",
              );
              return;
            }
            const md = generateRetrofitMarkdown(existing);
            logger.info(md);
            return;
          }

          // Verify directory exists
          if (!fs.existsSync(projectDir)) {
            logger.error(`Directory not found: ${projectDir}`);
            process.exit(1);
          }

          const io = createRetrofitTerminalIO();
          io.print("");
          io.print("━".repeat(38));
          io.print("  FRAMEWORK RETROFIT");
          io.print("━".repeat(38));
          io.print(`  Target: ${projectDir}`);

          const result = await runRetrofit({
            projectDir,
            io,
            dryRun: options.dryRun ?? false,
            generateStubs: options.generate ?? false,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          // Gate state: managed by GitHub Actions check runs (#62)
          // Local gates.json created on-demand by `framework gate check`.
          if (!options.dryRun && !loadGateState(projectDir)) {
            logger.info(
              "  Gate state: managed by GitHub Actions (gate-a/b/c.yml).",
            );
            logger.info(
              "  Run 'framework gate check' for local cache if needed.",
            );
          }

          // Create .framework/project.json if not exists
          if (!options.dryRun) {
            const projectJsonPath = path.join(projectDir, ".framework/project.json");
            if (!fs.existsSync(projectJsonPath)) {
              // Detect profile type from project description or package.json
              const pkgJsonPath = path.join(projectDir, "package.json");
              let projectName = path.basename(projectDir);
              let description = "";
              if (fs.existsSync(pkgJsonPath)) {
                try {
                  const raw = fs.readFileSync(pkgJsonPath, "utf-8");
                  const pkg = JSON.parse(raw) as Record<string, unknown>;
                  if (typeof pkg.name === "string") projectName = pkg.name;
                  if (typeof pkg.description === "string") description = pkg.description;
                } catch {
                  // ignore parse errors
                }
              }
              const detectedProfile = inferProfileType(description);
              const config: ProjectConfig = {
                projectName,
                description,
                profileType: detectedProfile,
              };
              const frameworkDir = path.join(projectDir, ".framework");
              if (!fs.existsSync(frameworkDir)) {
                fs.mkdirSync(frameworkDir, { recursive: true });
              }
              fs.writeFileSync(projectJsonPath, generateProjectState(config), "utf-8");
              logger.success(
                `Created project profile (.framework/project.json, type=${detectedProfile})`,
              );
            }
          }

          // Install Pre-Code Gate hooks
          if (!options.dryRun) {
            const hooksResult = installAllHooks(projectDir);
            for (const w of hooksResult.warnings) {
              logger.warn(w);
            }
            if (hooksResult.claudeHookInstalled) {
              logger.success(
                "Claude Code hook installed (PreToolUse → Edit/Write)",
              );
            }
            if (hooksResult.gitHookInstalled) {
              logger.success("Git pre-commit hook installed");
            }
          }

          // Install gate scripts (scripts/gates/)
          if (!options.dryRun) {
            const frameworkRootForGates = path.resolve(__dirname, "../../../..");
            const GATE_SCRIPTS = ["gate-quality.sh", "gate-release.sh"];
            const gatesDir = path.join(projectDir, "scripts/gates");
            let gateScriptsCopied = 0;
            for (const script of GATE_SCRIPTS) {
              const srcPath = path.join(frameworkRootForGates, "templates/hooks", script);
              if (fs.existsSync(srcPath)) {
                if (!fs.existsSync(gatesDir)) {
                  fs.mkdirSync(gatesDir, { recursive: true });
                }
                const destPath = path.join(gatesDir, script);
                fs.copyFileSync(srcPath, destPath);
                fs.chmodSync(destPath, 0o755);
                gateScriptsCopied++;
              }
            }
            if (gateScriptsCopied > 0) {
              logger.success(`Installed ${gateScriptsCopied} gate scripts (scripts/gates/)`);
            }

            // Install gate-checks.yml workflow
            const gateWorkflowSrc = path.join(frameworkRootForGates, "templates/ci/gate-checks.yml");
            if (fs.existsSync(gateWorkflowSrc)) {
              const workflowDir = path.join(projectDir, ".github/workflows");
              const workflowDest = path.join(workflowDir, "gate-checks.yml");
              if (!fs.existsSync(workflowDest)) {
                if (!fs.existsSync(workflowDir)) {
                  fs.mkdirSync(workflowDir, { recursive: true });
                }
                fs.copyFileSync(gateWorkflowSrc, workflowDest);
                logger.success("Installed gate-checks.yml workflow");
              }
            }

            // Install autonomy.json template
            const autonomySrc = path.join(frameworkRootForGates, "templates/project/autonomy.json");
            if (fs.existsSync(autonomySrc)) {
              const autonomyDest = path.join(projectDir, ".framework/autonomy.json");
              if (!fs.existsSync(autonomyDest)) {
                fs.copyFileSync(autonomySrc, autonomyDest);
                logger.success("Installed autonomy.json (Dev Bot autonomous task selection)");
              }
            }

            // Install channel-routing.json if not present (ADR-033)
            const channelRoutingSrc = path.join(frameworkRootForGates, "templates/channel-routing.json");
            if (fs.existsSync(channelRoutingSrc)) {
              const channelRoutingDest = path.join(projectDir, "channel-routing.json");
              if (!fs.existsSync(channelRoutingDest)) {
                fs.copyFileSync(channelRoutingSrc, channelRoutingDest);
                logger.success("Installed channel-routing.json (ADR-033: channel routing enforcement)");
              }
            }

            // Add deprecation notice to goals.json if it exists
            const goalsPath = path.join(projectDir, ".framework/goals.json");
            if (fs.existsSync(goalsPath)) {
              try {
                const goals = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
                if (!goals._deprecated) {
                  goals._deprecated = {
                    notice: "goals.json is deprecated as task SSOT. Use GitHub Issues instead.",
                    readOnly: true,
                    migratedAt: new Date().toISOString(),
                    ssot: "github_issues",
                  };
                  fs.writeFileSync(goalsPath, JSON.stringify(goals, null, 2) + "\n");
                  logger.success("Added deprecation notice to goals.json (GitHub Issues is now SSOT)");
                }
              } catch {
                // goals.json parse error — skip
              }
            }
          }

          // Install GitHub templates (.github/) if not present
          if (!options.dryRun) {
            const profileType = loadProfileType(projectDir) ?? "app";
            // Detect framework root from global install or local
            const frameworkRoot = path.resolve(__dirname, "../../../..");
            const ghResult = installGitHubTemplates(
              projectDir,
              profileType,
              frameworkRoot,
              { projectName: path.basename(projectDir) },
            );
            if (ghResult.installed.length > 0) {
              logger.success(
                `Installed ${ghResult.installed.length} GitHub templates`,
              );
              for (const f of ghResult.installed) {
                logger.info(`  + ${f}`);
              }
            }
            if (ghResult.skipped.length > 0) {
              logger.info(
                `  Skipped ${ghResult.skipped.length} existing GitHub files`,
              );
            }
          }

          // Install .mcp.json (Playwright MCP)
          if (!options.dryRun) {
            const mcpResult = installMcpJson(projectDir);
            if (mcpResult.installed) {
              logger.success("Playwright MCP configured (.mcp.json)");
            }
          }

          // Output markdown if requested
          if (options.output) {
            const markdown = generateRetrofitMarkdown(result.report);
            const outputPath = path.resolve(
              process.cwd(),
              options.output,
            );
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, markdown, "utf-8");
            logger.success(`Report written to ${options.output}`);
          }
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}
