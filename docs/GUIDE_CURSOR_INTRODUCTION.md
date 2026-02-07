# Cursor ベース導入ガイド

> 既存資料（README、ペルソナ等）がある状態から、Cursor でフレームワークを導入する手順。

---

## 対象

```
こんな状態のプロジェクト:
  ✅ README.md がある
  ✅ ペルソナ、ユーザーストーリー等の資料がある
  ✅ アイデアは固まっている
  ❌ コードはまだない（または少量）
  ❌ SSOT形式の仕様書はない
```

---

## 導入フロー

```
Phase 1: フレームワーク構造を構築（プロンプト①）
  → docs/ ディレクトリ、CLAUDE.md、Agent Teams を配置
  → 既存資料を読み取り、フレームワーク構造にマッピング

Phase 2: 既存資料 → SSOT 変換（プロンプト②）
  → 既存の README、ペルソナ等からSSOT仕様書を生成
  → 不足情報のみヒアリング

Phase 3: 技術設計 → 開発開始（プロンプト③）
  → 技術スタック確定、API/DB/横断設計
  → 実装計画作成 → 開発開始
```

---

## Phase 1: フレームワーク構造を構築

Cursor Agent に以下を貼ってください:

```
このプロジェクトに AI 開発フレームワークを導入します。

■ フレームワーク参照元
https://github.com/watchout/ai-dev-framework

■ 現状
このリポジトリには既に README.md やペルソナストーリーなどの資料があります。
まずそれらを全て読み込んでから作業を始めてください。

■ やること

1. 既存資料の棚卸し
   - リポジトリ内の全 .md ファイルを読み込む
   - 各資料の内容を以下に分類:
     ・アイデア/概要 → docs/idea/ に対応
     ・ユーザー/ペルソナ → docs/idea/USER_PERSONA.md に対応
     ・競合/市場 → docs/idea/COMPETITOR_ANALYSIS.md に対応
     ・機能/要件 → docs/requirements/ に対応
     ・技術/設計 → docs/design/ に対応
     ・その他
   - 分類結果を表示して確認を取る

2. フレームワークのディレクトリ構造を作成
   （既存ファイルは移動せず、新しい構造を追加する）
   - docs/idea/
   - docs/requirements/
   - docs/design/core/
   - docs/design/features/common/
   - docs/design/features/project/
   - docs/design/adr/
   - docs/standards/
   - docs/operations/
   - docs/marketing/
   - docs/growth/
   - docs/management/
   - .claude/agents/

3. CLAUDE.md を作成
   - ai-dev-framework/templates/project/CLAUDE.md をベースに作成
   - 既存資料から読み取れる情報で {{}} を埋める
   - 不明な項目は TBD のままで OK

4. Agent Teams テンプレートを配置
   - ai-dev-framework/templates/project/agents/ から以下をコピー:
     ・visual-tester.md
     ・code-reviewer.md
     ・ssot-explorer.md
   - {{PROJECT_NAME}} をプロジェクト名で置換

5. docs/INDEX.md を作成
   - 既存資料の配置先マッピングを含める

6. .gitignore がなければ作成

7. 完了報告
   - 作成したファイル一覧
   - 既存資料 → フレームワーク構造のマッピング表
   - 次の Phase で必要な作業の概要
```

---

## Phase 2: 既存資料 → SSOT 変換

Phase 1 完了後に貼ってください:

```
既存の資料をベースに SSOT 仕様書を生成します。

■ 参照
- フレームワーク: https://github.com/watchout/ai-dev-framework
- SSOT 形式: 12_SSOT_FORMAT.md
- 生成チェーン: 10_GENERATION_CHAIN.md
- ディスカバリーフロー: 08_DISCOVERY_FLOW.md

■ ルール
- 既存資料に書いてある情報はそのまま活用する（再質問しない）
- 既存資料にない情報だけヒアリングする
- ヒアリングは一度に1つだけ質問する
- SSOT 3層構造（CORE/CONTRACT/DETAIL）に従う

■ やること

Step 1: 事業設計ドキュメント
  既存資料から以下を生成（既に資料がある場合はSSOT形式に変換）:
  - docs/idea/IDEA_CANVAS.md
  - docs/idea/USER_PERSONA.md
  - docs/idea/COMPETITOR_ANALYSIS.md
  - docs/idea/VALUE_PROPOSITION.md
  各ドキュメント完了後に確認を取ってから次へ。

Step 2: プロダクト設計ドキュメント
  - docs/requirements/SSOT-0_PRD.md（プロダクト要件定義）
  - docs/requirements/SSOT-1_FEATURE_CATALOG.md（機能カタログ）
  - docs/design/core/SSOT-2_UI_STATE.md（画面・状態遷移）
  各機能の SSOT:
  - 共通機能（認証、ログイン等）→ ai-dev-framework/common-features/ から取得
  - 固有機能 → 11_FEATURE_SPEC_FLOW.md に従いヒアリング
  各ドキュメント完了後に確認を取ってから次へ。

Step 1 から開始してください。
既存の [ここに既存資料のファイル名を列挙] を最初に読み込んでから始めてください。
```

