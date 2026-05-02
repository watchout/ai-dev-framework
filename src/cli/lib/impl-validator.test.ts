/**
 * Tests for impl-validator (Sub-PR 1.1 of lead-impl-workflow Phase 1).
 *
 * Covers:
 * - All 10 required sections present + evidence labels → PASS
 * - §1〜§7 + §9〜§10 (§8 absent, optional) → PASS
 * - §1 missing → WARNING
 * - Evidence label count == 0 → BLOCK
 * - Evidence label 3 種 ([検証済] / [文献確認] / [推測]) → count == 3
 * - Self-dogfood: parent IMPL `lead-impl-workflow/IMPL.md` returns PASS or WARNING
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  validateImpl,
  EVIDENCE_LABEL_RE,
  REQUIRED_SECTIONS,
} from "./impl-validator.js";

function withTempImpl<T>(content: string, fn: (filePath: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-impl-validator-"));
  const filePath = path.join(dir, "IMPL.md");
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return fn(filePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ALL_SECTIONS = `## §1 アーキテクチャ概観
content [検証済: smoke run]

## §2 モジュール構造
content

## §3 実装順序
content

## §4 コードパターン
content

## §5 既存コードからの移行
content

## §6 サブPR
content

## §7 契約
content

## §8 Phase 0 bootstrap
content

## §9 Open decisions
content

## §10 lead 責任
content
`;

describe("impl-validator", () => {
  it("returns PASS when all 10 sections + at least one evidence label are present", () => {
    withTempImpl(ALL_SECTIONS, (file) => {
      const result = validateImpl(file);
      expect(result.status).toBe("PASS");
      expect(result.missingSections).toEqual([]);
      expect(result.evidenceLabelCount).toBeGreaterThanOrEqual(1);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  it("returns WARNING when §8 header is absent (cycle 2: §8 header always required per ARC ruling)", () => {
    const without8 = ALL_SECTIONS.replace(/## §8 Phase 0 bootstrap\ncontent\n\n/, "");
    withTempImpl(without8, (file) => {
      const result = validateImpl(file);
      expect(result.status).toBe("WARNING");
      expect(result.missingSections).toContain("§8 Phase 0");
    });
  });

  it("returns PASS when §8 header is present with body '該当なし' (cycle 2: header required, body free)", () => {
    const naBody = ALL_SECTIONS.replace(
      "## §8 Phase 0 bootstrap\ncontent",
      "## §8 Phase 0 bootstrap\n\n該当なし",
    );
    withTempImpl(naBody, (file) => {
      const result = validateImpl(file);
      expect(result.status).toBe("PASS");
      expect(result.missingSections).toEqual([]);
    });
  });

  it("returns WARNING when §1 is missing but evidence label exists", () => {
    const without1 = ALL_SECTIONS.replace(/## §1 アーキテクチャ概観\ncontent \[検証済: smoke run\]\n\n/, "");
    // Re-introduce evidence label elsewhere so status is WARNING (missing section), not BLOCK (no evidence).
    const content = without1.replace("## §2 モジュール構造\ncontent", "## §2 モジュール構造\ncontent [検証済]");
    withTempImpl(content, (file) => {
      const result = validateImpl(file);
      expect(result.status).toBe("WARNING");
      expect(result.missingSections).toContain("§1 アーキテクチャ概観");
      expect(result.warnings.some((w) => w.type === "missing_section")).toBe(true);
    });
  });

  it("returns BLOCK when no evidence label is present", () => {
    const noEvidence = ALL_SECTIONS.replace(" [検証済: smoke run]", "");
    withTempImpl(noEvidence, (file) => {
      const result = validateImpl(file);
      expect(result.status).toBe("BLOCK");
      expect(result.evidenceLabelCount).toBe(0);
      expect(result.errors.some((e) => e.type === "no_evidence_label")).toBe(true);
    });
  });

  it("counts all 3 evidence label variants ([検証済] / [文献確認] / [推測])", () => {
    const triLabel = `${ALL_SECTIONS}
extra [文献確認: parent SPEC FR-L2]
extra [推測: not yet observed]
`;
    withTempImpl(triLabel, (file) => {
      const result = validateImpl(file);
      expect(result.evidenceLabelCount).toBeGreaterThanOrEqual(3);
    });
  });

  it("REQUIRED_SECTIONS exposes 10 entries, all required (cycle 2: §8 always required)", () => {
    expect(REQUIRED_SECTIONS).toHaveLength(10);
    const eight = REQUIRED_SECTIONS.find((s) => s.label === "§8 Phase 0");
    expect(eight).toBeDefined();
  });

  it("EVIDENCE_LABEL_RE matches all 3 Japanese label variants", () => {
    const sample = "[検証済] [文献確認] [推測]";
    const matches = sample.match(EVIDENCE_LABEL_RE) ?? [];
    expect(matches).toHaveLength(3);
  });

  // Self-dogfood: validate the parent IMPL.md that authorizes this very PR.
  it("self-dogfood: parent lead-impl-workflow/IMPL.md returns PASS or WARNING (never BLOCK)", () => {
    const parentImpl = path.resolve(
      process.cwd(),
      "docs/specs/lead-impl-workflow/IMPL.md",
    );
    if (!fs.existsSync(parentImpl)) {
      // Skip when not running inside the ADF repo (e.g. consumer environments).
      return;
    }
    const result = validateImpl(parentImpl);
    expect(["PASS", "WARNING"]).toContain(result.status);
    expect(result.evidenceLabelCount).toBeGreaterThan(0);
  });
});
