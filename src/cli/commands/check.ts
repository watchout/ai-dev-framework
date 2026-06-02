import type { Command } from "commander";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import {
  validateDeliveryProfiles,
  type DeliveryProfileDocument,
  type DeliveryProfileResult,
} from "../lib/delivery-profile-validator.js";
import {
  validatePrEvidence,
  type PrEvidenceDocument,
  type PrEvidenceResult,
} from "../lib/pr-evidence-validator.js";
import {
  GOVERNANCE_BONE_PROFILES,
  validateGovernanceBone,
  type GovernanceBoneMode,
  type GovernanceBoneDocument,
  type GovernanceBoneProfile,
  type GovernanceBoneRisk,
  type GovernanceBoneResult,
} from "../lib/governance-bone-validator.js";
import { checkTests, formatTestQualityReport } from "../lib/test-quality-checker.js";

const GOVERNANCE_MODES = ["warning", "strict"] as const;
const GOVERNANCE_RISKS = ["low", "medium", "high", "critical"] as const;
const GOVERNANCE_PROFILES = Object.keys(GOVERNANCE_BONE_PROFILES);

export function registerCheckCommand(program: Command): void {
  const check = program
    .command("check")
    .description("Deterministic pre-checks (tests, etc.)");

  check
    .command("tests")
    .description(
      "Scan test files for fake-test patterns (§3.3/§3.4 of docs/specs/06_CODE_QUALITY.md)",
    )
    .option("--json", "Output machine-readable JSON")
    .action((options: { json?: boolean }) => {
      const result = checkTests(process.cwd());
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(formatTestQualityReport(result) + "\n");
      }
      if (result.verdict === "BLOCK") process.exit(1);
    });

  check
    .command("governance")
    .description("Validate Goal/Phase/Work Order/script/evidence governance fields")
    .argument("<files...>", "Markdown files to validate")
    .option("--mode <mode>", "Governance mode (warning|strict); overrides risk-derived mode")
    .option("--strict", "Block when required governance fields are missing")
    .option("--profile <profile>", "Governance profile (default|infrastructure|hotel)")
    .option("--risk <risk>", "Risk classification (low|medium|high|critical)")
    .option("--require", "Require governance fields even if no governance trigger is detected")
    .option("--json", "Output machine-readable JSON")
    .action(
      (
        files: string[],
        options: {
          mode?: string;
          strict?: boolean;
          profile?: string;
          risk?: string;
          require?: boolean;
          json?: boolean;
        },
      ) => {
        const mode = parseGovernanceMode(options.mode, options.strict);
        const profile = parseGovernanceProfile(options.profile);
        const risk = parseGovernanceRisk(options.risk);
        const documents: GovernanceBoneDocument[] = files.map((file) => ({
          path: file,
          content: readFileSync(file, "utf-8"),
        }));

        const result = validateGovernanceBone(documents, {
          mode,
          profile,
          risk,
          requireGovernanceBone: options.require,
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(formatGovernanceBoneResult(result) + "\n");
        }

        if (result.status === "BLOCK") process.exit(1);
      },
    );

  check
    .command("delivery-profile")
    .description("Validate delivery profile JSON files")
    .argument("<paths...>", "Delivery profile JSON files or directories to validate")
    .option("--strict", "Block when profile fields are missing or invalid")
    .option("--json", "Output machine-readable JSON")
    .action(
      (
        paths: string[],
        options: { strict?: boolean; json?: boolean },
      ) => {
        const files = collectJsonFiles(paths);
        const documents: DeliveryProfileDocument[] = files.map((file) => ({
          path: file,
          content: readFileSync(file, "utf-8"),
        }));

        const result = validateDeliveryProfiles(documents, {
          mode: options.strict ? "strict" : "warning",
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(formatDeliveryProfileResult(result) + "\n");
        }

        if (result.status === "BLOCK") process.exit(1);
      },
    );

  check
    .command("pr-evidence")
    .description("Validate PR Conveyor evidence in Markdown PR bodies")
    .argument("<paths...>", "PR body Markdown files or directories to validate")
    .option("--strict", "Block when evidence fields are missing or invalid")
    .option("--json", "Output machine-readable JSON")
    .action(
      (
        paths: string[],
        options: { strict?: boolean; json?: boolean },
      ) => {
        const files = collectFilesByExtension(paths, ".md");
        const documents: PrEvidenceDocument[] = files.map((file) => ({
          path: file,
          content: readFileSync(file, "utf-8"),
        }));

        const result = validatePrEvidence(documents, {
          mode: options.strict ? "strict" : "warning",
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(formatPrEvidenceResult(result) + "\n");
        }

        if (result.status === "BLOCK") process.exit(1);
      },
    );
}

function formatGovernanceBoneResult(result: GovernanceBoneResult): string {
  const lines = [
    `Governance Bone: ${result.status}`,
    `Mode: ${result.mode}`,
    `Profile: ${result.profile}`,
    `Risk: ${result.risk}`,
    `Governance detected: ${result.governanceDetected ? "yes" : "no"}`,
    `Checked documents: ${result.checkedDocuments.length}`,
  ];

  if (result.findings.length > 0) {
    lines.push("");
    lines.push("Findings:");
    for (const finding of result.findings) {
      const field = finding.field ? ` ${finding.field}:` : "";
      lines.push(`- [${finding.severity}]${field} ${finding.message} (${finding.path})`);
    }
  }

  return lines.join("\n");
}

function parseGovernanceMode(
  value: string | undefined,
  strict: boolean | undefined,
): GovernanceBoneMode | undefined {
  if (strict) {
    if (value && value !== "strict") {
      failInvalidOption("--strict cannot be combined with --mode warning");
    }
    return "strict";
  }

  if (!value) return undefined;
  if (isGovernanceMode(value)) return value;
  failInvalidOption(
    `Invalid governance mode: "${value}". Valid: ${GOVERNANCE_MODES.join(", ")}.`,
  );
}

function parseGovernanceProfile(value: string | undefined): GovernanceBoneProfile | undefined {
  if (!value) return undefined;
  if (isGovernanceProfile(value)) return value;
  failInvalidOption(
    `Invalid governance profile: "${value}". Valid: ${GOVERNANCE_PROFILES.join(", ")}.`,
  );
}

function parseGovernanceRisk(value: string | undefined): GovernanceBoneRisk | undefined {
  if (!value) return undefined;
  if (isGovernanceRisk(value)) return value;
  failInvalidOption(
    `Invalid governance risk: "${value}". Valid: ${GOVERNANCE_RISKS.join(", ")}.`,
  );
}

function isGovernanceMode(value: string): value is GovernanceBoneMode {
  return GOVERNANCE_MODES.includes(value as GovernanceBoneMode);
}

function isGovernanceProfile(value: string): value is GovernanceBoneProfile {
  return GOVERNANCE_PROFILES.includes(value);
}

function isGovernanceRisk(value: string): value is GovernanceBoneRisk {
  return GOVERNANCE_RISKS.includes(value as GovernanceBoneRisk);
}

function failInvalidOption(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function collectJsonFiles(paths: string[]): string[] {
  return collectFilesByExtension(paths, ".json");
}

function collectFilesByExtension(paths: string[], extension: string): string[] {
  const files = new Set<string>();

  for (const inputPath of paths) {
    const stat = statSync(inputPath);
    if (stat.isDirectory()) {
      for (const file of walkFilesByExtension(inputPath, extension)) {
        files.add(file);
      }
    } else {
      files.add(inputPath);
    }
  }

  return [...files].sort();
}

function walkFilesByExtension(dir: string, extension: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFilesByExtension(fullPath, extension));
    } else if (entry.isFile() && extname(entry.name) === extension) {
      results.push(fullPath);
    }
  }
  return results;
}

