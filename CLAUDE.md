# CLAUDE.md - AI開発フレームワーク v4.0

> このリポジトリはフレームワーク自体の開発用。プロジェクトへの適用方法は docs/prompts/ を参照。

---

## リポジトリ構成

```
ai-dev-framework/
├── CLAUDE.md              ← このファイル（フレームワーク開発用）
├── specs/                 ← 統合仕様書（8本）
├── archive/v3/            ← 旧仕様書（26本、参照用）
├── .claude/skills/        ← スキルシステム（4スキル）
├── docs/
│   ├── prompts/           ← ブートストラッププロンプト（外部ユーザー向け）
│   ├── knowledge/         ← 知識データベース
│   └── standards/         ← テンプレート（templates/ からコピーされるもの）
├── templates/             ← プロジェクトテンプレート（配布物）
│   ├── ci/                ← CI/CDテンプレート
│   ├── profiles/          ← プロジェクトプロファイル定義
│   ├── project/           ← プロジェクト初期化スクリプト
│   └── skills/            ← スキルテンプレート（配布版）
├── common-features/       ← 共通機能仕様書（完成済み、再利用可能）
├── project-features/      ← 固有機能仕様書テンプレート
├── src/
│   ├── cli/               ← CLIツール（framework コマンド）
│   └── dashboard/         ← ダッシュボード（Next.js）
├── bin/                   ← CLIスクリプト
└── package.json
```

---

## 仕様書参照

統合仕様書（specs/）:
| # | ファイル | 内容 |
|---|---------|------|
| 1 | specs/01_DISCOVERY.md | ディスカバリーフロー |
| 2 | specs/02_GENERATION_CHAIN.md | ドキュメント生成チェーン |
| 3 | specs/03_SSOT_FORMAT.md | SSOT書式 + 監査 |
| 4 | specs/04_FEATURE_SPEC.md | 機能仕様書フロー |
| 5 | specs/05_IMPLEMENTATION.md | 実装順序 + タスク分解 |
| 6 | specs/06_CODE_QUALITY.md | コード監査 + テスト + CI |
| 7 | specs/07_AI_PROTOCOL.md | AIエスカレーション |
| 8 | specs/08_MARKETING.md | マーケティング |

旧仕様書（archive/v3/）:  v3.x の 00-25_*.md、参照のみ

---

## CLI開発ガイド

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `framework init <name>` | プロジェクト初期化 |
| `framework discover` | ディスカバリー実行 |
| `framework generate` | SSOT自動生成 |
| `framework plan` | 実装計画作成（Gate B 自動pass） |
| `framework gate check\|status\|reset\|scaffold` | Pre-Code Gate 管理 |
| `framework audit ssot\|code` | 品質監査（Gate C 自動更新） |
| `framework run` | タスク実行（全Gate通過必須） |
| `framework status` | 進捗表示 |
| `framework retrofit` | 既存プロジェクト導入 |
| `framework update` | フレームワーク更新 |

### CLI実行方法

```bash
# 開発時（tsx直接実行）
npm run framework -- init my-project

# ビルド後
npm run build:cli
./dist/cli/index.js init my-project

# グローバルインストール済み
framework init my-project
```

### テスト

```bash
npm test                    # 全テスト実行
npm test -- --watch         # ウォッチモード
npm test -- gate-engine     # 特定ファイル
```

### CLI開発規約

- コマンドは `src/cli/commands/` に配置
- 共通ロジックは `src/cli/lib/` に配置
- テストは `*.test.ts` として同階層に配置
- `any` 型禁止
- エラーは必ずハンドリング
- コマンド追加時は `src/cli/index.ts` に登録

### ファイル構成パターン

```
新コマンド追加:
  src/cli/commands/xxx.ts      ← コマンド登録（commander）
  src/cli/lib/xxx-engine.ts    ← ビジネスロジック
  src/cli/lib/xxx-model.ts     ← 型定義・データモデル
  src/cli/lib/xxx-engine.test.ts
  src/cli/lib/xxx-model.test.ts
```

---

## Pre-Code Gate（3段階チェック）

フレームワークが適用されたプロジェクトで、実装前に3段階の品質ゲートを強制する仕組み。

```
Gate A: 開発環境（package.json, node_modules, .env, CI）
Gate B: 計画（plan.json, GitHub Issues）
Gate C: SSOT完全性（§3-E/F/G/H）
```

Gate C v4.0 改善:
- `docs/design/core/` と `docs/requirements/` を除外（機能仕様書ではないため）
- プロファイル別要件: lp/hp → 自動pass、api/cli → §3-F任意、app → 全必須
- 空ファイル（<10行）をスキップ
- `framework gate scaffold` で不足セクションのテンプレート自動生成

2層の強制:
1. Claude Code hook（PreToolUse）: `.claude/hooks/pre-code-gate.sh`
2. Git pre-commit hook: `.husky/pre-commit`

---

## ブートストラッププロンプト

外部ユーザーが CLI なしでフレームワークを適用するためのプロンプト:

| ファイル | 用途 |
|---------|------|
| docs/prompts/new-project.txt | 新規プロジェクト（ディスカバリー → 生成チェーン） |
| docs/prompts/existing-project.txt | 既存プロジェクト（スキャン → SSOT逆生成） |
| docs/prompts/QUICKSTART.md | 使い方ガイド |

使い方: Claude Code セッションで .txt ファイルの中身をコピー＆ペースト。

---

## スキルシステム（4スキル構成）

```
.claude/skills/
├── discovery/     ← ディスカバリー + ビジネス設計
├── design/        ← プロダクト設計 + 技術設計
├── implement/     ← 実装
└── review/        ← レビュー + 監査
```

各 SKILL.md に Multi-perspective Check を内蔵:
- Product視点: ユーザーニーズに合致するか？
- Technical視点: 実装可能で保守しやすいか？
- Business視点: ビジネスモデルを支えるか？

---

## ダッシュボード開発

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript 5.7 |
| UI | React 19 |
| テスト | Vitest |

```bash
npm run dev    # http://localhost:3000
```

---

## プロジェクトタイプ別プロファイル

| タイプ | Gate C | TDD | マーケ |
|-------|--------|-----|-------|
| app | 全セクション必須 | CORE/CONTRACT層 | 任意 |
| api | §3-F任意 | 強制 | なし |
| cli | §3-F任意 | 強制 | なし |
| lp | 自動pass | 不要 | 必須 |
| hp | 自動pass | 不要 | 任意 |

---

## 禁止事項

- `any` 型の使用
- `console.log` をプロダクションコードに残す
- テストなしの PR
- エラーの握りつぶし
- 仕様にない機能の追加
