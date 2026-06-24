#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isMain,
  parseArgs,
} from "./lib.mjs";

const SCHEMA = "shirube-source-mirror-render/v1";

export function buildSourceMirror(options) {
  const input = normalizeInput(options);
  const errors = validateInput(input);
  if (errors.length > 0) return failureReport(input, errors);

  const source = parseSourceControl(input.sourceControl);
  const sourceUrl = `https://github.com/${source.repo}/issues/${source.issue}`;
  const mirror = sourceMirrorYaml({
    sourceControl: input.sourceControl,
    sourceRepo: source.repo,
    issueNumber: source.issue,
    sourceUrl,
    targetRepo: input.targetRepo,
    product: input.product,
    frameworkRef: input.frameworkRef,
    fetchedAt: input.fetchedAt,
    generatedBy: input.generatedBy,
    sha256: digestFor({
      sourceControl: input.sourceControl,
      targetRepo: input.targetRepo,
      product: input.product,
      frameworkRef: input.frameworkRef,
      fetchedAt: input.fetchedAt,
      generatedBy: input.generatedBy,
    }),
  });

  mkdirSync(path.dirname(input.out), { recursive: true });
  writeFileSync(input.out, mirror);

  return {
    schema: SCHEMA,
    verdict: "PASS",
    source_type: "github_issue",
    source_ref: input.sourceControl,
    source_repo: source.repo,
    issue_number: source.issue,
    source_url: sourceUrl,
    target_repo: input.targetRepo,
    product: input.product,
    framework_ref: input.frameworkRef,
    fetched_at: input.fetchedAt,
    generated_by: input.generatedBy,
    mirror_is_truth: false,
    output_path: input.out,
    sha256: extractSha(mirror),
    live_fetch_performed: false,
    external_repo_mutated: false,
    required_next_actions: [
      "Commit the mirror only as a machine-readable snapshot of the GitHub Control source.",
      "Treat the GitHub issue/comment as source authority; do not treat the mirror as independent truth.",
    ],
  };
}

function normalizeInput(options) {
  return {
    sourceControl: stringOption(options["source-control"]),
    targetRepo: stringOption(options["target-repo"]),
    product: stringOption(options.product),
    frameworkRef: stringOption(options["framework-ref"]),
    out: stringOption(options.out),
    format: stringOption(options.format),
    fetchedAt: stringOption(options["fetched-at"]) ?? "<FETCHED_AT_UTC>",
    generatedBy: stringOption(options["generated-by"]) ?? "codex-adf",
    mirrorIsTruth: stringOption(options["mirror-is-truth"]) ?? "false",
  };
}

function validateInput(input) {
  const errors = [];
  if (!sourceControlPattern().test(input.sourceControl ?? "")) {
    errors.push({ code: "invalid_source_control", message: "--source-control must be owner/control-repo#123.", path: "source-control" });
  }
  if (!repoPattern().test(input.targetRepo ?? "")) {
    errors.push({ code: "invalid_target_repo", message: "--target-repo must be owner/repo.", path: "target-repo" });
  }
  if (!input.product) {
    errors.push({ code: "missing_product", message: "--product is required.", path: "product" });
  }
  if (!frameworkRefPattern().test(input.frameworkRef ?? "")) {
    errors.push({ code: "invalid_framework_ref", message: "--framework-ref must be owner/repo@pinned-ref.", path: "framework-ref" });
  }
  if (!input.out) {
    errors.push({ code: "missing_output", message: "--out is required.", path: "out" });
  }
  if (input.format !== "json") {
    errors.push({ code: "unsupported_format", message: "--format json is required.", path: "format" });
  }
  if (input.mirrorIsTruth !== "false") {
    errors.push({ code: "mirror_truth_forbidden", message: "mirror_is_truth must remain false; the GitHub issue/comment remains source authority.", path: "mirror-is-truth" });
  }
  return errors;
}

function sourceMirrorYaml(input) {
  return [
    "schema_version: shirube-source-mirror/v1",
    "source_type: github_issue",
    `source_ref: ${input.sourceControl}`,
    `source_repo: ${input.sourceRepo}`,
    `issue_number: ${input.issueNumber}`,
    `source_url: ${input.sourceUrl}`,
    `target_repo: ${input.targetRepo}`,
    `product: ${input.product}`,
    `framework_ref: ${input.frameworkRef}`,
    `fetched_at: ${input.fetchedAt}`,
    `sha256: ${input.sha256}`,
    "mirror_is_truth: false",
    `generated_by: ${input.generatedBy}`,
    "source_authority:",
    "  type: github_issue_or_comment",
    "  remains_authority: true",
    "  mirror_role: machine_readable_snapshot",
    "extracted_fields:",
    `  target_repo: ${input.targetRepo}`,
    `  product: ${input.product}`,
    "  owner_confirmation: pending",
    "  control_source_status: snapshot",
    "",
  ].join("\n");
}

function digestFor(input) {
  return createHash("sha256")
    .update([
      input.sourceControl,
      input.targetRepo,
      input.product,
      input.frameworkRef,
      input.fetchedAt,
      input.generatedBy,
      "shirube-source-mirror/v1",
    ].join("\n"))
    .digest("hex");
}

function extractSha(yaml) {
  const match = yaml.match(/^sha256:\s*([a-f0-9]{64})$/m);
  return match?.[1] ?? null;
}

function failureReport(input, errors) {
  return {
    schema: SCHEMA,
    verdict: "FAILURE",
    source_type: "github_issue",
    source_ref: input.sourceControl ?? null,
    target_repo: input.targetRepo ?? null,
    product: input.product ?? null,
    framework_ref: input.frameworkRef ?? null,
    output_path: input.out ?? null,
    mirror_is_truth: input.mirrorIsTruth === "true",
    live_fetch_performed: false,
    external_repo_mutated: false,
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

function stringOption(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const report = buildSourceMirror(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "FAILURE" ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main();
}
