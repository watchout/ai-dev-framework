# CLAUDE.md - AI開発フレームワーク v3.3

> このファイルはClaude Codeへの指示書です。必ず最初に読んでください。

---

## 🚀 最重要: 初回起動時の判定

```
ユーザーの状態を判定し、適切なフローを開始する:

【判定フロー】

Q0: プロジェクトタイプは何か？
  → .framework/profile.json が存在する → タイプ確定済み
  → 存在しない → ユーザーの発言からタイプを自動判定:
      「LP」「ランディングページ」「β募集」 → lp
      「ホームページ」「コーポレートサイト」 → hp
      「API」「バックエンド」「マイクロサービス」 → api
      「CLI」「コマンドライン」「ツール」 → cli
      上記以外 → app（デフォルト）
  → 判定結果をユーザーに確認してから続行

Q1: プロジェクトの初期資料（IDEA_CANVAS.md等）は存在するか？
  │
  ├─ NO → ディスカバリーフローを開始
  │        08_DISCOVERY_FLOW.md に従い、対話形式でヒアリング
  │        → プロファイルで有効なStageのみ実施
  │        → 回答から初期資料一式を自動生成
  │
  ├─ 一部あり → 不足資料を確認
  │             「○○は作成済みですが、△△がまだです。
  │              △△について質問してもいいですか？」
  │
  └─ YES → 通常の開発フローへ
            01_DEVELOPMENT_PROCESS.md に従う

プロファイルで定義されたSSOTのみ参照・生成する。
詳細: 00_MASTER_GUIDE.md「プロジェクトタイプ別プロファイル」
```

### ディスカバリーフロー起動条件

以下のいずれかに該当する場合、**必ず** 08_DISCOVERY_FLOW.md のヒアリングを開始する:

1. ユーザーが「○○を作りたい」「○○みたいなサービス」と言った
2. IDEA_CANVAS.md が存在しない
3. SSOT-0_PRD.md が存在しない
4. ユーザーが「何から始めればいい？」と聞いた

### 知識データの参照ルール

```
Discovery開始前に docs/knowledge/ を確認する:

1. 存在する場合:
   - 関連する知識データを読み込んでからヒアリング開始
   - 既知の情報は確認形式で質問（「○○と理解していますが合っていますか？」）
   - 提案時は根拠を示す（「知識データ（competitors.md）によると…」）

2. 存在しない場合:
   - 通常のオープン質問でヒアリング

3. 不足を発見した場合:
   - 「この情報は知識データにありません。追加を推奨します」と報告

4. 矛盾を発見した場合:
   - 「ユーザーの回答と知識データに矛盾があります」と報告

詳細: 08_DISCOVERY_FLOW.md Stage 0, docs/knowledge/_INDEX.md
```

### ディスカバリーフローの実行ルール

1. **一度に1つだけ質問する**（複数質問を同時にしない）
2. **必ず具体例を添える**（回答のハードルを下げる）
3. **各Stage完了時に整理・確認する**（認識ズレを防ぐ）
4. **「まとまっていなくてOK」と伝える**（完璧を求めない）
5. **全Stage完了後、回答→テンプレートマッピングに従い資料を自動生成する**

### プロセスゲート強制ルール（LLM スキップ防止）

```
■ 1アクション = 1ドキュメント

  ドキュメント生成は1つずつ行い、ユーザー承認を挟む。
  「まとめて生成」「一括作成」は品質低下の最大原因。
  禁止。

■ ヒアリング = 1問ずつ

  仕様ヒアリングは1回の発言で1つだけ質問する。
  「以下の5点について教えてください」は禁止。

■ ゲート条件

  各 Step の完了条件を満たさない限り、次の Step に進まない。
  ゲート条件の詳細: 10_GENERATION_CHAIN.md「ゲート条件」

■ [要確認] マーカー

  不明な情報は推測で埋めず「[要確認]」を付けてユーザーに質問する。
```

### 生成する初期資料

| 資料 | 完成度 | 条件 |
|------|-------|------|
| IDEA_CANVAS.md | 80% | 常に生成 |
| USER_PERSONA.md | 50% | 常に生成 |
| COMPETITOR_ANALYSIS.md | 30% | 常に生成 |
| VALUE_PROPOSITION.md | 50% | 常に生成 |
| SSOT-0_PRD.md | 30% | 常に生成 |
| PROJECT_PLAN.md | 20% | 常に生成 |
| LP_SPEC.md | 30% | マーケ意向ありの場合 |
| SNS_STRATEGY.md | 20% | マーケ意向ありの場合 |

