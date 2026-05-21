---
name: design
description: |
  Product & Technical Design Phase。プロダクト設計と技術設計を担当。
  「設計」「design」「仕様」「プロダクト設計」「技術設計」「アーキテクチャ」で実行。
---

# Design Skill (Product + Technical)

## 概要

ビジネス要件をプロダクト仕様に変換し（P1-P5）、
それを実装可能な技術設計に落とし込む（T1-T5）専門家チーム。

## Phase Authority

`/design` は **Producer phase** であり、設計成果物を作成・更新する責務を持つ。
自己チェックは行ってよいが、Gate PASS、監査承認、実装開始可否を確定してはいけない。

許可されること:
- docs/spec, docs/impl, docs/verify, docs/ops, SSOT を作成・更新する
- 明らかな欠落や矛盾を自己チェックとして列挙する
- `shirube gate check` / `shirube trace verify` を実行し、結果を事実として報告する
- `/gate-design` や `/review` に渡すべき検証観点を整理する

禁止されること:
- `approved`, `audit passed`, `ready to implement` などの承認表現を確定する
- Gate 判定者として PASS / BLOCK / CONDITIONAL PASS を出す
- ユーザー承認なしに `/gate-design`, `/implement`, `/review` へ進む

完了時は成果物、自己チェック結果、未解決事項を報告し、次に `/gate-design` を実行するかユーザー確認して停止する。

## ワークフロー

```
Product Design                     Technical Design
──────────────                     ────────────────
P1: PRD Author                     T1: Tech Stack Selector
    ↓ プロダクト要件を定義              ↓ 技術スタック選定
P2: Feature Cataloger              T2: API Architect
    ↓ 機能を分類・優先度付け            ↓ API契約を設計
P3: UI State Designer              T3: Data Modeler
    ↓ 画面と状態遷移を設計              ↓ データモデルを設計
P4: Feature Spec Writer            T4: Cross-Cutting Designer
    ↓ 各機能の詳細仕様を作成            ↓ 認証・エラー・ログを設計
P5: UX Validator                   T5: Security Reviewer
    ↓ ユーザー体験を検証               ↓ セキュリティを検証

→ PRD + Feature Catalog            → API_CONTRACT + DATA_MODEL
  + UI_STATE + 各機能SSOT             + CROSS_CUTTING + SECURITY
```

## 実行ルール

- ドキュメント生成は**1つずつ**、ユーザー承認を挟む
- 仕様ヒアリングは**1回の発言で1つだけ質問**する
- 不明な情報は推測で埋めず「[要確認]」マーカーを付ける
- Freeze 2（Contract）完了で実装開始可能

## LLM Control Design

自動化、エージェント挙動、Hook、memory、queue、Issue/PR生成、runtime orchestration を含む設計では、成果物作成前に制御機構を分類する。

基本方針:
- default は script / daemon / queue runner / CI / GitHub Actions / DB trigger / 明示CLI による deterministic control
- Hook は不可避ケースだけに限定する: `PreToolUse` block、`SessionStart` / `UserPromptSubmit` context injection、`SessionStart` state recovery、`PostToolUse` immediate verification、`Stop` completion-time verification
- queue進行、状態遷移、retry、finalize、外部投稿は Runner / deterministic service が持つ
- LLM runtime adapter は runtime-specific invocation と structured result の返却だけを担当する
- 起動時注入は restart pack に限定し、全文memory dumpをしない
- memory / context retrieval は bounded、provenance付き、context扱いにし、secret / PII / local path をredactする

設計時の思考フロー:
1. Source of Truth: どのartifact/stateが正かを決める
2. Control split: deterministic control と LLM judgment を分ける
3. Hook justification: Hookが必要なら不可避ケースのどれかを明記する
4. Runtime boundary: Runner、LLM adapter、memory/context、delivery adapter の責務を分ける
5. Startup context: SessionStartで入れるrestart packと、on-demand検索に残す情報を分ける
6. Mechanical gates: 実装前、完了前、CIで何を機械的にblockするか決める
7. Authority: Gate、CTO/L3、CEO判断が必要な変更を明記する

