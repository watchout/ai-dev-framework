/**
 * Template generators for project initialization files.
 * Based on: 09_TOOLCHAIN.md, templates/project/CLAUDE.md
 */

import type { ProfileType } from "./profile-model.js";

export interface ProjectConfig {
  projectName: string;
  description: string;
  profileType?: ProfileType;
}

export function generateClaudeMd(config: ProjectConfig): string {
  const today = new Date().toISOString().split("T")[0];

  return `# CLAUDE.md - Project Instructions (for Claude Code)

> Claude Code reads this file automatically.
> All specifications are in docs/.

---

## AI Interruption Protocol (Highest Priority Rule)

Stop immediately and ask the user in these cases:

1. A specification decision is needed but not in SSOT
2. SSOT wording is ambiguous with multiple interpretations
3. Multiple valid technical approaches exist
4. Contradiction between SSOT and existing implementation
5. Coding standards do not cover the current case
6. Impact scope of a change is unclear
7. A business decision is required

"Guessing" and "just use a placeholder" are PROHIBITED.

## Project Overview

| Item | Value |
|------|-------|
| Product | ${config.projectName} |
| Description | ${config.description} |
| Created | ${today} |
| Tech Stack | Next.js 15 / React 19 / TypeScript / Vitest / Vercel |

---

## Specification Reference

### Before implementation, always check (in order):

\`\`\`
1. Feature specs       -> docs/design/features/
2. Core definitions    -> docs/design/core/
   - UI/State          -> docs/design/core/SSOT-2_UI_STATE.md
   - API rules         -> docs/design/core/SSOT-3_API_CONTRACT.md
   - Data model        -> docs/design/core/SSOT-4_DATA_MODEL.md
   - Cross-cutting     -> docs/design/core/SSOT-5_CROSS_CUTTING.md
3. Dev standards       -> docs/standards/
4. PRD                 -> docs/requirements/SSOT-0_PRD.md
\`\`\`

## Directory Structure

\`\`\`
src/
├── app/              <- App Router pages
├── components/       <- UI components
├── lib/              <- Utilities
├── hooks/            <- React hooks
├── types/            <- TypeScript types
├── services/         <- Business logic
└── __tests__/        <- Tests

docs/
├── idea/             <- Idea validation
├── requirements/     <- PRD, Feature Catalog
├── design/           <- Core + Features + ADR
├── standards/        <- Dev standards
├── operations/       <- Operations
├── marketing/        <- Marketing
├── growth/           <- Growth
└── management/       <- Project management
\`\`\`

## Coding Standards

- Components: PascalCase (\`LoginForm.tsx\`)
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case (except components)
- Max ~200 lines per file
- No \`any\` type
- No \`console.log\` in production code
- No hardcoded environment variables

## Prohibited

- Do NOT implement features not in specs
- Do NOT modify core definitions without ADR
- Do NOT submit PRs without tests
- Do NOT swallow errors

## Pre-Code Gate (3-gate enforcement)

コードを1行でも書く前に Gate A/B/C を確認する。
状態は .framework/gates.json で管理。

- Gate A: 開発環境（package.json, node_modules, .env, docker-compose等）
- Gate B: 計画（.framework/plan.json にwave分類済み、GitHub Issues作成済み）
- Gate C: SSOT完全性（機能仕様書に §3-E/F/G/H が記入済み）

全Gate passed でなければ src/ 以下の編集は .claude/hooks/pre-code-gate.sh でブロックされる。

## Workflow Orchestration

ユーザーの発言に応じて以下のワークフローを実行:

### 「ディスカバリー」「何を作りたい？」
→ docs/standards/ の Discovery テンプレートに従い5ステージのヒアリングを実施

### 「仕様を作って」「スペック」
→ 1ドキュメントずつ生成・確認。PRD → Feature Catalog → Core定義 → 各機能SSOT

### 「実装計画」「タスク分解」
→ 全SSOTの依存関係を分析し、Wave分類・GitHub Issues作成

### 「実装開始」「コードを書いて」
→ .framework/gates.json を確認。全Gate passed なら実装開始。未通過なら報告。

### 「レビュー」「監査」
→ コード品質チェックリストに基づき監査

## Knowledge & Memory

### セッション開始時に参照
- .claude/memory/ — ADR（設計判断記録）、バグ教訓、改善記録
- docs/standards/KNOWLEDGE_DIGEST.md — フレームワーク知識のダイジェスト

### 実装中に参照
- 設計判断で迷った時 → .claude/memory/ の過去ADRを確認
- 同じバグを繰り返さないために → .claude/memory/ のバグ教訓を確認
- フレームワークの規約を確認 → docs/standards/KNOWLEDGE_DIGEST.md
`;
}