### ディスカバリー完了後は生成チェーンに進む

```
ディスカバリー完了後、10_GENERATION_CHAIN.md に従い
段階的にドキュメントを生成する:

Step 0: Discovery（完了済み）
  ↓
Step 1: Business（事業設計）
  IDEA_CANVAS → USER_PERSONA → COMPETITOR → VALUE_PROPOSITION
  ※ 各ドキュメントを前のドキュメントをインプットにして生成
  ※ 各ドキュメント生成後にユーザー確認
  ↓
Step 2: Product（プロダクト設計）
  PRD → FEATURE_CATALOG → UI_STATE → 各機能のSSO
  ※ 各機能ごとに 11_FEATURE_SPEC_FLOW.md で詳細ヒアリング
  ※ 共通質問 → 種別質問 → UI確認 → 仕様確定 → SSOT生成
  ↓
Step 3: Technical（技術設計）
  TECH_STACK → API → DB → CROSS_CUTTING → 規約 → プロジェクト初期化
  ↓
Step 4: 開発開始 🚀
```

---

## プロダクトライフサイクル（全体フロー）

```
Phase -1       Phase 0       Phase 0.5      Phase 1-5      Phase 6
─────────     ─────────     ──────────     ──────────     ─────────
アイデア  →   要件定義  →   市場検証   →    開発     →   グロース
検証                        LP/β募集

                               │
                               ▼
                    並行: SNS運用・コンテンツ発信
                         開発中からリード獲得
```

| Phase | 入口 | 出口条件 |
|-------|------|---------|
| -1 | ディスカバリーフロー完了 | IDEA_CANVAS 完成、課題検証済み |
| 0 | 課題が実在すると判断 | PRD完成、MVP機能確定 |
| 0.5 | PRD完成 | LP公開、β申し込み開始 |
| 1-5 | LP公開済み | 各フェーズゲート通過 |
| 6 | 本番リリース | KPI達成 |

### 参照すべきマーケティングドキュメント

- 07_MARKETING_FRAMEWORK.md: マーケティング戦略の原則
  - ジェイ・エイブラハム: 3軸成長、リスクリバーサル、紹介
  - DRM: PASONA、2ステップ、メールシーケンス
  - ニューロマーケティング: 感情トリガー、脳科学コピー
  - ローンチ戦略: PLF、Build in Public

---

## ディスカバリー完了 → プロジェクト生成

```
ディスカバリーフロー完了後:

1. プロジェクト初期構築
   → templates/project/setup-project.sh を実行
   → docs/ にプレースホルダーが配置される

2. 仕様書を配置
   → ディスカバリーの結果を docs/idea/ に反映
   → templates/ からテンプレートを docs/ にコピー
   → {{}} をプロジェクト固有の値で置換

3. CLAUDE.md を設定
   → templates/project/CLAUDE.md をプロジェクトルートに配置
   → {{}} をプロジェクト固有の値で置換

4. 開発開始
   → Claude Code CLI: 対話型の実装（デバッグ、設計判断を含む作業）
   → Claude Code Web: 仕様確定済みタスクの非同期実行（並列・自律実行）
   → Claude.ai: 壁打ち、戦略相談
```

### ツール使い分け

| 場面 | ツール |
|------|-------|
| アイデア壁打ち・ディスカバリー | Claude.ai |
| 仕様書ファイル一括生成 | Claude Code CLI |
| プロジェクト初期構築 | Claude Code CLI |
| 対話型のコーディング・デバッグ | Claude Code CLI |
| 機能実装（仕様確定済み） | Claude Code Web |
| 複数タスクの並列実行 | Claude Code Web |
| リファクタリング・テスト一括生成 | Claude Code Web |
| LP実装 | Claude Code Web |
| コードレビュー | Claude Code Web |
| 設計の相談 | Claude.ai |

※ 用語定義: 09_TOOLCHAIN.md §0 参照
※ 使い分け詳細: 09_TOOLCHAIN.md §3, §5 参照

### Agent Teams（CLI パターン）

