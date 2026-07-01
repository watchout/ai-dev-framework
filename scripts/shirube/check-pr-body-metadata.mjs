#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  isMain,
  parseArgs,
} from "./lib.mjs";

const SCHEMA = "shirube-pr-body-metadata-check/v1";

const MACHINE_REF_FIELDS = [
  "structured_audit_ref",
  "structured_audit_comment_ref",
  "audit_machine_evidence_ref",
  "additional_review_ref",
  "additional_review_comment_ref",
  "owner_decision_ref",
  "validation_evidence_ref",
  "control_state_ref",
  "audit_checklist_ref",
  "handoff_ref",
];

const PLACEHOLDERS = new Set([
  "pending",
  "tbd",
  "todo",
  "none",
  "null",
  "n/a",
  "<pending>",
  "<fill-me>",
  "external-owner-final-decision-required",
  "pending-owner-final-decision",
]);

export function buildPrBodyMetadataCheck(input = {}) {
  const body = String(input.prBody ?? "");
  const actualHead = stringOption(input.actualHead);
  const refs = extractMachineRefs(body);
  const exactHead = extractExactHead(body);
  const blockers = [];
  const warnings = [];

  const placeholderRefs = refs.filter((ref) => isPlaceholder(ref.value));
  if (placeholderRefs.length > 0) {
    blockers.push(finding("METADATA-REF-001", {
      path: placeholderRefs.map((ref) => ref.field).join(","),
      value: placeholderRefs.map((ref) => `${ref.field}=${ref.value}`).join(","),
      message: `Machine ref field contains placeholder text. Remove ${placeholderRefs.map((ref) => ref.field).join(", ")} until real file paths or comment URLs exist.`,
    }));
  }

  if (actualHead && exactHead && exactHead !== actualHead) {
    blockers.push(finding("METADATA-HEAD-001", {
      path: "exact_head_sha",
      message: `PR body exact_head_sha ${exactHead} does not match actual head ${actualHead}.`,
    }));
  }

  const cellLifecyclePresent = /\bcell_lifecycle\s*:/i.test(body);
  const prRolePresent = /\bpr_role\s*:/i.test(body);
  if ((cellLifecyclePresent || prRolePresent) && !/\bCELL-[A-Z0-9][A-Z0-9_-]*\b/.test(body)) {
    blockers.push(finding("METADATA-CELL-001", {
      path: "CELL-ID",
      message: "CELL-ID is required when PR body cell_lifecycle or pr_role metadata is present.",
    }));
  }

  if (/\bapproval_granted\s*:\s*true\b/i.test(body) || /\bDecision\s*:\s*APPROVED_EXACT_HEAD\b/i.test(body)) {
    warnings.push({
      item_id: "METADATA-OWNER-W001",
      code: "owner_approval_text_detected",
      message: "Owner approval text appears in the PR body. Final owner decision evidence must remain separate and exact-head bound.",
      path: "owner_decision",
    });
  }

  return report({ blockers: uniqueFindings(blockers), warnings: uniqueFindings(warnings), refs, exactHead, actualHead });
}

function extractMachineRefs(body) {
  const refs = [];
  for (const field of MACHINE_REF_FIELDS) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(${escapeRegExp(field)})\\s*:\\s*([^\\n]+?)\\s*(?=\\n|$)`, "ig");
    for (const match of body.matchAll(pattern)) {
      refs.push({
        field: match[1],
        value: cleanValue(match[2]),
      });
    }
  }
  return refs;
}

function extractExactHead(body) {
  const patterns = [
    /(?:^|\n)\s*(?:[-*]\s*)?exact_head_sha\s*:\s*([a-f0-9]{40})\s*(?=\n|$)/i,
    /(?:^|\n)\s*(?:[-*]\s*)?Exact(?: PR)? head(?: SHA)?\s*:\s*([a-f0-9]{40})\s*(?=\n|$)/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function report({ blockers, warnings, refs, exactHead, actualHead }) {
  const verdict = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";
  const metadataBlocked = blockers.some((blocker) => blocker.item_id === "METADATA-REF-001");
  return {
    schema: SCHEMA,
    generated_by: "scripts/shirube/check-pr-body-metadata.mjs",
    verdict,
    report_failed: false,
    would_block: verdict === "BLOCKED",
    owner_must_not_merge: verdict === "BLOCKED",
    current_phase: verdict === "BLOCKED" ? "METADATA_REFRESH_REQUIRED" : null,
    next_action: verdict === "BLOCKED"
      ? {
          action: metadataBlocked ? "remove_placeholder_machine_refs" : "refresh_exact_head_metadata",
          responsible_role: "dev",
          allowed_actor_role: "dev",
          reason: metadataBlocked
            ? "Machine ref fields must be absent until a concrete local path or comment URL exists."
            : "PR body exact-head metadata must match the current PR head.",
        }
      : null,
    owner_approval_allowed: verdict === "BLOCKED" ? false : null,
    merge_ready_allowed: verdict === "BLOCKED" ? false : null,
    forbidden_next_actions: verdict === "BLOCKED"
      ? ["owner_exact_head_approval", "request_owner_exact_head_decision", "mark_merge_ready", "merge"]
      : [],
    inventory: {
      machine_ref_fields: refs.length,
      exact_head_sha: exactHead,
      actual_head: actualHead,
    },
    blockers,
    warnings,
    required_next_actions: blockers.map((blocker) => ({
      item_id: blocker.item_id,
      action: blocker.item_id === "METADATA-REF-001"
        ? "Remove placeholder machine ref fields until real evidence paths or comment URLs exist."
        : "Refresh PR body metadata for the current exact head.",
    })),
  };
}

function finding(itemId, overrides = {}) {
  const defaults = {
    "METADATA-REF-001": ["machine_ref_placeholder", "Machine ref field contains placeholder text.", "machine_ref"],
    "METADATA-HEAD-001": ["exact_head_mismatch", "PR body exact_head_sha does not match actual head.", "exact_head_sha"],
    "METADATA-CELL-001": ["cell_id_missing", "CELL-ID is missing from cell metadata.", "CELL-ID"],
  };
  const [code, message, path] = defaults[itemId] ?? ["metadata_error", "Metadata check failed.", "metadata"];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    path: overrides.path ?? path,
    value: overrides.value,
  };
}

function isPlaceholder(value) {
  const cleaned = normalizePlaceholder(value);
  return PLACEHOLDERS.has(cleaned);
}

function cleanValue(value) {
  return String(value ?? "").trim().replace(/^["'`]|["'`]$/g, "").split(/\s+#/)[0].trim();
}

function normalizePlaceholder(value) {
  return cleanValue(value).toLowerCase();
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.item_id}:${finding.path}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringOption(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const prBodyPath = stringOption(options["pr-body"]);
  const format = stringOption(options.format) ?? "json";
  const prBody = prBodyPath && existsSync(prBodyPath) ? readFileSync(prBodyPath, "utf8") : "";
  const result = buildPrBodyMetadataCheck({
    prBody,
    actualRepo: stringOption(options["actual-repo"]),
    actualHead: stringOption(options["actual-head"]),
  });
  if (format === "json") process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  main();
}