export function generateCursorRules(config: ProjectConfig): string {
  return `# .cursorrules - IDE Instructions

## Project: ${config.projectName}

${config.description}

## Highest Priority Rule

When specification is unclear or missing, STOP and ask. Do not guess.

## Before Coding

1. Read the relevant feature spec in docs/design/features/
2. Check core definitions in docs/design/core/
3. Follow coding standards in docs/standards/

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript 5.7
- Vitest for testing
- Vercel for hosting

## Code Style

- PascalCase for components
- camelCase for functions/variables
- UPPER_SNAKE_CASE for constants
- kebab-case for non-component files
- ~200 lines max per file
- No \`any\`, no \`console.log\` in production

## Specification Locations

- PRD: docs/requirements/SSOT-0_PRD.md
- Features: docs/requirements/SSOT-1_FEATURE_CATALOG.md
- UI/State: docs/design/core/SSOT-2_UI_STATE.md
- API: docs/design/core/SSOT-3_API_CONTRACT.md
- Data: docs/design/core/SSOT-4_DATA_MODEL.md
- Cross-cutting: docs/design/core/SSOT-5_CROSS_CUTTING.md
`;
}

export function generateGitignore(): string {
  return `# Dependencies
node_modules/
.pnp
.pnp.js

# Next.js
.next/
out/

# Build
dist/

# Testing
coverage/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Framework state (logs only - state is gitignored)
.framework/logs/

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
`;
}

export function generateReadme(config: ProjectConfig): string {
  return `# ${config.projectName}

> ${config.description}

## Setup

\`\`\`bash
npm install
npm run dev
\`\`\`

## Documentation

All specifications are in \`docs/\`. See [docs/INDEX.md](docs/INDEX.md) for the full inventory.

| Directory | Content |
|-----------|---------|
| \`docs/idea/\` | Idea validation |
| \`docs/requirements/\` | Requirements (PRD, Feature Catalog) |
| \`docs/design/\` | Design (Core, Features, ADR) |
| \`docs/standards/\` | Development standards |
| \`docs/operations/\` | Operations |
| \`docs/marketing/\` | Marketing |

## Development

- **Claude Code CLI**: Interactive implementation, debugging
- **Claude Code Web**: Async execution of spec-confirmed tasks

See \`CLAUDE.md\` for detailed instructions.
`;
}

export function generateStartHere(config: ProjectConfig): string {
  return `# ${config.projectName} — 開発開始ガイド

このファイルを読んで、指示に従って進めてください。

## あなたのタスク

CLAUDE.md を読んで、フレームワークの手順に従ってプロジェクトを立ち上げてください。

IDEA_CANVAS.md が存在しないので、ディスカバリーフローから開始してください。

## ルール

- 質問は1回に1つだけ（まとめて聞かない）
- 各ドキュメントは1つずつ生成して、都度ユーザーの確認を挟む
- 全Phase完了後、Gate A/B/C を通過させて開発可能な状態にする

## フロー

\`\`\`
Phase 1: ディスカバリー（ヒアリング → IDEA_CANVAS等を生成）
Phase 2: 事業設計（IDEA_CANVAS → PERSONA → COMPETITOR → VALUE_PROP）
Phase 3: プロダクト設計（PRD → FEATURE_CATALOG → UI_STATE → 各機能SSOT）
Phase 4: 技術設計（TECH_STACK → API → DB → CROSS_CUTTING → 規約）
Phase 5: 実装計画（framework plan → Gate B 通過）
Phase 6: 環境構築（Gate A 通過）
Phase 7: SSOT品質確認（Gate C 通過）
Phase 8: 開発開始
\`\`\`

まず「どんなサービスを作りたいですか？」から始めてください。
`;
}