---

## Phase 3: 技術設計 → 開発開始

Phase 2 完了後に貼ってください:

```
技術設計を行い、開発を開始します。

■ 参照
- フレームワーク: https://github.com/watchout/ai-dev-framework
- 実装順序: 14_IMPLEMENTATION_ORDER.md
- テスト規約: 18_TEST_FORMAT.md
- CI/PR基準: 19_CI_PR_STANDARDS.md

■ やること

Step 1: 技術設計
  以下を順番に生成（各完了後に確認を取る）:
  - docs/standards/TECH_STACK.md（技術スタック選定）
  - docs/design/core/SSOT-3_API_CONTRACT.md（API共通ルール）
  - docs/design/core/SSOT-4_DATA_MODEL.md（データモデル）
  - docs/design/core/SSOT-5_CROSS_CUTTING.md（認証・エラー・ログ）
  - docs/standards/CODING_STANDARDS.md
  - docs/standards/GIT_WORKFLOW.md
  - docs/standards/TESTING_STANDARDS.md

Step 2: プロジェクト初期化
  - package.json / tsconfig.json 等のプロジェクト設定
  - src/ ディレクトリのスキャフォールド
  - .github/workflows/ci.yml（CI/CD）
  - CLAUDE.md の {{}} をすべて確定値で更新

Step 3: 実装計画
  - 14_IMPLEMENTATION_ORDER.md に基づいてタスク分解
  - 縦スライス × Wave で実装順序を決定
  - docs/management/IMPLEMENTATION_PLAN.md を作成
  - GitHub Projects で Issue を作成（gh CLI）

Step 4: 開発開始
  - 最初のタスク（Wave 1 の最初の機能）を実装
  - Adversarial Review（code-reviewer エージェント）でレビュー
  - PR 作成

Step 1 から開始してください。
```

---

## Cursor での Tips

### CLAUDE.md が自動で効く

Cursor は `CLAUDE.md` を自動で読み込むため、Phase 1 で作成した
CLAUDE.md のルールが以降の全操作に適用されます。

### Agent Teams の使い方（Cursor）

Cursor では `.claude/agents/` の Agent Teams は直接使えませんが、
同等のことを Task tool で実現できます:

```
# コードレビュー
"新しいエージェントを起動して、17_CODE_AUDIT.md に基づいて
 src/features/auth/ のコードをレビューして。
 あなたは厳格なコードレビュアー（Role B）です。"

# SSOT 検索
"新しいエージェントを起動して、docs/ から AUTH-001 に関連する
 全ての仕様を検索・要約して。"
```

### セッションが長くなったら

```
"ここまでの作業内容を要約して、
 次のセッションで使える引き継ぎプロンプトを作成して。"
```

---

## チェックリスト

### Phase 1 完了時

- [ ] docs/ ディレクトリ構造が作成されている
- [ ] CLAUDE.md が配置されている
- [ ] .claude/agents/ に 3 エージェントが配置されている
- [ ] 既存資料 → フレームワーク構造のマッピングが確認済み
- [ ] docs/INDEX.md が作成されている

### Phase 2 完了時

- [ ] docs/idea/ に 4 ドキュメントが生成されている
- [ ] docs/requirements/ に PRD と FEATURE_CATALOG がある
- [ ] docs/design/core/SSOT-2_UI_STATE.md がある
- [ ] 全機能の SSOT が docs/design/features/ にある
- [ ] Freeze 2（Contract）まで確定している

### Phase 3 完了時

- [ ] docs/standards/ に技術規約がある
- [ ] docs/design/core/ に SSOT-3, 4, 5 がある
- [ ] プロジェクトのスキャフォールドが完成
- [ ] CI/CD が設定されている
- [ ] CLAUDE.md の {{}} がすべて確定値で埋まっている
- [ ] 実装計画が作成されている
- [ ] 最初の機能の実装が開始されている
