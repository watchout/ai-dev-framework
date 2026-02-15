/**
 * Gate C scaffold generator.
 *
 * Reads existing SSOT feature spec files and generates missing §3-E/F/G/H
 * section templates that can be filled in to pass Gate C.
 *
 * Usage: framework gate scaffold [--dry-run]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ProfileType } from "./profile-model.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ScaffoldResult {
  filePath: string;
  relativePath: string;
  missingSections: string[];
  scaffolded: boolean;
}

// ─────────────────────────────────────────────
// Section detection (same patterns as gate-engine)
// ─────────────────────────────────────────────

const SECTION_PATTERNS: Record<string, RegExp> = {
  "§3-E": /§3-E|§ *3-E|### .*入出力例|## .*入出力例|input.*output.*example/i,
  "§3-F": /§3-F|§ *3-F|### .*境界値|## .*境界値|boundary/i,
  "§3-G": /§3-G|§ *3-G|### .*例外応答|## .*例外応答|exception.*response/i,
  "§3-H": /§3-H|§ *3-H|### .*Gherkin|## .*Gherkin|Scenario:/i,
};

// ─────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────

function templateE(featureId: string): string {
  return `
## §3-E 入出力例
<!-- AUTO-GENERATED: 要レビュー -->

| # | 入力 | 条件 | 期待出力 | 備考 |
|---|------|------|---------|------|
| 1 | ${featureId}: 正常な入力値 | 正常 | 200, 期待されるレスポンス | 基本の正常系 |
| 2 | ${featureId}: 別の正常入力 | 正常（別パターン） | 200, 期待されるレスポンス | 正常系バリエーション |
| 3 | ${featureId}: 不正な入力値 | バリデーションエラー | 400, VAL_xxx | |
| 4 | ${featureId}: 存在しないリソース | リソース不在 | 404, RES_xxx | |
| 5 | ${featureId}: 権限なし | 権限不足 | 403, PERM_xxx | |
`;
}

function templateF(featureId: string): string {
  return `
## §3-F 境界値
<!-- AUTO-GENERATED: 要レビュー -->

| 項目 | 最小値 | 最大値 | 空 | NULL | 不正形式 |
|------|--------|--------|-----|------|---------|
| field1 | (最小値) | (最大値) | "" → VAL_xxx | null → VAL_xxx | (不正形式) → VAL_xxx |
| field2 | (最小値) | (最大値) | "" → VAL_xxx | null → VAL_xxx | (不正形式) → VAL_xxx |
`;
}

function templateG(featureId: string): string {
  return `
## §3-G 例外応答
<!-- AUTO-GENERATED: 要レビュー -->

| # | 例外条件 | HTTPステータス | エラーコード | ユーザーメッセージ | リトライ可否 | 復旧方法 |
|---|---------|---------------|------------|-----------------|------------|---------|
| 1 | バリデーションエラー | 400 | VAL_xxx | 「入力内容を確認してください」 | No | 入力修正 |
| 2 | 認証エラー | 401 | AUTH_xxx | 「認証が必要です」 | No | 再ログイン |
| 3 | 権限不足 | 403 | PERM_xxx | 「権限がありません」 | No | 管理者に依頼 |
| 4 | リソース不在 | 404 | RES_xxx | 「見つかりませんでした」 | No | 正しいIDを指定 |
| 5 | サーバーエラー | 500 | SYS_xxx | 「一時的なエラーが発生しました」 | Yes | 自動復旧 |
`;
}

function templateH(featureId: string): string {
  return `
## §3-H Gherkin
<!-- AUTO-GENERATED: 要レビュー -->

\`\`\`gherkin
Feature: ${featureId}

  Scenario: 正常系 - 基本操作
    Given 前提条件が満たされている
    When 正常な操作を実行する
    Then ステータスコード 200 が返される
    And 期待されるレスポンスが返される

  Scenario: 異常系 - バリデーションエラー
    Given 前提条件が満たされている
    When 不正な入力で操作を実行する
    Then ステータスコード 400 が返される
    And エラーコード "VAL_xxx" が返される

  Scenario: 異常系 - 認証エラー
    Given ユーザーが未認証
    When 操作を実行する
    Then ステータスコード 401 が返される
    And エラーコード "AUTH_xxx" が返される
\`\`\`
`;
}

// ─────────────────────────────────────────────
// Feature ID extraction
// ─────────────────────────────────────────────

/**
 * Extract a feature ID from a file name or content.
 * e.g. "AUTH-001_login.md" → "AUTH-001"
 * e.g. "# AUTH-001 Login" → "AUTH-001"
 */