export function generateDocsIndex(): string {
  return `# Document Index

## Specifications

### Idea Validation (docs/idea/)
| Document | Status | Description |
|----------|--------|-------------|
| IDEA_CANVAS.md | Pending | Idea Canvas |
| USER_PERSONA.md | Pending | User Persona |
| COMPETITOR_ANALYSIS.md | Pending | Competitor Analysis |
| VALUE_PROPOSITION.md | Pending | Value Proposition |

### Requirements (docs/requirements/)
| Document | Status | Description |
|----------|--------|-------------|
| SSOT-0_PRD.md | Pending | Product Requirements |
| SSOT-1_FEATURE_CATALOG.md | Pending | Feature Catalog |

### Design (docs/design/)
| Document | Status | Description |
|----------|--------|-------------|
| core/SSOT-2_UI_STATE.md | Pending | UI/State Transitions |
| core/SSOT-3_API_CONTRACT.md | Pending | API Contract |
| core/SSOT-4_DATA_MODEL.md | Pending | Data Model |
| core/SSOT-5_CROSS_CUTTING.md | Pending | Cross-Cutting Concerns |

### Development Standards (docs/standards/)
| Document | Status | Description |
|----------|--------|-------------|
| TECH_STACK.md | Pending | Tech Stack |
| CODING_STANDARDS.md | Pending | Coding Standards |
| GIT_WORKFLOW.md | Pending | Git Workflow |
| TESTING_STANDARDS.md | Pending | Testing Standards |

### Operations (docs/operations/)
| Document | Status | Description |
|----------|--------|-------------|
| ENVIRONMENTS.md | Pending | Environment Config |
| DEPLOYMENT.md | Pending | Deployment |
| MONITORING.md | Pending | Monitoring |
| INCIDENT_RESPONSE.md | Pending | Incident Response |

### Marketing (docs/marketing/)
| Document | Status | Description |
|----------|--------|-------------|
| LP_SPEC.md | Pending | Landing Page Spec |
| SNS_STRATEGY.md | Pending | SNS Strategy |
| EMAIL_SEQUENCE.md | Pending | Email Sequence |
| LAUNCH_PLAN.md | Pending | Launch Plan |
| PRICING_STRATEGY.md | Pending | Pricing Strategy |

### Growth (docs/growth/)
| Document | Status | Description |
|----------|--------|-------------|
| GROWTH_STRATEGY.md | Pending | Growth Strategy |
| METRICS_DEFINITION.md | Pending | Metrics Definition |

### Project Management (docs/management/)
| Document | Status | Description |
|----------|--------|-------------|
| PROJECT_PLAN.md | Pending | Project Plan |
| RISKS.md | Pending | Risk Management |
| CHANGES.md | Pending | Change Management |
`;
}

/**
 * Agent definition for visual-tester (.claude/agents/visual-tester.md)
 * Reference: 20_VISUAL_TEST.md §4, 09_TOOLCHAIN.md §8
 */
export function generateVisualTesterAgent(config: ProjectConfig): string {
  return `# Visual Tester Agent

ブラウザベースのビジュアルテストを実行する専門エージェント。
Playwright MCP を使用して画面表示・操作フロー・状態表示を検証する。

> このエージェントは \`${config.projectName}\` のビジュアルテストに使用する。

## 実行手順

1. 開発サーバーの起動を確認する（http://localhost:3000）
2. 指定された機能のSSOTを読み込む（docs/design/features/）
3. SSOTの §6 UI仕様に基づいてテストを実行する
4. 各テストレベルを順番に実施する:
   - Level 1: 画面表示テスト（スクリーンショット取得）
   - Level 2: 操作フローテスト（ユーザーフロー再現）
   - Level 3: 状態表示テスト（全状態を再現・確認）
   - Level 4: レスポンシブテスト（デスクトップ/タブレット/モバイル）
5. 品質スコアカードに基づいて採点する
6. 結果を tests/visual/reports/ に出力する

## 確認観点

- SSOTの §6.2 レイアウト図と実際の表示の一致
- 全UI要素の存在確認（ボタン、ラベル、入力欄、アイコン）
- テキスト切れ・はみ出しの有無
- 余白・アラインメントの適切さ
- コンソールエラーの有無
- 操作レスポンス（3秒以内）

## 報告形式

各テストについて以下を報告:
- スクリーンショット（パス）
- SSOTとの差異リスト
- 問題の重大度（Critical / Major / Minor）
- 品質スコア（100点満点）

## 制約

- ファイルの変更は行わない（読み取りとテスト実行のみ）
- 問題を発見しても自動修正しない（報告のみ）
- テスト結果は tests/visual/ 配下のみに保存する
`;
}

