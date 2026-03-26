# CLAUDE.md - AI開発フレームワーク v4.0

> このリポジトリはフレームワーク自体の開発用。プロジェクトへの適用方法は docs/prompts/ を参照。

---

## ショートタグ
このプロジェクトのタグは &adf です。
メッセージの先頭が & で始まり、かつ &adf でない場合は「このメッセージは別プロジェクト宛です。該当のBotに転送してください。」と返して、それ以上の処理をしないでください。

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
| `framework init <name>` | プロジェクト初期化（.github/ テンプレート含む） |
| `framework discover` | ディスカバリー実行 |
| `framework generate` | SSOT自動生成 |
| `framework plan` | 実装計画作成（Gate B 自動pass） |
| `framework plan --sync` | 実装計画 → GitHub Issues/Projects 同期 |
| `framework gate check\|status\|reset\|scaffold` | Pre-Code Gate 管理 |
| `framework audit ssot\|code` | 品質監査（Gate C 自動更新） |
| `framework run` | タスク実行（全Gate通過必須、完了時に Issue 自動close） |
| `framework status` | 進捗表示 |
| `framework status --github` | GitHub Issues からライブステータス取得 |
| `framework retrofit` | 既存プロジェクト導入（.github/ テンプレート含む） |
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

## GitHub Integration（specs/05_IMPLEMENTATION.md Part 3-4）

`framework init` / `framework retrofit` 実行時に以下のテンプレートが自動生成される:

```
.github/
├── workflows/ci.yml              ← プロファイル別CI（templates/ci/ から）
├── PULL_REQUEST_TEMPLATE.md      ← SSOT準拠チェックリスト付きPRテンプレート
├── ISSUE_TEMPLATE/
│   ├── feature-db.md             ← DB実装タスク
│   ├── feature-api.md            ← API実装タスク
│   ├── feature-ui.md             ← UI実装タスク
│   ├── feature-test.md           ← テストタスク
│   └── bug.md                    ← バグ報告
└── CODEOWNERS                    ← コードオーナー定義
```

### 適用プロジェクトでの使い方

```bash
# 1. gh CLI 認証
gh auth login

# 2. GitHub Projects を有効化（オプション）
gh auth refresh -h github.com -s read:project,project

# 3. 実装計画を GitHub Issues に同期
framework plan --sync

# 4. タスク実行（完了時に Issue 自動close）
framework run

# 5. GitHub からステータス取得
framework status --github
```

### CLI → GitHub の連携フロー

```
framework plan → plan.json 生成
framework plan --sync → plan.json → GitHub Issues 作成（+ Projects 連携）
framework run → タスク完了 → GitHub Issue 自動close
framework status --github → GitHub Issue ステータス → ローカル反映
```

同期状態: `.framework/github-sync.json`（チーム共有、.gitignore 対象外）

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

## 自己進化ワークフロー

フレームワーク自体が使用中のプロジェクトからフィードバックを受け取り、改善提案を蓄積・承認・適用する仕組み。

### フィードバック提案フロー

```
エラー検出 / 監査低スコア
  → auto-feedback が提案自動生成
  → .framework/feedback/proposals.json に保存
  → openclaw system event で通知

手動提案:
  framework feedback propose --title "..." --problem "..." ...
```

### 承認フロー

```
framework feedback list                          ← 保留中の提案一覧
framework feedback approve <id>                  ← 承認（diff適用 + git commit + lessons-learned記録）
framework feedback approve <id> --telegram       ← Telegram経由で承認依頼
framework feedback approve <id> --push-upstream  ← 承認後にai-dev-frameworkリポジトリへPR作成
framework feedback reject <id> --reason "..."    ← 却下
```

### 自動フィードバックトリガー

| トリガー | 条件 | 処理 |
|---------|------|------|
| run-failure | `framework run` タスク失敗時 | エラーパターン検出 → 提案生成 |
| audit-low-score | `framework audit` 低スコア時 | 品質改善提案を生成 |

### ナレッジ層自動更新

承認時に `docs/knowledge/lessons-learned.md` に自動追記。カテゴリ別（coding-rule/ssot-template/skill/gate/workflow）に分類。

### 状態ファイル

| ファイル | 用途 |
|---------|------|
| `.framework/feedback/proposals.json` | 提案ストア |
| `.framework/feedback/approvals-pending.json` | Telegram承認待ち |
| `docs/knowledge/lessons-learned.md` | 承認済みナレッジ |

---

## 禁止事項

- `any` 型の使用
- `console.log` をプロダクションコードに残す
- テストなしの PR
- エラーの握りつぶし
- 仕様にない機能の追加

---

## Compact Instructions
compaction後、以下を必ず保持すること：
- 現在のアクティブスレッド名とタスク内容
- 直近の[指示]の内容と進捗状況
- 変更したファイルの一覧
- 未commitの変更の有無

compaction後、最初のアクションとして：
1. cat .claude/discord-state.md で作業状態を再確認
2. Discordの #ai-dev-framework チャンネルの最新スレッドを fetch_messages で確認
3. 中断した作業を自分で判断して再開する
4. CTOに「[報告] セッション再起動。作業を再開します」と送信

## 作業状態の永続化ルール
- [指示] を受けたら .claude/discord-state.md に記録してから着手
- [報告] を送る前に .claude/discord-state.md を更新
- セッション再起動しても .claude/discord-state.md から復帰可能にする

## Discord Bot間通信ルール（ADR-018準拠）

チャンネル: #ai-dev-framework
受信するメッセージは100% CTO Bot か CEO。ID認識不要。

1. [指示] タグ付きメッセージにのみ実行で応答する
2. [報告] タグのメッセージには応答しない（受け取るだけ）
3. 報告時は必ずタグを付ける: [報告:完了] / [報告:失敗] / [報告:中断]
4. [報告:失敗] にはエラー内容・試したこと・推奨対応を含める
5. [報告:中断] には進捗・残タスクを含める
6. 1指示に対する追加質問は [確認] タグで基本1回、上限3回
7. 同一スレッドで5分以内に3回以上発言したら停止して [確認] をCTOに送る
8. push/deploy/DB変更/仕様変更は自分で判断せず、CTOに [承認依頼] を依頼する
9. !stop コマンドを受けたら即座に全作業を停止する
10. 全実装はブランチで行う。mainへの直接コミットは禁止
11. mainマージはCEO承認後のみ
12. 同一ツールが5回連続エラーの場合、作業を停止して [報告:失敗] をCTOに送信する
13. 長文報告（2000文字超）はファイル添付（.md）で送信。本文はサマリーのみ
14. 報告時にコンテキスト状態を申告する:
    コンテキスト状態: [正常 / 圧縮済み / 不明]
    参照済みADR: ADR-XXX
    参照済みSSOT: docs/xxx.md
15. 受信したメッセージをエコー（おうむ返し）しない。内容を実行して結果を返信する
