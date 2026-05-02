/**
 * IMPL.md validator — deterministic checks for the per-feature 施工図 IMPL.md
 * authored by lead-bot in Step 3.4 (Lead IMPL Authoring).
 *
 * Part of ADF v1.2.0 lead-impl-workflow Sub-PR 1.1
 * (parent SPEC `docs/specs/lead-impl-workflow/SPEC.md` FR-L2.1 / FR-L4,
 * parent IMPL `docs/specs/lead-impl-workflow/IMPL.md` §4.1).
 *
 * Checks (all deterministic, NO LLM):
 * 1. Required sections §1〜§10 exist (§8 Phase 0 bootstrap is optional)
 * 2. Evidence label (`[検証済]` / `[文献確認]` / `[推測]`) appears at least once
 *
 * Status semantics:
 * - `evidenceCount === 0`            → BLOCK   (FR-L2.2 violation)
 * - `missing.length > 0` (excl. §8)  → WARNING (FR-L4.3, L1 lead may upgrade to BLOCK)
 * - else                              → PASS
 *
 * Principle #0: No LLM calls in this module.
 */
import * as fs from "node:fs";

// ─────────────────────────────────────────────
// Constants — literal from parent IMPL.md §4.1
// ─────────────────────────────────────────────

/**
 * Required IMPL.md section header patterns (line-anchored, multiline).
 *
 * ARC 裁定 (cycle 2): §8 (Phase 0 bootstrap) HEADER は always required。
 * BODY content は Phase 0 該当時のみ実体記述 (該当しない feature は「該当なし」明記)。
 * Body content の judgment は本 lib scope 外 (Sub-PR 1.7+)。本 lib は HEADER 存在のみ check。
 */
export const REQUIRED_SECTIONS: { re: RegExp; label: string }[] = [
  { re: /^## §1 アーキテクチャ概観/m, label: "§1 アーキテクチャ概観" },
  { re: /^## §2 モジュール構造/m, label: "§2 モジュール構造" },
  { re: /^## §3 実装順序/m, label: "§3 実装順序" },
  { re: /^## §4 コードパターン/m, label: "§4 コードパターン" },
  { re: /^## §5 既存コードからの移行/m, label: "§5 既存コードからの移行" },
  { re: /^## §6 サブPR/m, label: "§6 サブPR" },
  { re: /^## §7 .*契約/m, label: "§7 契約" },
  { re: /^## §8 Phase 0/m, label: "§8 Phase 0" },
  { re: /^## §9 Open decisions/m, label: "§9 Open decisions" },
  { re: /^## §10 lead 責任/m, label: "§10 lead 責任" },
];

/**
 * Evidence label regex — matches the 3 canonical labels in either Japanese
 * or English form, optionally followed by inline qualifier text.
 */
export const EVIDENCE_LABEL_RE =
  /\[(?:検証済 observed|文献確認 referenced|推測 unverified|検証済|文献確認|推測|observed|referenced|unverified|hypothesis|propose)[^\]]*\]/g;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ImplValidationResult {
  status: "PASS" | "WARNING" | "BLOCK";
  missingSections: string[];
  evidenceLabelCount: number;
  errors: ImplFinding[];
  warnings: ImplFinding[];
}

export interface ImplFinding {
  type: "missing_section" | "no_evidence_label" | "empty_section" | "format";
  message: string;
  line?: number;
}

// ─────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────

/**
 * Validate an IMPL.md file at the given absolute path.
 *
 * Throws ENOENT if the file does not exist (caller is responsible for catching).
 * Parse-level surprises (e.g. unexpected encoding) are degraded to WARNING
 * rather than thrown — see §2 of the dispatch.
 */
export function validateImpl(path: string): ImplValidationResult {
  const content = fs.readFileSync(path, "utf-8");

  const missing: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!section.re.test(content)) {
      missing.push(section.label);
    }
  }

  const evidenceCount = (content.match(EVIDENCE_LABEL_RE) ?? []).length;

  const errors: ImplFinding[] =
    evidenceCount === 0
      ? [
          {
            type: "no_evidence_label",
            message:
              "evidence label が 0 件 (FR-L2.2 違反、[検証済] / [文献確認] / [推測] のいずれかが必要)",
          },
        ]
      : [];

  const warnings: ImplFinding[] = missing.map((label) => ({
    type: "missing_section",
    message: `必須セクション欠落: ${label}`,
  }));

  const status: ImplValidationResult["status"] =
    evidenceCount === 0 ? "BLOCK" : missing.length > 0 ? "WARNING" : "PASS";

  return {
    status,
    missingSections: missing,
    evidenceLabelCount: evidenceCount,
    errors,
    warnings,
  };
}
