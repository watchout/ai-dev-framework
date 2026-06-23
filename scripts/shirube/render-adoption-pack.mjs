#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isMain,
  parseArgs,
} from "./lib.mjs";

const SCHEMA = "shirube-adoption-pack-render/v1";
const SUPPORTED_PROFILES = ["hotel-lite"];
const SUPPORTED_MODES = ["render"];

const TEMPLATE_OUTPUTS = {
  "execution-context.yaml": ".shirube/execution-context.yaml",
  "adoption-intake.yaml": ".shirube/adoption-intake.yaml",
  "existing-state-scan.yaml": ".shirube/existing-state-scan.yaml",
  "repo-spec.yaml": ".shirube/repo-spec.yaml",
  "control-handoff.yaml": ".shirube/control-handoffs/CH-001.yaml",
  "lifecycle-state.yaml": ".shirube/lifecycle-state.yaml",
  "enforcement-policy.yaml": ".shirube/enforcement-policy.yaml",
  "control-state-completeness.yaml": ".shirube/control-state-completeness.yaml",
  "source-mirror.github-issue.yaml": ".shirube/source-mirrors/control-issue.yaml",
  "docs-shirube-readme.md": "docs/shirube/README.md",
};

const TARGET_ALLOWED_PATHS = [
  ".shirube/**",
  "docs/shirube/**",
  ".github/workflows/shirube-rapid-lite-gates-report.yml",
];

const TARGET_FORBIDDEN_PATHS = [
  "scripts/shirube/**",
  "src/**",
  "app/**",
  "api/**",
  "lib/**",
  "db/**",
  "migrations/**",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env*",
  "deploy/**",
  "deployment/**",
  ".github/branch-protection/**",
  ".github/rulesets/**",
];

export function buildAdoptionPackRender(options) {
  const input = normalizeInput(options);
  const errors = validateInput(input);
  if (errors.length > 0) return failureReport(input, errors);

  const values = templateValues(input);
  const templatesDir = path.join("templates", "adoption-pack", input.profile);
  const generatedFiles = [];

  for (const [templateName, outputRelativePath] of Object.entries(TEMPLATE_OUTPUTS)) {
    const templatePath = path.join(templatesDir, templateName);
    if (!existsSync(templatePath)) {
      return failureReport(input, [{
        code: "template_missing",
        message: `Template is missing: ${templatePath}`,
        path: templatePath,
      }]);
    }
    const rendered = renderTemplate(readFileSync(templatePath, "utf8"), values);
    const outputPath = path.join(input.out, outputRelativePath);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, rendered.endsWith("\n") ? rendered : `${rendered}\n`);
    generatedFiles.push(fileRecord({ outputRelativePath, outputPath, content: rendered }));
  }

  return {
    schema: SCHEMA,
    verdict: "PASS",
    profile: input.profile,
    mode: input.mode,
    target_repo: input.targetRepo,
    product: input.product,
    source_control: input.sourceControl,
    framework_ref: input.frameworkRef,
    output_root: input.out,
    generated_files: generatedFiles,
    target_change_policy: {
      allowed_paths: TARGET_ALLOWED_PATHS,
      forbidden_paths: TARGET_FORBIDDEN_PATHS,
      workflow_caller_generated: false,
      runtime_changes_allowed: false,
      package_changes_allowed: false,
      branch_protection_changes_allowed: false,
      required_check_activation_allowed: false,
      external_repo_mutation_allowed: false,
    },
    required_next_actions: [
      "Open a target-repo adoption PR containing only the generated overlay files.",
      "Owner must fill exact-head decision evidence before merge if any gate would block.",
      "Do not mix runtime, API, DB, package, deploy, branch protection, ruleset, or required-check changes into the adoption PR.",
    ],
  };
}

function normalizeInput(options) {
  return {
    profile: stringOption(options.profile),
    targetRepo: stringOption(options["target-repo"]),
    product: stringOption(options.product),
    sourceControl: stringOption(options["source-control"]),
    frameworkRef: stringOption(options["framework-ref"]),
    mode: stringOption(options.mode),
    out: stringOption(options.out),
    format: stringOption(options.format),
    activeRole: stringOption(options["active-role"]) ?? "lead",
    generatedAt: stringOption(options["generated-at"]) ?? "<GENERATED_AT_UTC>",
    fetchedAt: stringOption(options["fetched-at"]) ?? "<FETCHED_AT_UTC>",
    generatedBy: stringOption(options["generated-by"]) ?? "codex-adf",
  };
}

