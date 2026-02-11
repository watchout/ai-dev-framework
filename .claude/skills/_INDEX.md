# Skills Index - スキル一覧

> Claude Codeで利用可能なスキル（専門家チーム）の一覧

## 概要

本フレームワークでは、開発フェーズごとに専門家チームを定義し、
合議制による意思決定と品質保証を実現しています。

## スキル一覧

```
.claude/skills/
├── _INDEX.md              ← このファイル
├── agent-teams/           ← Agent Teams運用パターン（実証済み）
│   ├── SKILL.md
│   ├── agents/
│   │   ├── analysis-team.md      ← 分析チーム
│   │   └── investigation-team.md ← 調査チーム
│   └── references/
│       └── INTERFACE_CONTRACT_TEMPLATE.md
├── deliberation/          ← 合議制意思決定
│   ├── SKILL.md
│   └── agents/
│       └── facilitator.md
├── discovery/             ← Discovery Phase
│   ├── SKILL.md
│   └── agents/
│       └── d1-idea-excavator.md
├── business/              ← Business Phase
│   ├── SKILL.md
│   └── agents/
├── product/               ← Product Phase
│   ├── SKILL.md
│   └── agents/
│       └── p4-feature-spec-writer.md
├── technical/             ← Technical Phase
│   ├── SKILL.md
│   └── agents/
├── implementation/        ← Implementation Phase
│   ├── SKILL.md
│   └── agents/
│       └── i3-code-auditor.md
└── review-council/        ← レビュー評議会
    ├── SKILL.md
    └── agents/
        └── r1-ssot-auditor.md
```

## フェーズ別スキル

| フェーズ | スキル | 説明 | コマンド |
|---------|--------|------|----------|
| Agent Teams | agent-teams | 複数エージェント協調パターン | `チーム編成して` |
| 合議 | deliberation | 多専門家合議制意思決定 | `合議して` |
| Discovery | discovery | アイデア発見・検証 | `ディスカバリー` |
| Business | business | 事業設計 | `ビジネス設計` |
| Product | product | プロダクト設計 | `プロダクト設計` |
| Technical | technical | 技術設計 | `技術設計` |
| Implementation | implementation | 実装 | `実装` |
| Review | review-council | 最終レビュー | `レビュー評議会` |

## Agent Teams パターン（実証済み）

国内外の事例に基づく実証済みパターン:

| パターン | エージェント数 | 適用場面 | 事例 |
|---------|---------------|----------|------|
| 分析チーム | 3体 | サイト診断、品質評価 | クラスメソッド清水氏 |
| 開発チーム | 3-5体 | 機能開発、アプリ構築 | Cole Medin, 和田氏 |
| 調査チーム | 5体 | バグ調査、原因究明 | Joe Njenga氏 |
| 企画チーム | 3体 | 企画書作成、戦略立案 | 森本洋平氏 |
| 大規模チーム | 16体 | 大規模開発 | Nicholas Carlini氏 |

**重要**: インターフェース契約を事前定義することで不整合を防止
→ `agent-teams/references/INTERFACE_CONTRACT_TEMPLATE.md`

## 専門家一覧

### Discovery Phase (D1-D4)

| ID | 名前 | 役割 |
|----|------|------|
| D1 | Idea Excavator | アイデアの核心を発掘 |
| D2 | Problem Validator | 課題の実在性を検証 |
| D3 | User Profiler | ターゲットユーザーを特定 |
| D4 | Market Scout | 市場機会を評価 |

### Business Phase (B1-B4)

| ID | 名前 | 役割 |
|----|------|------|
| B1 | Value Architect | 価値提案を設計 |
| B2 | Competitor Analyst | 競合を分析 |
| B3 | Revenue Designer | 収益モデルを設計 |
| B4 | Go-to-Market Planner | 市場投入戦略を策定 |

### Product Phase (P1-P5)

| ID | 名前 | 役割 |
|----|------|------|
| P1 | PRD Author | PRDを作成 |
| P2 | Feature Cataloger | 機能カタログを作成 |
| P3 | UI State Designer | UI状態を設計 |
| P4 | Feature Spec Writer | 機能仕様を作成 |
| P5 | UX Validator | UXを検証 |

### Technical Phase (T1-T5)

| ID | 名前 | 役割 |
|----|------|------|
| T1 | Tech Stack Selector | 技術スタックを選定 |
| T2 | API Architect | APIを設計 |
| T3 | Data Modeler | データモデルを設計 |
| T4 | Cross-Cutting Designer | 横断設計 |
| T5 | Security Reviewer | セキュリティをレビュー |

### Implementation Phase (I1-I5)

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

## 使い方

### フルワークフロー実行

```
「ディスカバリーを開始して」
「ビジネス設計を開始して」
「プロダクト設計を開始して」
「技術設計を開始して」
「実装を開始して」
「レビュー評議会を開催して」
```

### 個別エージェント実行

```
「D1を実行」  → Idea Excavator
「P4を実行」  → Feature Spec Writer
「I3を実行」  → Code Auditor
```

### 合議の実行

```
「合議して：[議題]」
「軽量合議：[議題]」
「標準合議：[議題]」
「重量合議：[議題]」
```

## 開発フロー全体像

```
Discovery → Business → Product → Technical → Implementation → Review
   ↓          ↓          ↓          ↓           ↓            ↓
  D1-D4     B1-B4      P1-P5      T1-T5       I1-I5        R1-R5
   ↓          ↓          ↓          ↓           ↓            ↓
   └──────────┴──────────┴──────────┴───────────┴────────────┘
                              ↓
                      合議制意思決定
                     (deliberation)
```

## 合議トリガー

以下の状況で自動的に合議が開始される：

1. CORE層の変更提案 → 重量合議
2. CONTRACT層の新規定義 → 標準合議
3. 複数SSOTへの影響 → 標準合議
4. 技術的負債の可能性 → 軽量合議
5. セキュリティ関連 → 標準合議

## 関連ドキュメント

- CLAUDE.md: 全体指示書
- 08_DISCOVERY_FLOW.md: ディスカバリーフロー詳細
- 10_GENERATION_CHAIN.md: 生成チェーン詳細
- 11_FEATURE_SPEC_FLOW.md: 機能仕様フロー詳細
- 12_SSOT_FORMAT.md: SSOT形式詳細
- 17_CODE_AUDIT.md: コード監査基準
- 21_AI_ESCALATION.md: エスカレーション基準
