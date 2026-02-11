# CLAUDE.md - プロジェクト指示書（Claude Code用）

> Claude Code はこのファイルを自動で読み込みます。
> プロジェクトの全仕様書は docs/ にあります。

---

## ⚠️ AI中断プロトコル（最優先ルール）

以下の場合、即座に作業を中断しユーザーに質問すること:

1. SSOTに記載がない仕様判断が必要な時
2. SSOTの記載が曖昧で複数解釈が可能な時
3. 技術的な選択肢が複数あり判断できない時
4. SSOTと既存実装が矛盾している時
5. 制約・規約に未定義のケースに遭遇した時
6. 変更の影響範囲が判断できない時
7. ビジネス判断が必要な時

「推測で進める」「とりあえず仮で」は禁止。
詳細: docs/standards/21_AI_ESCALATION.md

---

## プロセスゲート強制ルール

```
■ 1アクション = 1ドキュメント（絶対ルール）

  ドキュメント生成を依頼された場合:
  - 1つのドキュメントを生成する
  - 生成結果を表示する
  - ユーザーの確認を待つ
  - ユーザーが承認するまで次に進まない

  「まとめて生成」「一括作成」「効率化のため全部」は禁止。

■ ヒアリング = 1問ずつ（絶対ルール）

  仕様のヒアリングが必要な場合:
  - 1回の発言で1つだけ質問する
  - 必ず具体例を添える
  - 回答を受けてから次の質問をする

  「以下の5点について教えてください」は禁止。

■ ゲートチェック

  以下のタイミングで、前ステップの成果物を検証する:
  - docs/idea/ の4ドキュメント完成 → 事業設計ゲート通過
  - docs/requirements/ の2ドキュメント完成 → プロダクト概要ゲート通過
  - P0機能の全SSOT完成（各 Freeze 2） → 機能仕様ゲート通過
  - docs/design/core/ の3ドキュメント完成 → 技術設計ゲート通過

  ゲート未通過で次のフェーズに進むことは禁止。

■ [要確認] マーカー

  既存資料にない情報を補完する場合:
  - 推測で埋めず「[要確認]」マーカーを付ける
  - [要確認] 項目をユーザーに1つずつ質問する
  - 全ての [要確認] が解消されるまでドキュメントは未完了
```

---

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロダクト名 | {{PRODUCT_NAME}} |
| 概要 | {{ELEVATOR_PITCH}} |
| 技術スタック | {{TECH_STACK_SUMMARY}} |
| リポジトリ | {{REPO_URL}} |

---

## 最重要ルール

```
1. 仕様書がない機能は実装しない
2. 実装前に必ず該当の仕様書を読む
3. 仕様と実装の乖離を見つけたら報告する
4. コア定義（docs/design/core/）は原則変更不可
```

---

## 会社ナレッジ参照ルール

> `.framework/project.json` に `knowledgeSource` が設定されている場合、
> `framework sync-knowledge` で会社の知識データベースからダイジェストを生成できる。

```
参照ファイル: docs/knowledge/_company/KNOWLEDGE_DIGEST.md

このファイルが存在する場合、以下のルールを適用する:

1. 設計判断・機能提案の前に KNOWLEDGE_DIGEST.md を読み、記載された原則に従う
2. マーケティング関連の判断はダイジェストの原則を根拠にする
3. ダイジェストの原則と矛盾する実装を検出した場合は警告する
4. ダイジェストに記載のない領域の判断が必要な場合は報告する

ファイルが存在しない場合は、このセクションを無視してよい。

設定: .framework/project.json の knowledgeSource
更新: framework sync-knowledge（または手動で配置）
```

---

## 仕様書の参照方法

### 実装前に必ず確認するドキュメント（優先順）