function validateInput(input) {
  const errors = [];
  if (!SUPPORTED_PROFILES.includes(input.profile)) {
    errors.push({ code: "unsupported_profile", message: "--profile must be hotel-lite.", path: "profile" });
  }
  if (!SUPPORTED_MODES.includes(input.mode)) {
    errors.push({ code: "unsupported_mode", message: "--mode must be render.", path: "mode" });
  }
  if (input.format !== "json") {
    errors.push({ code: "unsupported_format", message: "--format json is required.", path: "format" });
  }
  if (!repoPattern().test(input.targetRepo ?? "")) {
    errors.push({ code: "invalid_target_repo", message: "--target-repo must be owner/repo.", path: "target-repo" });
  }
  if (!input.product) {
    errors.push({ code: "missing_product", message: "--product is required.", path: "product" });
  }
  if (!sourceControlPattern().test(input.sourceControl ?? "")) {
    errors.push({ code: "invalid_source_control", message: "--source-control must be owner/control-repo#123.", path: "source-control" });
  }
  if (!frameworkRefPattern().test(input.frameworkRef ?? "")) {
    errors.push({ code: "invalid_framework_ref", message: "--framework-ref must be owner/repo@pinned-ref.", path: "framework-ref" });
  }
  if (!["lead", "dev"].includes(input.activeRole)) {
    errors.push({ code: "invalid_active_role", message: "--active-role must be lead or dev.", path: "active-role" });
  }
  if (!input.out) {
    errors.push({ code: "missing_output", message: "--out is required.", path: "out" });
  }
  return errors;
}

function templateValues(input) {
  const source = parseSourceControl(input.sourceControl);
  const [targetOwner, targetName] = input.targetRepo.split("/");
  const frameworkRepo = input.frameworkRef.split("@")[0];
  const sourceUrl = `https://github.com/${source.repo}/issues/${source.issue}`;
  const digest = createHash("sha256")
    .update([
      input.targetRepo,
      input.product,
      input.sourceControl,
      input.frameworkRef,
      "shirube-adoption-pack/hotel-lite/v1",
    ].join("\n"))
    .digest("hex");
  const id = slugId(input.product || targetName);

  return {
    ACTIVE_ROLE: input.activeRole,
    ADOPTION_ID: `ADOPT-${id}-001`,
    CONTROL_HANDOFF_ID: "CH-001",
    CONTROL_STATE_ID: `CONTROL-STATE-${id}-001`,
    DIGEST_SHA256: digest,
    ENFORCEMENT_POLICY_ID: `ENFORCEMENT-POLICY-${id}-001`,
    EXISTING_SCAN_ID: `EXISTING-STATE-${id}-001`,
    FETCHED_AT: input.fetchedAt,
    FRAMEWORK_REF: input.frameworkRef,
    FRAMEWORK_REPO: frameworkRepo,
    GENERATED_AT: input.generatedAt,
    GENERATED_BY: input.generatedBy,
    ISSUE_NUMBER: String(source.issue),
    PRODUCT: input.product,
    REPO_SPEC_ID: `RPS-${id}-001`,
    SOURCE_CONTROL: input.sourceControl,
    SOURCE_REPO: source.repo,
    SOURCE_URL: sourceUrl,
    TARGET_OWNER: targetOwner,
    TARGET_REPO: input.targetRepo,
    TARGET_REPO_NAME: targetName,
  };
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in values)) return match;
    return values[key];
  });
}

function fileRecord({ outputRelativePath, outputPath, content }) {
  return {
    path: outputRelativePath,
    output_path: outputPath,
    bytes: Buffer.byteLength(content.endsWith("\n") ? content : `${content}\n`, "utf8"),
    sha256: createHash("sha256").update(content.endsWith("\n") ? content : `${content}\n`).digest("hex"),
  };
}

function failureReport(input, errors) {
  return {
    schema: SCHEMA,
    verdict: "FAILURE",
    profile: input.profile ?? null,
    mode: input.mode ?? null,
    target_repo: input.targetRepo ?? null,
    product: input.product ?? null,
    source_control: input.sourceControl ?? null,
    framework_ref: input.frameworkRef ?? null,
    output_root: input.out ?? null,
    generated_files: [],
    errors,
    required_next_actions: errors.map((error) => error.message),
  };
}

function parseSourceControl(value) {
  const match = value.match(sourceControlPattern());
  return {
    repo: `${match[1]}/${match[2]}`,
    issue: Number(match[3]),
  };
}

function repoPattern() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
}

function sourceControlPattern() {
  return /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9][0-9]*)$/;
}

function frameworkRefPattern() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[^@\s]+$/;
}

function slugId(value) {
  const normalized = String(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized || "TARGET";
}

function stringOption(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const report = buildAdoptionPackRender(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "FAILURE" ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main();
}