function extractFeatureId(filePath: string, content: string): string {
  const baseName = path.basename(filePath, ".md");

  // Try file name pattern: PREFIX-NNN_description
  const fileMatch = baseName.match(/^([A-Z]+-\d+)/);
  if (fileMatch) return fileMatch[1];

  // Try content: # PREFIX-NNN
  const headingMatch = content.match(/^#\s+([A-Z]+-\d+)/m);
  if (headingMatch) return headingMatch[1];

  // Fallback to file name
  return baseName;
}

// ─────────────────────────────────────────────
// Required sections per profile
// ─────────────────────────────────────────────

function getRequiredSectionIds(profileType?: ProfileType): string[] {
  if (profileType === "api" || profileType === "cli") {
    return ["§3-E", "§3-G", "§3-H"]; // §3-F optional
  }
  return ["§3-E", "§3-F", "§3-G", "§3-H"];
}

// ─────────────────────────────────────────────
// Main scaffold function
// ─────────────────────────────────────────────

/**
 * Scan SSOT files and scaffold missing §3-E/F/G/H sections.
 *
 * @param projectDir - Project root directory
 * @param dryRun - If true, only report what would be generated (don't write)
 * @param profileType - Project profile type (affects required sections)
 * @returns Array of scaffold results
 */
export function scaffoldGateCsections(
  projectDir: string,
  dryRun: boolean,
  profileType?: ProfileType,
): ScaffoldResult[] {
  const results: ScaffoldResult[] = [];
  const requiredIds = getRequiredSectionIds(profileType);

  // Search the same directories as gate-engine
  const searchDirs = [
    "docs/design/features",
    "docs/common-features",
    "docs/project-features",
    "docs/ssot",
    "docs/03_ssot",
  ];

  const files: string[] = [];
  for (const dir of searchDirs) {
    const fullDir = path.join(projectDir, dir);
    if (fs.existsSync(fullDir)) {
      collectSpecFiles(fullDir, files);
    }
  }

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const relativePath = path.relative(projectDir, filePath);
    const featureId = extractFeatureId(filePath, content);
    const missingSections: string[] = [];

    // Check which required sections are missing
    for (const sectionId of requiredIds) {
      const pattern = SECTION_PATTERNS[sectionId];
      if (pattern && !pattern.test(content)) {
        missingSections.push(sectionId);
      }
    }

    if (missingSections.length === 0) {
      results.push({
        filePath,
        relativePath,
        missingSections: [],
        scaffolded: false,
      });
      continue;
    }

    // Generate scaffold content
    if (!dryRun) {
      let appendContent = "\n";
      for (const sectionId of missingSections) {
        switch (sectionId) {
          case "§3-E":
            appendContent += templateE(featureId);
            break;
          case "§3-F":
            appendContent += templateF(featureId);
            break;
          case "§3-G":
            appendContent += templateG(featureId);
            break;
          case "§3-H":
            appendContent += templateH(featureId);
            break;
        }
      }
      fs.appendFileSync(filePath, appendContent, "utf-8");
    }

    results.push({
      filePath,
      relativePath,
      missingSections,
      scaffolded: !dryRun,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// File collection (simplified version of gate-engine's)
// ─────────────────────────────────────────────

const NON_SPEC_PATTERNS = /^(REPORT|GUIDE|ANALYSIS|CHECKLIST|PROGRESS|RULES|WORKFLOW|TEMPLATE|INDEX|VISION|DEPLOYMENT|SSOT-[0-5]_)/i;
const SKIP_DIR_PATTERNS = /^(_non_ssot|_archived|_archived_progress|reports|drafts|phase0_)/i;

function collectSpecFiles(dir: string, result: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIR_PATTERNS.test(entry.name)) continue;
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      collectSpecFiles(fullPath, result);
    } else if (
      entry.name.endsWith(".md") &&
      !entry.name.startsWith("_") &&
      !entry.name.startsWith(".")
    ) {
      const lower = entry.name.toLowerCase();
      if (
        lower === "readme.md" ||
        lower === "_index.md" ||
        lower === "_template.md" ||
        lower === "customization_log.md"
      ) {
        continue;
      }
      if (NON_SPEC_PATTERNS.test(entry.name)) continue;

      // Skip stub files (< 10 lines)
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.split("\n").length < 10) continue;
      } catch {
        continue;
      }

      result.push(fullPath);
    }
  }
}
