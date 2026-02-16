# Skills Index - スキル一覧

> Claude Codeで利用可能なスキル（専門家チーム）の一覧

## スキル構成（4スキル + Agent Teams）

```
.claude/skills/
├── _INDEX.md              ← このファイル
├── discovery/SKILL.md     ← Discovery & Business Phase（D1-D4, B1-B4）
├── design/SKILL.md        ← Product & Technical Design（P1-P5, T1-T5）
├── implement/SKILL.md     ← Implementation Phase（I1-I5）
├── review/SKILL.md        ← Review & Audit（R1-R5 + 合議）
└── agent-teams/           ← Agent Teams運用パターン（実証済み）
```

## スキル一覧

| スキル | 説明 | トリガー |
|--------|------|----------|
| discovery | アイデア検証・事業設計 | 「ディスカバリー」「discovery」「アイデア」「ビジネス設計」 |
| design | プロダクト設計・技術設計 | 「設計」「design」「仕様」「アーキテクチャ」 |
| implement | 実装・テスト・品質保証 | 「実装」「implement」「コーディング」 |
| review | レビュー評議会・監査 | 「レビュー」「review」「監査」「audit」 |

## 開発フロー全体像

```
Discovery & Business → Design → Implementation → Review
       ↓                 ↓           ↓              ↓
    D1-D4, B1-B4      P1-P5      I1-I5          R1-R5
                      T1-T5
       ↓                 ↓           ↓              ↓
  IDEA_CANVAS       PRD, SSOT    コード実装      最終判定
  VALUE_PROP        API, DB      テスト          リリース可否
```

## 専門家一覧

### Discovery (D1-D4) + Business (B1-B4)

| ID | 名前 | 役割 |
|----|------|------|
| D1 | Idea Excavator | アイデアの核心を発掘 |
| D2 | Problem Validator | 課題の実在性を検証 |
| D3 | User Profiler | ターゲットユーザーを特定 |
| D4 | Market Scout | 市場機会を評価 |
| B1 | Value Architect | 価値提案を設計 |
| B2 | Competitor Analyst | 競合を分析 |
| B3 | Revenue Designer | 収益モデルを設計 |
| B4 | Go-to-Market Planner | 市場投入戦略を策定 |

### Design: Product (P1-P5) + Technical (T1-T5)

| ID | 名前 | 役割 |
|----|------|------|
| P1 | PRD Author | PRDを作成 |
| P2 | Feature Cataloger | 機能カタログを作成 |
| P3 | UI State Designer | UI状態を設計 |
| P4 | Feature Spec Writer | 機能仕様を作成 |
| P5 | UX Validator | UXを検証 |
| T1 | Tech Stack Selector | 技術スタックを選定 |
| T2 | API Architect | APIを設計 |
| T3 | Data Modeler | データモデルを設計 |
| T4 | Cross-Cutting Designer | 横断設計 |
| T5 | Security Reviewer | セキュリティをレビュー |

### Implementation (I1-I5)

| ID | 名前 | 役割 |
|----|------|------|
| I1 | Code Implementer | コードを実装 |
| I2 | Test Writer | テストを作成 |
| I3 | Code Auditor | コードを監査 |
| I4 | Integration Validator | 統合を検証 |
| I5 | Documentation Writer | ドキュメントを作成 |

### Review Council (R1-R5)

| ID | 名前 | 役割 |
|----|------|------|
| R1 | SSOT Compliance Auditor | SSOT準拠を監査 |
| R2 | Quality Gate Keeper | 品質を検証 |
| R3 | Security Guardian | セキュリティを監査 |
| R4 | User Experience Advocate | UXを検証 |
| R5 | Performance Analyst | パフォーマンスを検証 |

## スキルの起動方法

スキルは Skill ツール経由で起動する。以下の2つの方法がある:

### 1. 明示的起動（キーワードで即発動）

ユーザーがフェーズキーワードを発言 → LLM が即座に Skill ツールで起動:

```
「ディスカバリーを開始して」→ Skill ツールで /discovery を起動
「設計を開始して」          → Skill ツールで /design を起動
「実装を開始して」          → Skill ツールで /implement を起動
「レビュー評議会を開催して」→ Skill ツールで /review を起動
```

### 2. 提案起動（タスク指示から提案）

タスク指示に対して LLM が適切なスキルを提案 → ユーザー承認後に Skill ツールで起動:

```
「DEV-XXXを実装して」→ 「/implement スキルを起動しますか？」→ 承認 → 起動
「新機能を作って」    → 「/design → /implement の順で進めますか？」→ 承認 → 起動
```

### フルワークフロー例

```
/discovery 起動 → 完了 → /design を提案 → 承認 → /design 起動 → 完了 → /implement を提案 → ...
```

### 個別エージェント実行

```
「D1を実行」→ Idea Excavator
「P4を実行」→ Feature Spec Writer
「I3を実行」→ Code Auditor
「R1を実行」→ SSOT Compliance Auditor
```

## 合議の実行

review/SKILL.md に合議プロトコルが統合されている:

```
「合議して：[議題]」     → 自動で適切な専門家を選定
「軽量合議：[議題]」     → DETAIL層の決定（2-3名）
「標準合議：[議題]」     → CONTRACT層の決定（3-4名）
「重量合議：[議題]」     → CORE層の決定（全専門家）
```

## 関連ドキュメント

- specs/01_DISCOVERY.md: ディスカバリーフロー詳細
- specs/02_GENERATION_CHAIN.md: 生成チェーン詳細
- specs/04_FEATURE_SPEC.md: 機能仕様フロー詳細
- specs/06_CODE_QUALITY.md: コード品質基準
- specs/07_AI_PROTOCOL.md: エスカレーション基準