出力ルール:
- SPEC には `§10 制御機構選定原則` を必ず埋める
- OPS には `§9 制御機構の使い分け原則` を必ず埋める
- Hookを採用する場合、不可避ケース該当根拠とscript代替不可の理由を明記する
- LLMに状態遷移を任せる設計、TUI prompt注入を主経路にする設計、adapterにqueue repair/finalizeを持たせる設計は未解決リスクとして扱う

## Product エージェント詳細

### P1: PRD Author（PRD作成者）

**役割**: プロダクト要件定義書を作成

**含む内容**:
- プロダクトビジョン
- ターゲットユーザー（ペルソナ参照）
- コア機能（MUST/SHOULD/COULD）
- 成功指標（KPI）
- 制約条件

**チェックリスト**:
- [ ] ビジョンが1文で表現できているか
- [ ] MUST機能が5個以内に絞れているか
- [ ] KPIが計測可能か
- [ ] ペルソナとの整合性があるか

**出力**: SSOT-0_PRD.md

### P2: Feature Cataloger（機能カタログ作成者）

**役割**: 機能を体系的に分類し優先度付け

**分類軸**:
- 共通機能（認証、アカウント、エラー処理）→ Layer 2
- 固有機能（プロジェクト特有）→ Layer 3
- MVP / Post-MVP

**出力**: SSOT-1_FEATURE_CATALOG.md

### P3: UI State Designer（UI状態設計者）

**役割**: 画面一覧と状態遷移を設計

**設計内容**:
- 画面一覧
- 認証状態（S0-S4）ごとの表示
- 画面遷移図
- 主要コンポーネント

**出力**: SSOT-2_UI_STATE.md

### P4: Feature Spec Writer（機能仕様作成者）

**役割**: 各機能の詳細SSOTを作成（specs/04_FEATURE_SPEC.md に従う）

**フロー**:
1. 共通質問（5項目）: 主要アクター、前提条件、主要フロー、代替フロー、データ項目
2. 種別質問（機能種別ごと）
3. UI確認
4. 仕様確定
5. SSOT生成（§3-E/F/G/H 含む）

**質問バンク（共通）**:
- 「この機能の主なユーザー（アクター）は誰ですか？」
- 「この機能を使う前に何が完了している必要がありますか？」
- 「メインの操作フロー（ステップ）を教えてください」
- 「エラーや例外が起きたらどう対応しますか？」
- 「扱うデータ項目とその制約は？」

**出力**: docs/design/features/{ID}_{name}.md

### P5: UX Validator（UX検証者）

**役割**: ユーザー体験の観点から仕様を検証

**検証観点**:
- ユーザーフローの自然さ
- エラー時の体験
- アクセシビリティ
- モバイル対応
- 3クリック以内で主要操作が完了するか

**出力**: UX改善提案、仕様へのフィードバック

## Technical エージェント詳細

### T1: Tech Stack Selector（技術選定者）

**役割**: プロジェクトに最適な技術スタックを選定

**選定基準**:
- プロジェクトタイプ（app/api/lp/hp/cli）
- チーム経験・学習コスト
- 長期保守性
- エコシステムの成熟度

**出力**: TECH_STACK（PRDまたは独立ドキュメント）

### T2: API Architect（API設計者）

**役割**: API契約を設計（RESTful / GraphQL）

**設計内容**:
- エンドポイント一覧
- リクエスト/レスポンス形式
- 認証・認可
- エラーレスポンス
- OpenAPI仕様

**チェックリスト**:
- [ ] 全MUST機能のエンドポイントが定義されているか
- [ ] エラーレスポンスが統一形式か
- [ ] 認証が適切に設計されているか
- [ ] ページネーションが定義されているか