```
1. 機能仕様書         → docs/design/features/
2. コア定義           → docs/design/core/
   - UI/状態遷移      → docs/design/core/SSOT-2_UI_STATE.md
   - API規約          → docs/design/core/SSOT-3_API_CONTRACT.md
   - データモデル     → docs/design/core/SSOT-4_DATA_MODEL.md
   - 横断的関心事     → docs/design/core/SSOT-5_CROSS_CUTTING.md
3. 開発規約           → docs/standards/
   - コーディング規約 → docs/standards/CODING_STANDARDS.md
   - テスト規約       → docs/standards/TESTING_STANDARDS.md
   - Git運用          → docs/standards/GIT_WORKFLOW.md
4. PRD               → docs/requirements/SSOT-0_PRD.md
```

### 機能を実装する時のフロー

```
1. 対象の機能仕様書を読む
   → docs/design/features/common/  （共通機能）
   → docs/design/features/project/ （固有機能）

2. 関連するコア定義を確認
   → API設計 → SSOT-3
   → DB設計 → SSOT-4
   → 認証/エラー/ログ → SSOT-5

3. 実装
   → コーディング規約に従う
   → テスト規約に従う

4. テスト
   → 仕様書のテストケースに基づく
```

---

## ディレクトリ構造

```
.claude/
└── agents/                   ← Agent Teams（CLI パターン）
    ├── visual-tester.md      ← ビジュアルテスト専門
    ├── code-reviewer.md      ← Adversarial Review Role B
    └── ssot-explorer.md      ← SSOT検索・要約

docs/                         ← 全仕様書（SSOT）
├── idea/                     ← アイデア・検証
├── requirements/             ← 要件定義
├── design/                   ← 設計
│   ├── core/                 ← コア定義（変更不可）
│   ├── features/             ← 機能仕様
│   │   ├── common/           ← 共通機能
│   │   └── project/          ← 固有機能
│   └── adr/                  ← 設計判断記録
├── standards/                ← 開発規約
├── operations/               ← 運用
├── marketing/                ← マーケティング
├── growth/                   ← グロース
└── management/               ← プロジェクト管理

src/                          ← ソースコード
├── app/                      ← ページ / ルーティング
├── components/               ← UIコンポーネント
│   ├── ui/                   ← 汎用UI
│   └── features/             ← 機能別コンポーネント
├── lib/                      ← ユーティリティ / 設定
├── hooks/                    ← カスタムフック
├── types/                    ← 型定義
├── services/                 ← 外部サービス連携
└── __tests__/                ← テスト

```

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | {{FRAMEWORK}} |
| 言語 | {{LANGUAGE}} |
| DB | {{DATABASE}} |
| 認証 | {{AUTH}} |
| ホスティング | {{HOSTING}} |
| CSS | {{CSS}} |
| テスト | {{TESTING}} |
| CI/CD | {{CI_CD}} |

---

## コーディング規約（要約）

> 詳細: docs/standards/CODING_STANDARDS.md

### 命名規則
- コンポーネント: PascalCase（`LoginForm.tsx`）
- 関数/変数: camelCase（`handleSubmit`）
- 定数: UPPER_SNAKE_CASE（`MAX_RETRY_COUNT`）
- ファイル: kebab-case（`login-form.tsx`）※コンポーネント以外
- 型/Interface: PascalCase + 接尾辞（`UserResponse`, `AuthState`）

### 基本原則
- 1ファイル200行以内を目安
- 1関数1責務
- マジックナンバー禁止（定数化する）
- any 禁止（型を明示する）
- コメントは「なぜ」を書く（「何を」はコードで表現）

---

## Git 運用（要約）

> 詳細: docs/standards/GIT_WORKFLOW.md

### ブランチ戦略
```
main ← production
  └── develop ← 開発統合
        └── feature/XXX-description ← 機能開発
        └── fix/XXX-description ← バグ修正
        └── hotfix/XXX-description ← 緊急修正
```

### コミットメッセージ
```
<type>(<scope>): <description>

type: feat | fix | docs | style | refactor | test | chore
scope: 機能ID or モジュール名
```

---

## テスト規約（要約）

> 詳細: docs/standards/TESTING_STANDARDS.md

