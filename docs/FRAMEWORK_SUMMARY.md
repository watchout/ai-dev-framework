# フレームワーク全体サマリー

> AI開発フレームワーク v3.2 の全体像。新規チャットへの引き継ぎにも使用。

---

## コンセプト

```
「曖昧なアイデア → 品質保証された実装」を AI駆動で自動化する。

入力: 「○○みたいなサービスを作りたい」
出力: 品質監査を通過した実装コード + テスト + ドキュメント

キーワード:
  SSOT（Single Source of Truth）= 仕様書が全ての根拠
  3層構造 = Core / Contract / Detail で変更頻度を管理
  Freeze単位 = 段階的に仕様を確定し、早期に実装開始
  止まらないルール = DETAIL層はデフォルトで進む
  縦スライス = ユーザー価値単位で端から端まで実装
```

---

## CLIコマンド一覧

### 基本コマンド

| コマンド | 説明 | 主要オプション |
|---------|------|--------------|
| `framework init [name]` | プロジェクト初期化 | `--type=app\|lp\|hp\|api\|cli` |
| `framework discover` | ディスカバリー（ヒアリング） | `--resume` |
| `framework generate <step>` | SSOT生成 | `business\|product\|technical`, `--auto` |
| `framework plan` | 実装計画作成 | |
| `framework audit [target]` | 品質監査 | `ssot\|code\|test\|visual\|all`, `--fix` |
| `framework run <task-id>` | タスク実行 | `--auto`, `--dry-run` |
| `framework status` | 進捗表示 | `--json`, `--detail` |
| `framework retrofit` | 既存プロジェクト導入 | `--scan-only` |
| `framework update` | フレームワーク更新 | `--check`, `--force` |

### フロー

```
新規:  init → discover → generate → plan → run → audit → status
既存:  retrofit → plan → run → audit → status
日常:  status → run → audit
保守:  update → audit all
```

---

## 主要な設計概念

### 1. SSOT 3層構造

```
┌─────────────────────────────────────────┐
│  DETAIL（変更される前提）                │
│  エラー文言、バリデーション、UI微調整     │
│  → いつでも変更可。Decision Backlog 許容 │
├─────────────────────────────────────────┤
│  CONTRACT（破壊しない約束）              │
│  API契約、画面I/O、DB主要テーブル        │
│  → 破壊的変更禁止。追加は可              │
├─────────────────────────────────────────┤
│  CORE（変わりにくい）                    │
│  目的、スコープ、権限モデル、主要フロー   │
│  → 原則変更不可                         │
└─────────────────────────────────────────┘

テンプレートの各セクションにタグ:
  §2 機能概要 [CORE]
  §5 API仕様 [CONTRACT]
  §9 エラーハンドリング [DETAIL]
```

### 2. Freeze 単位の進行

```
Freeze 1: Domain（用語・スコープ）
  → 「この機能が何をするか」が確定

Freeze 2: Contract（API・UI・DB）
  → 実装開始可能 ★

Freeze 3: Exception（エラー・権限）
  → テスト・監査可能

Freeze 4: Non-functional（性能・運用）
  → リリース準備完了

★ Freeze 2 で実装開始。3-4 は並行で進められる。
```

### 3. 止まらないルール

```
■ 停止（従来通り）:
  - CORE/CONTRACT層の不明点 → 停止して質問
  - T4（SSOT矛盾）→ 常に停止
  - T6（影響範囲不明）→ 常に停止

■ 進行（新ルール）:
  - DETAIL層の不明点 → デフォルト案で実装
  - Decision Backlog に記録
  - 影響大 → Feature Flag で隠蔽
  - セッション終了時に未決定一覧を報告
```

### 4. 縦スライス

```
従来（横割り）: 「ログイン機能」→ DB全部 → API全部 → UI全部
改善（縦割り）: 「初回利用者がサービスを使い始めるまで」
               = サインアップ + ログイン + メイン画面（各MVP最小セット）

1スライス = DB → API → UI → テスト を縦に貫通
1スライス = 2-5日で完了
1スライス = デモ可能な状態
```

### 5. Example-driven 仕様

```
各MUST要件に必須:
  §3-E: 入出力例（最低5ケース）
  §3-F: 境界値（最大/最小/空/NULL/不正）
  §3-G: 例外応答（エラーコード・文言・リトライ可否）
  §3-H: 受け入れテスト（Gherkin形式）

Gherkin → テストコード自動生成
```

### 6. Decision Backlog

```
未決定事項の一元管理:
  - 重要度: High / Med / Low
  - 期限: いつまでに決めないと詰むか
  - 影響範囲: DB / API / UI / 運用
  - 推奨デフォルト案 + 副作用

DETAIL層のTBD: Decision Backlog記録済みなら許容
CORE/CONTRACT層のTBD: 不合格（要決定）
```

### 7. プロジェクトタイプ

```
app（デフォルト）: 全SSOT・全監査・全Stage
lp:  PRD+UI、マーケ必須、Code+Visual監査
hp:  PRD+UI、最小構成、Code+Visual監査
api: PRD+API+DATA、UIなし、Code+Test監査
cli: PRD+API(コマンド)、UIなし、Code+Test監査
```

### 8. 知識データ

```
docs/knowledge/ にドメイン知識を蓄積:
  market/   競合・トレンド・規制
  domain/   用語・ベストプラクティス・標準機能
  users/    ペルソナ・課題・インタビュー

Discovery前に自動読み込み → ヒアリング品質向上
```

---

## 品質ゲート

