/**
 * Layer detector — Determines which layers (DB/API/UI) a feature requires
 * based on its SSOT specification text.
 *
 * ADR-016 Phase C-3: Adaptive task decomposition
 */
import * as fs from "node:fs";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Layer = "DB" | "API" | "UI";

export interface LayerDetectionResult {
  featureId: string;
  layers: Layer[];
  confidence: "high" | "medium";
  reasons: string[];
}

export interface TaskTemplate {
  type: "TEST" | "DB" | "API" | "UI" | "INTEGRATION" | "REVIEW";
  required: boolean;
  reason: string;
}

// ─────────────────────────────────────────────
// Detection patterns
// ─────────────────────────────────────────────

const DB_PATTERNS = [
  /テーブル|table|スキーマ|schema|マイグレーション|migration/i,
  /データベース|database|DB|永続化|persist/i,
  /リレーション|relation|外部キー|foreign.?key/i,
  /CRUD|create.*read.*update.*delete/i,
  /モデル|model|エンティティ|entity/i,
  /Prisma|Drizzle|prisma|drizzle/i,
  /INSERT|UPDATE|DELETE|SELECT/,
];

const API_PATTERNS = [
  /エンドポイント|endpoint|API|REST|GraphQL/i,
  /リクエスト|request|レスポンス|response/i,
  /GET|POST|PUT|PATCH|DELETE/,
  /認証|authentication|認可|authorization/i,
  /ミドルウェア|middleware/i,
  /サーバー|server|バックエンド|backend/i,
];

const UI_PATTERNS = [
  /画面|ページ|page|view|コンポーネント|component/i,
  /ボタン|button|フォーム|form|入力|input/i,
  /表示|display|レンダリング|render/i,
  /レイアウト|layout|ナビゲーション|navigation/i,
  /UI|UX|ユーザーインターフェース/i,
  /エラーページ|error.?page|404|403|500/i,
  /フロントエンド|frontend/i,
];

// ─────────────────────────────────────────────
// Layer detection
// ─────────────────────────────────────────────

/**
 * Detect which layers a feature requires based on its SSOT specification text.
 */
export function detectLayers(
  featureSpec: string,
  featureId = "",
): LayerDetectionResult {
  const layers: Layer[] = [];
  const reasons: string[] = [];

  // Check DB
  for (const pattern of DB_PATTERNS) {
    if (pattern.test(featureSpec)) {
      if (!layers.includes("DB")) {
        layers.push("DB");
        reasons.push(`DB: ${pattern.source} に合致する記述を検出`);
      }
      break;
    }
  }

  // Check API
  for (const pattern of API_PATTERNS) {
    if (pattern.test(featureSpec)) {
      if (!layers.includes("API")) {
        layers.push("API");
        reasons.push(`API: ${pattern.source} に合致する記述を検出`);
      }
      break;
    }
  }

  // Check UI
  for (const pattern of UI_PATTERNS) {
    if (pattern.test(featureSpec)) {
      if (!layers.includes("UI")) {
        layers.push("UI");
        reasons.push(`UI: ${pattern.source} に合致する記述を検出`);
      }
      break;
    }
  }

  // If nothing detected, default to full set with medium confidence
  if (layers.length === 0) {
    return {
      featureId,
      layers: ["DB", "API", "UI"],
      confidence: "medium",
      reasons: ["レイヤー検出不能: フルセット（DB, API, UI）をデフォルト適用"],
    };
  }

  return {
    featureId,
    layers,
    confidence: "high",
    reasons,
  };
}

/**
 * Read a feature's SSOT file and detect layers.
 */
export function detectLayersFromFile(
  ssotFilePath: string,
  featureId: string,
): LayerDetectionResult {
  if (!fs.existsSync(ssotFilePath)) {
    return {
      featureId,
      layers: ["DB", "API", "UI"],
      confidence: "medium",
      reasons: ["SSOTファイル未検出: フルセット適用"],
    };
  }
  const content = fs.readFileSync(ssotFilePath, "utf-8");
  return detectLayers(content, featureId);
}

// ─────────────────────────────────────────────
// Task list generation
// ─────────────────────────────────────────────

/**
 * Generate the required task list based on detected layers.
 */
export function generateTaskList(layers: Layer[]): TaskTemplate[] {
  return [
    { type: "TEST", required: true, reason: "TDD原則: 常に必要" },
    {
      type: "DB",
      required: layers.includes("DB"),
      reason: layers.includes("DB") ? "DB層: データ永続化あり" : "DB層不要: データ永続化なし",
    },
    {
      type: "API",
      required: layers.includes("API"),
      reason: layers.includes("API") ? "API層: エンドポイントあり" : "API層不要: APIエンドポイントなし",
    },
    {
      type: "UI",
      required: layers.includes("UI"),
      reason: layers.includes("UI") ? "UI層: 画面/コンポーネントあり" : "UI層不要: UIなし",
    },
    { type: "INTEGRATION", required: true, reason: "統合テスト: 常に必要" },
    { type: "REVIEW", required: true, reason: "コードレビュー: 常に必要" },
  ];
}