### テスト種類
- ユニットテスト: 全ビジネスロジック
- 統合テスト: API エンドポイント
- E2Eテスト: クリティカルパス

### カバレッジ目標
- ビジネスロジック: 80%+
- API: 70%+
- 全体: 60%+

---

## Agent Skills（擬似マルチエージェント）

> 各フェーズを専門化した Agent Skills で、LLM が「複数の専門家チーム」として振る舞う。
> 詳細: ai-dev-framework/templates/skills/SKILLS_INDEX.md

### Skills 一覧（実行順）

```
① framework-discovery     — ディスカバリー（対話ヒアリング）
② framework-business      — 事業設計（IDEA_CANVAS 等）
③ framework-product       — PRD・機能カタログ
④ framework-feature-spec  — 機能仕様書（1機能ずつ対話）
⑤ framework-technical     — 技術設計（Stack/API/DB）
⑥ framework-implement     — 実装（TDD 判定付き）
⑦ framework-code-audit    — Adversarial Code Review
⑧ framework-ssot-audit    — SSOT 品質監査
```

### 配置方法

```
Claude.ai  → 設定 > 機能 > スキル > ZIP アップロード
Claude Code → .claude/skills/ に配置（自動検出）
Cursor     → .cursor/rules/ にルールとして配置
```

### 効果

```
- ステップ飛ばし防止: Skill が1ステップしか知らない（構造的に不可能）
- 品質向上: 各 Skill が専門家として振る舞う
- ヒアリング省略防止: Discovery Skill が対話を担当
- 監査の厳格化: Audit Skill が甘い採点を禁止
```

---

## Agent Teams（CLI パターン）

> Claude Code CLI の Agent Teams でエージェントを活用し、コンテキストを節約する。
> 詳細: ai-dev-framework/09_TOOLCHAIN.md §8

### エージェント一覧

```
.claude/agents/
├── visual-tester.md     ← ビジュアルテスト専門（20_VISUAL_TEST.md §4）
├── code-reviewer.md     ← Adversarial Review Role B（17_CODE_AUDIT.md）
└── ssot-explorer.md     ← SSOT検索・要約
```

### 使い方

```bash
# ビジュアルテストを Agent Teams に委譲
"visual-tester エージェントで AUTH-001 のビジュアルテストを実行して"

# コードレビューを Agent Teams に委譲
"code-reviewer エージェントで実装したコードをレビューして"

# SSOT検索を Agent Teams に委譲
"ssot-explorer エージェントで AUTH-001 のAPI仕様を調べて"
```

### ルール

以下のタスクは Agent Teams に委譲してコンテキストを節約すること:

1. **ビジュアルテスト**: 実装完了後、visual-tester エージェントで画面テスト
2. **Adversarial Review**: 実装完了後、code-reviewer エージェントでコード監査
3. **SSOT検索**: 大量のドキュメントから必要な情報を抽出する時
4. **影響分析**: コード変更の影響範囲を調査する時

---

## 禁止事項

```
❌ 仕様書にない機能を勝手に実装しない
❌ コア定義を勝手に変更しない
❌ テストなしでPRを出さない
❌ any 型を使わない
❌ console.log をプロダクションコードに残さない
❌ 環境変数をハードコードしない
❌ エラーを握りつぶさない（必ずハンドリング）
```

---

## よくあるタスクのコマンド例

```bash
# 機能実装
claude "docs/design/features/common/AUTH-001_login.md の仕様に基づいて
       ログイン機能を実装して"

# テスト生成
claude "src/components/features/auth/ のテストを
       docs/standards/TESTING_STANDARDS.md に基づいて生成して"

# リファクタリング
claude "src/ 以下のエラーハンドリングを
       docs/design/core/SSOT-5_CROSS_CUTTING.md に準拠させて"

# 仕様書の更新
claude "docs/design/features/project/FEAT-003.md を
       新しい要件に基づいて更新して"

# デプロイ
claude "docs/operations/DEPLOYMENT.md に基づいて
       staging環境にデプロイして"
```
