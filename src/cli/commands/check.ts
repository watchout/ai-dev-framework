import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
  GOVERNANCE_BONE_PROFILES,
  validateGovernanceBone,
  type GovernanceBoneMode,
  type GovernanceBoneDocument,
  type GovernanceBoneProfile,
  type GovernanceBoneRisk,
  type GovernanceBoneResult,
} from "../lib/governance-bone-validator.js";
import {
  AUN_GATE_PR_CLASSES,
  validateAunGateProfile,
  type AunGateDocument,
  type AunGateMode,
  type AunGatePrClass,
  type AunGateProfileResult,
} from "../lib/aun-gate-profile-validator.js";
import { checkTests, formatTestQualityReport } from "../lib/test-quality-checker.js";

const GOVERNANCE_MODES = ["warning", "strict"] as const;
const GOVERNANCE_RISKS = ["low", "medium", "high", "critical"] as const;
const GOVERNANCE_PROFILES = Object.keys(GOVERNANCE_BONE_PROFILES);
const AUN_GATE_PR_CLASS_VALUES = Object.keys(AUN_GATE_PR_CLASSES);

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
    .command("aun-gate")
    .description("Validate Shirube governance profile evidence for Aun Gate Lite PRs")
    .argument("<files...>", "Markdown files to validate")
    .requiredOption(
      "--pr-class <class>",
      "Aun Gate PR class (schema_migration|policy_evaluator|approval_lifecycle|execution_ledger|projection|product_demo)",
    )
    .option("--mode <mode>", "Aun Gate profile mode (warning|strict)")
    .option("--strict", "Block when required Aun Gate profile fields are missing")
    .option("--json", "Output machine-readable JSON")
    .action(
      (
        files: string[],
        options: {
          prClass: string;
          mode?: string;
          strict?: boolean;
          json?: boolean;
        },
      ) => {
        const prClass = parseAunGatePrClass(options.prClass);
        const mode = parseAunGateMode(options.mode, options.strict);
        const documents: AunGateDocument[] = files.map((file) => ({
          path: file,
          content: readFileSync(file, "utf-8"),
        }));

        const result = validateAunGateProfile(documents, {
          prClass,
          mode,
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(formatAunGateProfileResult(result) + "\n");
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

function formatAunGateProfileResult(result: AunGateProfileResult): string {
  const lines = [
    `Aun Gate Profile: ${result.status}`,
    `Mode: ${result.mode}`,
    `PR class: ${result.prClass}`,
    `Risk: ${result.risk}`,
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

function parseAunGateMode(
  value: string | undefined,
  strict: boolean | undefined,
): AunGateMode | undefined {
  if (strict) {
    if (value && value !== "strict") {
      failInvalidOption("--strict cannot be combined with --mode warning");
    }
    return "strict";
  }

  if (!value) return undefined;
  if (isAunGateMode(value)) return value;
  failInvalidOption(
    `Invalid Aun Gate mode: "${value}". Valid: ${GOVERNANCE_MODES.join(", ")}.`,
  );
}

function parseAunGatePrClass(value: string): AunGatePrClass {
  if (isAunGatePrClass(value)) return value;
  failInvalidOption(
    `Invalid Aun Gate PR class: "${value}". Valid: ${AUN_GATE_PR_CLASS_VALUES.join(", ")}.`,
  );
}

function isAunGateMode(value: string): value is AunGateMode {
  return GOVERNANCE_MODES.includes(value as AunGateMode);
}

function isAunGatePrClass(value: string): value is AunGatePrClass {
  return AUN_GATE_PR_CLASS_VALUES.includes(value);
}

function failInvalidOption(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