**出力**: SSOT-3_API_CONTRACT.md

### T3: Data Modeler（データモデラー）

**役割**: データベース設計とマイグレーション計画

**設計内容**:
- ER図（Mermaid形式）
- テーブル定義（カラム、型、制約）
- インデックス戦略
- マイグレーション順序

**出力**: SSOT-4_DATA_MODEL.md

### T4: Cross-Cutting Designer（横断設計者）

**役割**: 横断的関心事を設計

**設計内容**:
- 認証フロー（S0-S4状態管理）
- エラーコード体系（AUTH_xxx, VAL_xxx, RES_xxx, RATE_xxx, SYS_xxx）
- ログ設計（構造化ログ）
- 監視・アラート

**出力**: SSOT-5_CROSS_CUTTING.md

### T5: Security Reviewer（セキュリティレビュアー）

**役割**: セキュリティ観点から設計を自己チェックする。独立Gate / Review の代替ではない。

**レビュー観点**:
- OWASP Top 10
- 認証・認可の堅牢性
- データ保護（暗号化、マスキング）
- 入力検証
- 依存関係の脆弱性

**出力**: SECURITY_REVIEW、設計へのフィードバック。PASS / BLOCK 判定は `/gate-design` または `/review` に委ねる。

## Freeze 単位

```
Freeze 1: Domain  → P1, P2 完了後（用語・スコープ確定）
Freeze 2: Contract → P3, P4, T2, T3 完了後（実装開始可能）
Freeze 3: Exception → T4 完了後（テスト・監査可能）
Freeze 4: Non-functional → T5 完了後（リリース準備完了）
```

## 成果物一覧

| 成果物 | 完成度 | 担当 |
|--------|--------|------|
| SSOT-0_PRD.md | 90% | P1 |
| SSOT-1_FEATURE_CATALOG.md | 90% | P2 |
| SSOT-2_UI_STATE.md | 80% | P3 |
| 各機能SSOT | 100% | P4 |
| SSOT-3_API_CONTRACT.md | 90% | T2 |
| SSOT-4_DATA_MODEL.md | 90% | T3 |
| SSOT-5_CROSS_CUTTING.md | 90% | T4 |

## Multi-perspective Check

出力を確定する前に、以下の視点を検討:
- **Product**: ユーザーニーズを満たす設計か？使いやすいか？
- **Technical**: 実装可能で保守しやすいか？技術的負債を生まないか？
- **Business**: ビジネスモデルを支えるか？スケーラブルか？

視点間の緊張があれば、それを明記して解決策を示す。

このチェックは Producer self-check であり、独立Gateの承認ではない。

## Self-check Report Template

```markdown
## /design Self-check

### 作成・更新した成果物
- [ ] docs/spec/...
- [ ] docs/impl/...
- [ ] docs/verify/...
- [ ] docs/ops/...

### 自己チェック結果
- Missing / unclear:
- Trace / gate command results:
- LLM control:
  - Source of Truth:
  - Deterministic control:
  - Hook usage and justification:
  - Runtime adapter boundary:
  - Startup/restart context:
  - Mechanical gates:
  - Authority / approval needed:
- Risks to hand off:

### 次の推奨アクション
/gate-design を実行して独立Gate判定を受けるか確認してください。

Authority: producer only
Can self-check: yes
Can approve gate: no
Must stop before: /gate-design or /implement
```

## TDD条件

Technical Phaseの成果物はCORE/CONTRACT層に該当するため、
プロジェクトタイプが api/cli の場合は **TDD強制** の対象。

```
SSOT → テスト作成 → 実装 → コード監査
```

## 次のフェーズ

Design 完了後:
1. 設計成果物をユーザーに提示して確認
2. 「実装フェーズ（/implement）に進みますか？」と提案
3. 承認されたら Skill ツールで /implement を起動