/**
 * Agent definition for code-reviewer (.claude/agents/code-reviewer.md)
 * Reference: 17_CODE_AUDIT.md, 09_TOOLCHAIN.md §8
 */
export function generateCodeReviewerAgent(config: ProjectConfig): string {
  return `# Code Reviewer Agent

Adversarial Review の Role B として機能する。
実装コードを批判的にレビューし、問題を報告する専門エージェント。

> このエージェントは \`${config.projectName}\` のコードレビューに使用する。

## 実行手順

1. 対象ファイルを読み込む
2. 対応するSSOTを読み込む（docs/design/features/）
3. コーディング規約を読み込む（docs/standards/CODING_STANDARDS.md）
4. 品質スコアカードに基づいて採点する
5. 問題を重大度別にリストアップする
6. 修正提案を報告する

## 確認観点

### SSOT準拠
- MUST要件が全て実装されているか
- APIエンドポイントがSSOT-3と一致するか
- データモデルがSSOT-4と一致するか
- エラーコードがSSOT-5の体系に従っているか

### セキュリティ
- 認証チェック漏れがないか
- 権限チェック漏れがないか
- SQLインジェクション対策があるか
- XSS対策があるか

### コード品質
- any型の使用がないか
- エラーハンドリングが適切か
- 未使用の変数・インポートがないか
- コーディング規約に違反していないか

## 制約

- ファイルの変更は行わない（読み取りと報告のみ）
- 問題を発見しても自動修正しない（報告のみ）
- 主観的な「好み」ではなく、SSOT・規約に基づいた客観的指摘のみ
`;
}

/**
 * Agent definition for ssot-explorer (.claude/agents/ssot-explorer.md)
 * Reference: 12_SSOT_FORMAT.md, 09_TOOLCHAIN.md §8
 */
export function generateSsotExplorerAgent(config: ProjectConfig): string {
  return `# SSOT Explorer Agent

docs/ 配下のSSOTドキュメントを検索・要約する専門エージェント。
メインエージェントの実装作業中にSSOT参照が必要な場合に起動される。

> このエージェントは \`${config.projectName}\` のSSOT検索に使用する。

## 実行手順

1. 指定されたキーワード / 機能ID でSSOTを検索する
2. 該当するファイルとセクションを特定する
3. 関連する情報を以下のソースから横断的に収集する:
   - docs/design/features/（機能仕様）
   - docs/design/core/（コア定義）
   - docs/idea/（ビジネス要件）
   - docs/requirements/（PRD、機能カタログ）
4. 要約して報告する

## 検索パターン

### 機能ID検索
入力: "AUTH-001"
→ 該当するSSOTの全内容を要約
→ 関連する SSOT-3（API）、SSOT-4（DB）、SSOT-5（横断）の該当箇所も抽出

### キーワード検索
入力: "認証" or "セッション"
→ 該当する全SSOTから関連セクションを抽出
→ 重複を除去して要約

## 制約

- ファイルの変更は行わない（読み取りのみ）
- SSOTの内容を解釈・推測しない（記載内容のみ報告）
- 矛盾を発見した場合は警告として報告する
`;
}

/** Agent template definition */
export interface AgentTemplate {
  filename: string;
  generate: (config: ProjectConfig) => string;
}

/** All agent templates to create during init */
export const AGENT_TEMPLATES: AgentTemplate[] = [
  { filename: "visual-tester.md", generate: generateVisualTesterAgent },
  { filename: "code-reviewer.md", generate: generateCodeReviewerAgent },
  { filename: "ssot-explorer.md", generate: generateSsotExplorerAgent },
];

export function generateProjectState(config: ProjectConfig): string {
  const now = new Date().toISOString();

  return JSON.stringify(
    {
      name: config.projectName,
      version: "0.1.0",
      profileType: config.profileType ?? "app",
      createdAt: now,
      updatedAt: now,
      phase: -1,
      status: "initialized",
      techStack: {
        framework: "next.js",
        language: "typescript",
        ui: "react",
        testing: "vitest",
        hosting: "vercel",
      },
      config: {
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-20250514",
        autoCommit: false,
        escalationMode: "strict",
      },
    },
    null,
    2,
  );
}
