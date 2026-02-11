/**
 * framework init - Project initialization command
 *
 * Reference: 00_MASTER_GUIDE.md, 09_TOOLCHAIN.md
 *
 * Creates a new project with:
 * - Directory structure (docs/, src/, public/, .framework/)
 * - CLAUDE.md and .cursorrules
 * - Document placeholders
 * - .gitignore
 * - README.md
 * - docs/INDEX.md
 * - .framework/project.json (state tracking)
 */
import { type Command } from "commander";
import { initProject, type InitResult } from "./init-action.js";
import {
  type ProfileType,
  PROFILE_TYPES,
  isValidProfileType,
  getProfile,
  inferProfileType,
} from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init [project-name]")
    .description("Initialize a new project with the AI Development Framework")
    .option("-d, --description <desc>", "Project description")
    .option(
      "-t, --type <type>",
      `Project type: ${PROFILE_TYPES.join(" | ")} (default: app)`,
    )
    .option("--skip-git", "Skip git initialization")
    .action(
      async (
        projectName: string | undefined,
        options: {
          description?: string;
          type?: string;
          skipGit?: boolean;
        },
      ) => {
        const name = projectName ?? "my-project";
        const description = options.description ?? "";

        // Resolve profile type
        let profileType: ProfileType;
        if (options.type) {
          if (!isValidProfileType(options.type)) {
            logger.error(
              `Invalid project type: ${options.type}. Valid types: ${PROFILE_TYPES.join(", ")}`,
            );
            process.exit(1);
          }
          profileType = options.type;
        } else {
          profileType = inferProfileType(description);
        }

        const profile = getProfile(profileType);
        logger.info(`  Project type: ${profile.name} (${profile.id})`);

        try {
          const result = await initProject({
            projectName: name,
            description,
            targetDir: process.cwd(),
            skipGit: options.skipGit ?? false,
            profileType,
          });

          printResult(result, profileType);
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}

function printResult(result: InitResult, profileType: ProfileType): void {
  const profile = getProfile(profileType);

  logger.header("Project initialized successfully");
  logger.info("");
  logger.info(`  Project: ${result.projectPath}`);
  logger.info(`  Type: ${profile.name} (${profile.id})`);
  logger.info("");
  logger.tree([
    `${result.projectPath}/`,
    "├── CLAUDE.md",
    "├── .cursorrules",
    "├── .gitignore",
    "├── README.md",
    "├── .claude/agents/    <- Agent Teams (CLI pattern)",
    "├── docs/              <- Specifications (placeholders ready)",
    "│   └── INDEX.md",
    "├── src/               <- Source code",
    ...(profile.directories.includes("public")
      ? ["├── public/            <- Static assets"]
      : []),
    "└── .framework/        <- Framework state",
  ]);
  logger.info("");
  logger.info(`  Files created: ${result.createdFiles.length}`);
  logger.info(`  Enabled SSOTs: ${profile.enabledSsot.join(", ")}`);
  logger.info(`  Discovery stages: ${profile.discoveryStages.join(", ")}`);
  logger.info(`  Enabled audits: ${profile.enabledAudit.join(", ")}`);
  logger.info("");
  logger.header("Next steps:");
  logger.info("  1. cd " + result.projectPath);
  logger.info("  2. framework discover    <- Start the discovery flow");
  logger.info("  3. framework generate    <- Generate SSOT documents");
  logger.info("");
}