function formatDeliveryProfileResult(result: DeliveryProfileResult): string {
  const lines = [
    `Delivery Profile: ${result.status}`,
    `Mode: ${result.mode}`,
    `Checked documents: ${result.checkedDocuments.length}`,
    `Checked profiles: ${result.checkedProfiles}`,
  ];

  if (result.findings.length > 0) {
    lines.push("");
    lines.push("Findings:");
    for (const finding of result.findings) {
      const risk = finding.riskClass ? ` ${finding.riskClass}` : "";
      const field = finding.field ? ` ${finding.field}:` : "";
      lines.push(
        `- [${finding.severity}]${risk}${field} ${finding.message} (${finding.path})`,
      );
    }
  }

  return lines.join("\n");
}

function formatPrEvidenceResult(result: PrEvidenceResult): string {
  const lines = [
    `PR Evidence: ${result.status}`,
    `Mode: ${result.mode}`,
    `Checked documents: ${result.checkedDocuments.length}`,
  ];

  if (result.findings.length > 0) {
    lines.push("");
    lines.push("Findings:");
    for (const finding of result.findings) {
      const field = finding.field ? ` ${finding.field}:` : "";
      lines.push(`- [${finding.severity}]${field} ${finding.message} (${finding.path})`);
    }
  }

  return lines.join("\n");
}