```
Claude Code CLI では .claude/agents/ にエージェント定義を配置し、
専門タスクを Agent Teams に委譲できる。

.claude/agents/
├── visual-tester.md    ← ビジュアルテスト（20_VISUAL_TEST.md §4）
├── code-reviewer.md    ← Adversarial Review Role B（17_CODE_AUDIT.md）
└── ssot-explorer.md    ← SSOT検索・要約

framework init 実行時に自動配置される。
詳細: 09_TOOLCHAIN.md §8 参照
```

### CLIコマンド（framework コマンド）

```
framework init          プロジェクト初期化
framework discover      ヒアリング実行
framework generate      SSOT生成（生成チェーン実行）
framework plan          実装計画作成（タスク分解）
framework audit         品質監査（SSOT/コード/テスト）
framework run           タスク実行（1タスク or 連続自動実行）
framework status        進捗表示
framework retrofit      既存プロジェクト導入
framework update        フレームワーク更新
```

詳細: 09_TOOLCHAIN.md §9 参照

---

## フレームワーク3層構造

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 3: 固有機能 (project-features/)                               │
│  → テンプレートから新規作成。プロジェクト特有の機能。                    │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 2: 共通機能 (common-features/)                                │
│  → 完成済み仕様書をコピーしてカスタマイズ。95%再利用可能。               │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 1: コア定義 (core/)                                           │
│  → 全機能が従うルール。原則変更不可。                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 重要: 実装前の確認手順

### 1. 機能の種別を確認

```
共通機能の場合:
  → docs/common-features/ から該当ファイルを探す
  → docs/customization/CUSTOMIZATION_LOG.md でカスタマイズを確認

固有機能の場合:
  → docs/project-features/{ID}_xxx.md を確認
```

### 2. 参照するドキュメント（優先順）

```
1. 機能仕様書（common-features/ または project-features/）← 最重要
2. docs/customization/CUSTOMIZATION_LOG.md ← カスタマイズ確認
3. docs/core/SSOT-5_CROSS_CUTTING.md ← 認証・エラー・ログの共通ルール
4. docs/core/SSOT-3_API_CONTRACT.md ← API共通ルール
5. docs/core/SSOT-4_DATA_MODEL.md ← DB共通ルール
6. docs/core/SSOT-2_UI_STATE.md ← 画面・状態遷移
```

### 3. SSOT 3層と止まらないルール

```
SSOTは3層構造で管理する（12_SSOT_FORMAT.md）:
  CORE層（変わりにくい）: 目的、スコープ、ビジネスルール
  CONTRACT層（破壊しない）: API契約、画面I/O、DB主要テーブル
  DETAIL層（変更前提）: エラー文言、バリデーション、UI微調整

仕様がない場合の行動:
  CORE/CONTRACT層が未定義 → 実装を開始せず、確認を求める
  DETAIL層が未定義 → デフォルト案で実装し、Decision Backlog に記録

止まらないルール（21_AI_ESCALATION.md）:
  T4（矛盾）, T6（影響不明）→ 常に停止
  CORE/CONTRACT層の不明点 → 停止して質問
  DETAIL層の不明点 → デフォルトで進む + Decision Backlog
```

### 4. Freeze 単位の進行

```
Freeze 1: Domain（用語・スコープ）→ 仕様の輪郭確定
Freeze 2: Contract（API・UI・DB）→ 実装開始可能
Freeze 3: Exception（エラー・権限）→ テスト・監査可能
Freeze 4: Non-functional（性能・運用）→ リリース準備完了

Freeze 2 完了で実装を開始してよい。
Freeze 3-4 は実装と並行して進められる。
```

### 5. TDD条件とテスト順序

```
■ TDD強制（テストを先に書く）:
  - プロジェクトタイプが api または cli
  - SSOT層が CORE または CONTRACT

  フロー: SSOT → テスト作成 → 実装 → コード監査

■ TDD任意（後付けテストOK）:
  - プロジェクトタイプが app, lp, hp
  - SSOT層が DETAIL
  - UI/フロントエンド全般

  フロー: SSOT → 実装 → コード監査 → テスト

■ プロンプト監査（15, 16）:
  参考資料として残すが、必須フローから除外。
  必要に応じて参照。
```

### 6. CI/CD構成

```
新規プロジェクト作成時:
  framework init my-project --type=app
  → .github/workflows/ci.yml が自動配置される

タイプ別CI構成:
  app  → PostgreSQL + Redis + 全テスト + Security
  api  → PostgreSQL + Redis + DB統合テスト + OpenAPI検証
  lp   → Lint + Build + Lighthouse
  hp   → Lint + Build + Lighthouse + Accessibility
  cli  → マルチOS/Node + Smoke test

デプロイワークフロー追加:
  framework init my-project --type=app --deploy=vercel
  → .github/workflows/deploy.yml が追加される

  選択肢: vercel | dokku | vps | docker

テンプレート参照: templates/ci/
詳細: 19_CI_PR_STANDARDS.md
```

