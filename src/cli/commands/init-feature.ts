/**
 * framework init-feature — Generate 4-layer document templates for a feature.
 *
 * Part of ADF v1.2.0 (#92, SPEC-DOC4L-001/002).
 * Spec: IMPL §3.1, VERIFY §1.1/§2/§3.
 *
 * Principle #0: Pure script — no LLM calls.
 */
import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateFeatureTemplates } from "../lib/template-generator.js";

// Feature name validation (VERIFY §2 boundary values)
const FEATURE_NAME_REGEX = /^[a-zA-Z0-9-]+$/;
const FEATURE_NAME_MIN = 1;
const FEATURE_NAME_MAX = 64;

function validateFeatureName(name: string): string | null {
  if (name.length < FEATURE_NAME_MIN) {
    return "Feature name must be at least 1 character";
  }
  if (name.length > FEATURE_NAME_MAX) {
    return `Feature name must be at most ${FEATURE_NAME_MAX} characters (got ${name.length})`;
  }
  if (!FEATURE_NAME_REGEX.test(name)) {
    return "Feature name must contain only ASCII alphanumeric characters and hyphens";
  }
  return null;
}

export function registerInitFeatureCommand(program: Command): void {
  program
    .command("init-feature <name>")
    .description("Generate 4-layer document templates (SPEC/IMPL/VERIFY/OPS)")
    .option("--force", "Overwrite existing files")
    .action(async (name: string, options: { force?: boolean }) => {
      const projectDir = process.cwd();

      // 1. Validate feature name (VERIFY §2)
      const validationError = validateFeatureName(name);
      if (validationError) {
        console.error(`Error: ${validationError}`);
        process.exit(2);
      }

      // 2. Path traversal prevention (IMPL §8)
      const docsDir = path.join(projectDir, "docs");
      const resolvedDocs = path.resolve(docsDir);
      if (!resolvedDocs.startsWith(path.resolve(projectDir))) {
        console.error("Error: Path traversal detected");
        process.exit(2);
      }

      // Verify feature name doesn't escape (e.g. "../evil")
      const testPath = path.resolve(docsDir, "spec", `${name}.md`);
      if (!testPath.startsWith(resolvedDocs)) {
        console.error("Error: Feature name contains path traversal");
        process.exit(2);
      }

      // 3. Check existing files (VERIFY §3: FeatureAlreadyExists)
      const layers = ["spec", "impl", "verify", "ops"];
      const existingFiles: string[] = [];
      for (const layer of layers) {
        const filePath = path.join(docsDir, layer, `${name}.md`);
        if (fs.existsSync(filePath)) {
          existingFiles.push(filePath);
        }
      }

      if (existingFiles.length > 0 && !options.force) {
        console.error(`Error: Feature '${name}' already exists:`);
        for (const f of existingFiles) {
          console.error(`  ${path.relative(projectDir, f)}`);
        }
        console.error("\nUse --force to overwrite.");
        process.exit(2);
      }

      // 4. Lock (IMPL §3.5)
      const locksDir = path.join(projectDir, ".framework/locks");
      const lockFile = path.join(locksDir, `init-${name}.lock`);
      if (!fs.existsSync(locksDir)) {
        fs.mkdirSync(locksDir, { recursive: true });
      }
      if (fs.existsSync(lockFile)) {
        console.error(
          `Error: Another init-feature for '${name}' is in progress (lock exists)`,
        );
        process.exit(2);
      }

      try {
        fs.writeFileSync(lockFile, new Date().toISOString(), "utf-8");

        // 5. Generate templates
        console.log(`Generating 4-layer templates for feature '${name}'...`);
        const generated = await generateFeatureTemplates(name, docsDir);

        console.log(`\n  Generated ${generated.length} files:`);
        for (const f of generated) {
          console.log(`    ${path.relative(projectDir, f)}`);
        }

        // 6. Success message + next action
        console.log(`\n  Next steps:`);
        console.log(`    1. Fill in docs/spec/${name}.md (What to build)`);
        console.log(`    2. Fill in docs/impl/${name}.md (How to build)`);
        console.log(`    3. Fill in docs/verify/${name}.md (How to verify)`);
        console.log(`    4. Fill in docs/ops/${name}.md (How to operate)`);
        console.log(`    5. Run 'framework trace verify' to check traceability`);
      } finally {
        // Release lock
        try {
          fs.rmSync(lockFile, { force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    });
}