| # | ゲート | 合格基準 | タイミング |
|---|--------|---------|----------|
| 1 | SSOT監査 | 95点（Freeze 2時は80点） | SSOT完成時 |
| 2 | プロンプト監査 | 100点 | タスク実行前 |
| 3 | コード監査 | 100点 | 実装後 |
| 4 | テスト監査 | 100点 | テスト生成後 |
| 5 | CI/PR | All Green | PR作成時 |
| 6 | ビジュアル監査 | 100点 | UI実装後 |
| 7 | 機能検証 | 100点 | 結合後 |
| 8 | デプロイ | チェックリスト通過 | リリース前 |

---

## AI行動プロトコル

### 中断トリガー（T1-T7）

| # | トリガー | 行動 | 新ルール |
|---|---------|------|---------|
| T1 | SSOT未記載 | 停止 | 層による（DETAIL→進む） |
| T2 | SSOT曖昧 | 停止 | 層による（DETAIL→進む） |
| T3 | 技術選択肢複数 | 停止 | 後から変更可能なら進む |
| T4 | SSOTと実装矛盾 | 停止 | 常に停止（変更なし） |
| T5 | 規約未定義 | 停止 | 安全側デフォルトで進む |
| T6 | 影響範囲不明 | 停止 | 常に停止（変更なし） |
| T7 | ビジネス判断 | 停止 | Feature Flagで進む |

### 認証状態（暗記）

```
S0: LOGGED_OUT, S1: LOGGED_IN, S2: SESSION_EXPIRED,
S3: FORBIDDEN, S4: ACCOUNT_DISABLED
```

### エラーコード体系（暗記）

```
AUTH_xxx(401,423), PERM_xxx(403), VAL_xxx(400,422),
RES_xxx(404,409), RATE_xxx(429), SYS_xxx(500,503)
```

---

## ツール使い分け

| 場面 | ツール |
|------|-------|
| アイデア壁打ち・戦略相談 | Claude.ai |
| 仕様書の対話的作成 | Claude.ai |
| コーディング・デバッグ・テスト | Claude Code |
| プロジェクト初期構築 | Claude Code |
| 機能実装・リファクタ | Claude Code |
| LP実装 | Claude Code |
| コードレビュー | Claude Code（Adversarial Review） |

---

## ドキュメント一覧

| # | ドキュメント | 内容 |
|---|------------|------|
| 00 | MASTER_GUIDE | 全体マップ・プロジェクトタイプ |
| 01 | DEVELOPMENT_PROCESS | 開発プロセス定義 |
| 02 | LIFECYCLE | ライフサイクル管理 |
| 03 | PHASE_DEFINITIONS | フェーズ定義 |
| 04 | PROGRESS_TRACKING | 進捗管理 |
| 05 | PROJECT_DOCUMENTS | プロジェクトドキュメント定義 |
| 06 | REVIEW_PROCESS | レビュープロセス |
| 07 | MARKETING_FRAMEWORK | マーケティング戦略 |
| 08 | DISCOVERY_FLOW | ディスカバリーフロー |
| 09 | TOOLCHAIN | 開発ツールチェーン・CLI |
| 10 | GENERATION_CHAIN | 生成チェーン・Freeze単位 |
| 11 | FEATURE_SPEC_FLOW | 機能仕様ヒアリング |
| 12 | SSOT_FORMAT | SSOTフォーマット（3層構造） |
| 13 | SSOT_AUDIT | SSOT監査基準 |
| 14 | IMPLEMENTATION_ORDER | 実装順序・縦スライス |
| 15 | PROMPT_FORMAT | プロンプトフォーマット |
| 16 | PROMPT_AUDIT | プロンプト監査 |
| 17 | CODE_AUDIT | コード監査・Adversarial Review |
| 18 | TEST_FORMAT | テストフォーマット |
| 19 | CI_PR | CI/PR管理 |
| 20 | VISUAL_TEST | ビジュアルテスト |
| 21 | AI_ESCALATION | AI中断プロトコル・Memory Persistence |
| 22 | FEATURE_ACCEPTANCE | 機能検証 |
| 23 | DEPLOY | デプロイ |
| 24 | CHANGE_MANAGEMENT | 変更管理 |
| 25 | VERIFICATION_LOOPS | 検証ループ |

---

## 新規チャットへの引き継ぎ方法

### Claude.ai でディスカバリーを行った場合

```
Claude Code に以下を伝える:

「以下のディスカバリー結果を docs/idea/ に配置して、
 生成チェーン（framework generate）を実行してください。

 プロジェクトタイプ: [app|lp|hp|api|cli]

 [ディスカバリー結果をペースト]」
```

### 別のClaude Codeセッションに引き継ぐ場合

```
引き継ぎに必要なもの:
1. CLAUDE.md（プロジェクト固有の指示書）
2. docs/ 配下のSSOT一式
3. .claude/memory/（Memory Persistence、存在する場合）
4. docs/ssot/DECISION_BACKLOG.md（未決定事項）

引き継ぎ手順:
1. 前セッションで framework status を実行し、進捗を記録
2. 新セッションで Claude Code を起動
3. CLAUDE.md が自動読み込みされる
4. .claude/memory/ から前回の状態が復元される
5. 「前回の続きから始めてください」と指示
```

### チャット間で共有すべき情報

```
最低限:
  - 現在のPhase / Step
  - 完了済みタスク
  - 未解決の問題（Decision Backlog）
  - 重要な意思決定（ADR）

あると良い:
  - framework status の出力
  - 直近のコミットログ
  - 品質監査の結果
```