---

## ディレクトリ構造

```
docs/
├── core/                          ← Layer 1: コア定義（変更不可）
│   ├── SSOT-2_UI_STATE.md         ← 画面・状態遷移
│   ├── SSOT-3_API_CONTRACT.md     ← API共通ルール
│   ├── SSOT-4_DATA_MODEL.md       ← DB共通ルール
│   └── SSOT-5_CROSS_CUTTING.md    ← 認証・エラー・ログ
│
├── common-features/               ← Layer 2: 共通機能（完成済み）
│   ├── _INDEX.md                  ← 共通機能一覧
│   ├── auth/
│   │   ├── AUTH-001_login.md
│   │   ├── AUTH-005_logout.md
│   │   └── ...
│   ├── account/
│   │   ├── ACCT-001_signup.md
│   │   └── ...
│   └── error/
│       └── ...
│
├── project-features/              ← Layer 3: 固有機能
│   ├── _TEMPLATE.md               ← テンプレート
│   └── {PROJECT_SPECIFIC}         ← プロジェクト固有
│
├── customization/                 ← カスタマイズ記録
│   └── CUSTOMIZATION_LOG.md       ← 共通機能への変更履歴
│
├── ssot/                          ← プロジェクトSSOT
│   ├── SSOT-0_PRD.md              ← プロダクト要件
│   └── SSOT-1_FEATURE_CATALOG.md  ← 機能カタログ
│
├── checklists/                    ← チェックリスト
├── adr/                           ← 設計判断記録
└── traceability/                  ← 追跡マトリクス
```

---

## 実装依頼フォーマット

### 共通機能の場合

```markdown
## 実装依頼

機能ID: AUTH-001
機能名: ログイン機能
種別: 共通機能

参照ドキュメント:
1. docs/common-features/auth/AUTH-001_login.md
2. docs/customization/CUSTOMIZATION_LOG.md
3. docs/core/SSOT-5_CROSS_CUTTING.md
```

### 固有機能の場合

```markdown
## 実装依頼

機能ID: BOOK-001
機能名: 予約作成機能
種別: 固有機能

参照ドキュメント:
1. docs/project-features/BOOK-001_create_booking.md
2. docs/core/SSOT-5_CROSS_CUTTING.md
```

---

## Layer別の実装ルール

### Layer 1（コア定義）を参照

- 認証状態（S0-S4）は変更不可
- エラーコード体系（AUTH_xxx, VAL_xxx等）は変更不可
- APIレスポンス形式は変更不可

### Layer 2（共通機能）を実装

- 「🔧 カスタマイズポイント」セクションを必ず確認
- CUSTOMIZATION_LOG.md の変更を反映
- カスタマイズ箇所以外は仕様書通りに実装

### Layer 3（固有機能）を実装

- 12セクション全てが埋まっていることを確認
- Layer 1のルールに従う

---

## 認証状態（暗記必須）

```
S0: LOGGED_OUT      - 未ログイン
S1: LOGGED_IN       - ログイン済み
S2: SESSION_EXPIRED - セッション切れ
S3: FORBIDDEN       - 権限不足
S4: ACCOUNT_DISABLED - アカウント停止
```

---

## エラーコード体系（暗記必須）

```
AUTH_xxx - 認証エラー（401, 423）
PERM_xxx - 権限エラー（403）
VAL_xxx  - バリデーションエラー（400, 422）
RES_xxx  - リソースエラー（404, 409）
RATE_xxx - レート制限（429）
SYS_xxx  - システムエラー（500, 503）
```

---

## 禁止事項

❌ CORE/CONTRACT層の仕様なしで実装を開始する
❌ カスタマイズログを確認せずに共通機能を実装する
❌ Layer 1（コア定義）を勝手に変更する
❌ 仕様にない機能を追加する
❌ エラーハンドリングを省略する
❌ テストを省略する

---

## 質問がある場合

```
「{機能ID}の実装について確認があります。
{セクション}に{内容}の記載がありません。
仕様の追加/明確化が必要です。」
```

**曖昧なまま実装を進めない**
