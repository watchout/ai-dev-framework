/**
 * framework skill-create - Extract reusable skills from implementations
 *
 * Reference: 09_TOOLCHAIN.md Section 10
 *
 * Scans the project for recurring patterns and generates
 * SKILL.md files in .claude/skills/ for reuse.
 */
import { type Command } from "commander";
import {
  type SkillCategory,
  loadSkillIndex,
} from "../lib/skill-model.js";
import {
  runSkillCreate,
  createSkillTerminalIO,
} from "../lib/skill-engine.js";
import { logger } from "../lib/logger.js";

export function registerSkillCreateCommand(program: Command): void {
  program
    .command("skill-create")
    .description(
      "Extract reusable skills from project patterns",
    )
    .option("--from <commit>", "Analyze changes since commit")
    .option(
      "--category <category>",
      "Filter by category: implementation, testing, refactoring, debugging",
    )
    .option("--pattern <desc>", "Search for specific pattern")
    .option(
      "--instincts",
      "Also generate instinct entries in memory",
    )
    .option("--list", "List existing skills")
    .action(
      async (options: {
        from?: string;
        category?: string;
        pattern?: string;
        instincts?: boolean;
        list?: boolean;
      }) => {
        const projectDir = process.cwd();

        try {
          if (options.list) {
            printSkillList(projectDir);
            return;
          }

          // Validate category
          const validCategories: SkillCategory[] = [
            "implementation",
            "testing",
            "refactoring",
            "debugging",
          ];
          if (
            options.category &&
            !validCategories.includes(options.category as SkillCategory)
          ) {
            logger.error(
              `Invalid category: ${options.category}. Use: ${validCategories.join(", ")}`,
            );
            process.exit(1);
          }

          const io = createSkillTerminalIO();
          const skills = await runSkillCreate(
            projectDir,
            {
              from: options.from,
              category: options.category as SkillCategory | undefined,
              pattern: options.pattern,
              instincts: options.instincts,
            },
            io,
          );

          if (skills.length > 0) {
            logger.success(
              `Created ${skills.length} skill(s)`,
            );
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

function printSkillList(projectDir: string): void {
  const index = loadSkillIndex(projectDir);

  if (index.skills.length === 0) {
    logger.info(
      "No skills found. Run 'framework skill-create' to extract patterns.",
    );
    return;
  }

  logger.header("Skills");
  logger.info("");

  for (const skill of index.skills) {
    logger.info(
      `  [${skill.id}] ${skill.name} (${skill.category}, ${skill.confidence}% confidence)`,
    );
  }

  logger.info("");
  logger.info(`  Total: ${index.skills.length} skill(s)`);
  logger.info("");
}
