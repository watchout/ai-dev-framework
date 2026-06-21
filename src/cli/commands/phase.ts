import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  buildShirubePhaseCheck,
  type ShirubePhaseCheckInput,
  type ShirubePhaseCheckReport,
} from "../lib/phase-conveyor.js";
import { logger } from "../lib/logger.js";

interface PhaseCheckOptions {
  fixture?: string;
  format?: string;
  json?: boolean;
}

interface ParsedPullRequestTarget {
  repo?: string;
  pr: number;
}

interface GhPullRequestFile {
  path: string;
}

interface GhPullRequestLabel {
  name: string;
}

interface GhPullRequestView {
  number: number;
  headRefOid?: string;
  body?: string;
  title?: string;
  files?: GhPullRequestFile[];
  labels?: GhPullRequestLabel[];
}

const APPROVED_REPO_SPEC_BASELINE_PATHS = [
  ".shirube/repo-spec.yaml",
  ".shirube/repo-spec.yml",
  "repo-spec.yaml",
  "repo-spec.yml",
];

export function registerPhaseCommand(program: Command): void {
  const phase = program
    .command("phase")
    .description("Inspect deterministic Shirube phase conveyor state");

  phase
    .command("check")
    .description("Validate Shirube phase conveyor evidence for a PR; does not mutate GitHub")
    .argument("[target]", "PR URL, owner/repo#number, owner/repo/pull/number, or local-repo PR number")
    .option("--fixture <path>", "JSON fixture for deterministic phase checks")
    .option("--format <format>", "Output format: json")
    .option("--json", "Output machine-readable JSON")
    .action((target: string | undefined, options: PhaseCheckOptions) => {
      runPhaseAction(options, () => {
        if (options.format && options.format !== "json") {
          throw new Error("Invalid --format. Expected json.");
        }
        const input = options.fixture
          ? readPhaseCheckFixture(options.fixture)
          : readGithubPullRequestForPhaseCheck(target);
        const report = buildShirubePhaseCheck(input);
        if (wantsJsonOutput(options)) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else {
          process.stdout.write(formatPhaseCheck(report));
        }
        if (report.verdict === "BLOCKED") process.exitCode = 1;
      });
    });
}

function runPhaseAction(options: PhaseCheckOptions, action: () => void): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (wantsJsonOutput(options)) {
      process.stdout.write(JSON.stringify({ error: { message } }, null, 2) + "\n");
    } else {
      logger.error(message);
    }
    process.exitCode = 1;
  }
}

function wantsJsonOutput(options: { json?: boolean; format?: string }): boolean {
  return options.json === true || options.format === "json";
}

function readPhaseCheckFixture(fixturePath: string): ShirubePhaseCheckInput {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ShirubePhaseCheckInput;
}

function readGithubPullRequestForPhaseCheck(target: string | undefined): ShirubePhaseCheckInput {
  if (!target) {
    throw new Error("Missing PR target. Expected a PR URL, owner/repo#number, owner/repo/pull/number, or PR number.");
  }
  const parsed = parsePullRequestTarget(target);
  const repo = parsed.repo ?? readCurrentGithubRepo();
  const view = JSON.parse(execFileSync("gh", [
    "pr",
    "view",
    String(parsed.pr),
    "--repo",
    repo,
    "--json",
    "number,headRefOid,body,title,files,labels",
  ], { encoding: "utf8" })) as GhPullRequestView;
  const headSha = view.headRefOid;
  if (!headSha) {
    throw new Error("GitHub PR view did not include headRefOid.");
  }
  const changedFiles = (view.files ?? []).map((file) => file.path);
  const repoFiles = readGithubTreePaths(repo, headSha);
  const artifactPaths = uniqueSorted([
    ...changedFiles.filter(isReadableArtifactPath),
    ...APPROVED_REPO_SPEC_BASELINE_PATHS.filter((path) => repoFiles.includes(path)),
  ]);
  const artifacts = artifactPaths.map((path) => ({
    path,
    body: readGithubTextFile(repo, headSha, path),
  })).filter((artifact) => artifact.body !== undefined);

  return {
    schema: "shirube-phase-check-fixture/v1",
    repo,
    pr: view.number,
    head_sha: headSha,
    title: view.title,
    body: view.body,
    labels: (view.labels ?? []).map((label) => label.name),
    changed_files: changedFiles,
    repo_files: repoFiles,
    artifacts,
  };
}

function parsePullRequestTarget(target: string): ParsedPullRequestTarget {
  const trimmed = target.trim();
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (urlMatch) {
    return { repo: `${urlMatch[1]}/${urlMatch[2]}`, pr: Number(urlMatch[3]) };
  }
  const hashMatch = trimmed.match(/^([^/\s#]+\/[^/\s#]+)#(\d+)$/);
  if (hashMatch) {
    return { repo: hashMatch[1], pr: Number(hashMatch[2]) };
  }
  const pathMatch = trimmed.match(/^([^/\s#]+\/[^/\s#]+)\/pull\/(\d+)$/);
  if (pathMatch) {
    return { repo: pathMatch[1], pr: Number(pathMatch[2]) };
  }
  const numberMatch = trimmed.match(/^#?(\d+)$/);
  if (numberMatch) return { pr: Number(numberMatch[1]) };
  throw new Error("Invalid PR target. Expected a PR URL, owner/repo#number, owner/repo/pull/number, or PR number.");
}

function readCurrentGithubRepo(): string {
  return execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
    encoding: "utf8",
  }).trim();
}

function readGithubTreePaths(repo: string, headSha: string): string[] {
  const output = execFileSync("gh", [
    "api",
    `repos/${repo}/git/trees/${headSha}?recursive=1`,
    "--jq",
    ".tree[] | select(.type == \"blob\") | .path",
  ], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readGithubTextFile(repo: string, headSha: string, path: string): string | undefined {
  try {
    const content = execFileSync("gh", [
      "api",
      `repos/${repo}/contents/${encodeGithubPath(path)}?ref=${headSha}`,
      "--jq",
      ".content",
    ], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
    return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function isReadableArtifactPath(path: string): boolean {
  return /^\.shirube\/.+\.(md|ya?ml|json)$/i.test(path) ||
    /^docs\/(spec|impl|activation)\/.+\.(md|ya?ml|json)$/i.test(path);
}

function encodeGithubPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function formatPhaseCheck(report: ShirubePhaseCheckReport): string {
  const lines = [
    `Phase check: ${report.verdict}`,
    `Repo: ${report.repo}`,
    `PR: ${report.pr}`,
    `Head: ${report.head_sha}`,
    `Current phase: ${report.current_phase}`,
    `Allowed next phases: ${report.allowed_next_phases.join(", ") || "none"}`,
  ];
  if (report.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker.code}: ${blocker.message}`);
    }
  }
  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning.code}: ${warning.message}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
