/**
 * Tests for layer-detector.ts (ADR-016 Phase C-3)
 */
import { describe, it, expect } from "vitest";
import {
  detectLayers,
  generateTaskList,
  type Layer,
} from "./layer-detector.js";

// ─────────────────────────────────────────────
// detectLayers
// ─────────────────────────────────────────────

describe("detectLayers", () => {
  it("detects UI-only for error page feature", () => {
    const result = detectLayers(
      "エラーページ（404, 403, 500）を表示するコンポーネント",
      "ERR-001",
    );
    expect(result.layers).toEqual(["UI"]);
    expect(result.confidence).toBe("high");
  });

  it("detects all layers for full-stack feature", () => {
    const result = detectLayers(
      "ユーザープロフィールをDBから取得しAPIで返しページに表示",
      "ACCT-002",
    );
    expect(result.layers).toContain("DB");
    expect(result.layers).toContain("API");
    expect(result.layers).toContain("UI");
    expect(result.confidence).toBe("high");
  });

  it("defaults to full set when nothing detected", () => {
    const result = detectLayers("何かをする機能", "MISC-001");
    expect(result.layers).toEqual(["DB", "API", "UI"]);
    expect(result.confidence).toBe("medium");
  });

  it("detects API-only for middleware feature", () => {
    const result = detectLayers(
      "認証APIエンドポイントにレート制限ミドルウェアを追加",
      "AUTH-003",
    );
    expect(result.layers).toContain("API");
    expect(result.layers).not.toContain("UI");
    expect(result.confidence).toBe("high");
  });

  it("detects DB+API for batch job feature", () => {
    const result = detectLayers(
      "夜間バッチでDBのステータスを更新するAPIジョブ",
      "BATCH-001",
    );
    expect(result.layers).toContain("DB");
    expect(result.layers).toContain("API");
    expect(result.layers).not.toContain("UI");
  });

  it("detects DB for migration feature", () => {
    const result = detectLayers(
      "ユーザーテーブルにis_activeカラムを追加するマイグレーション",
      "DB-001",
    );
    expect(result.layers).toContain("DB");
  });

  it("detects UI for layout/navigation feature", () => {
    const result = detectLayers(
      "サイドバーナビゲーションのレイアウト変更",
      "UI-001",
    );
    expect(result.layers).toEqual(["UI"]);
  });

  it("detects API for server endpoint feature", () => {
    const result = detectLayers(
      "GET /api/healthエンドポイントの実装",
      "API-001",
    );
    expect(result.layers).toContain("API");
  });

  it("detects DB+UI for Prisma + form feature", () => {
    const result = detectLayers(
      "Prismaスキーマに予約テーブルを追加し、予約フォームを実装",
      "RES-001",
    );
    expect(result.layers).toContain("DB");
    expect(result.layers).toContain("UI");
  });
});

// ─────────────────────────────────────────────
// generateTaskList
// ─────────────────────────────────────────────

describe("generateTaskList", () => {
  it("generates 4 tasks for UI-only", () => {
    const tasks = generateTaskList(["UI"]);
    const required = tasks.filter((t) => t.required);
    expect(required).toHaveLength(4);
    expect(required.map((t) => t.type)).toEqual(["TEST", "UI", "INTEGRATION", "REVIEW"]);
  });

  it("generates 6 tasks for full layers", () => {
    const tasks = generateTaskList(["DB", "API", "UI"]);
    const required = tasks.filter((t) => t.required);
    expect(required).toHaveLength(6);
  });

  it("generates 4 tasks for API-only", () => {
    const tasks = generateTaskList(["API"]);
    const required = tasks.filter((t) => t.required);
    expect(required).toHaveLength(4);
    expect(required.map((t) => t.type)).toEqual(["TEST", "API", "INTEGRATION", "REVIEW"]);
  });

  it("generates 5 tasks for DB+API", () => {
    const tasks = generateTaskList(["DB", "API"]);
    const required = tasks.filter((t) => t.required);
    expect(required).toHaveLength(5);
    expect(required.map((t) => t.type)).toEqual(["TEST", "DB", "API", "INTEGRATION", "REVIEW"]);
  });

  it("TEST, INTEGRATION, REVIEW are always required even with empty layers", () => {
    const tasks = generateTaskList([]);
    const required = tasks.filter((t) => t.required);
    expect(required).toHaveLength(3);
    expect(required.map((t) => t.type)).toEqual(["TEST", "INTEGRATION", "REVIEW"]);
  });

  it("skipped tasks have reason", () => {
    const tasks = generateTaskList(["UI"]);
    const dbTask = tasks.find((t) => t.type === "DB");
    expect(dbTask?.required).toBe(false);
    expect(dbTask?.reason).toContain("不要");
  });
});
