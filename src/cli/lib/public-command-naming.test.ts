import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

const PUBLIC_COMMAND_VERBS = [
  "accept",
  "audit",
  "block",
  "check",
  "checkpoint",
  "ci",
  "compact",
  "config",
  "current",
  "deploy",
  "discover",
  "dispatch",
  "evidence",
  "exit",
  "feedback",
  "feasibility-check",
  "gate",
  "generate",
  "hook",
  "improve",
  "ingest",
  "init",
  "init-feature",
  "migrate",
  "migrate-to-v1.2",
  "next",
  "plan",
  "preflight",
  "projects",
  "prune",
  "resequence",
  "retrofit",
  "run",
  "roles",
  "session-load",
  "session-save",
  "skill-create",
  "status",
  "sync",
  "sync-knowledge",
  "test",
  "trace",
  "unblock",
  "update",
  "verdict",
  "verify",
  "visual-test",
].join("|");

const LEGACY_COMMAND_RE = new RegExp(
  String.raw`\bframework\s+(?:${PUBLIC_COMMAND_VERBS})\b`,
  "g",
);

const PUBLIC_SURFACES = [
  "README.md",
  "docs/FRAMEWORK_SUMMARY.md",
  "docs/GETTING_STARTED.md",
  "docs/GUIDE_EXISTING_PROJECT.md",
  "docs/GUIDE_NEW_PROJECT.md",
  "docs/HOW_TO_DEVELOP.md",
  "docs/TASK-SEQUENCE-DESIGN.md",
  "docs/prompts",
  "docs/knowledge",
  "templates",
  "src/dashboard/app/page.tsx",
  "src/cli/commands",
  "src/cli/lib",
  ".github/workflows/gate-a.yml",
  ".github/workflows/gate-b.yml",
  ".github/workflows/merge-notify.yml",
];

const EXCLUDED_PATHS = [
  // Compatibility alias smoke tests must continue to exercise the legacy bin.
  "src/cli/commands/cli-commands.test.ts",
];

function collectFiles(relativePath: string): string[] {
  const fullPath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return [fullPath];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    const entryPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.relative(REPO_ROOT, entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function toRepoPath(fullPath: string): string {
  return path.relative(REPO_ROOT, fullPath).split(path.sep).join("/");
}

describe("public command naming", () => {
  it("uses shirube as the primary command on public and generated surfaces", () => {
    const violations: string[] = [];

    for (const surface of PUBLIC_SURFACES.flatMap(collectFiles)) {
      const repoPath = toRepoPath(surface);
      if (EXCLUDED_PATHS.includes(repoPath)) {
        continue;
      }

      const content = fs.readFileSync(surface, "utf-8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        LEGACY_COMMAND_RE.lastIndex = 0;
        if (LEGACY_COMMAND_RE.test(line)) {
          violations.push(`${repoPath}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
