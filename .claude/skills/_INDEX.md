# Skills & Agents Index

> Claude Codeで利用可能なスキル（オーケストレーション）とエージェント（独立定義）の一覧

## ディレクトリ構造

```
.claude/
├── skills/                        ← オーケストレーション（実行フロー）
│   ├── _INDEX.md                  ← このファイル
│   ├── discovery/SKILL.md         ← Discovery & Business Phase
│   ├── design/SKILL.md            ← Product & Technical Design
│   ├── implement/SKILL.md         ← Implementation Phase
│   ├── review/SKILL.md            ← Review & Audit
│   ├── scan-updates/SKILL.md      ← AI開発エコシステム最新情報
│   └── agent-teams/               ← Agent Teams運用パターン
├── agents/                        ← エージェント定義（独立ファイル）
│   ├── producers/
│   │   ├── discovery/             ← D1-D4, B1-B4
│   │   ├── design/                ← P1-P5, T1-T4
│   │   └── implementation/        ← I1, I2, I5
│   ├── validators/                ← I3, I4, R1-R5, T5, Gate validators
│   └── meta/                      ← ssot-explorer, code-reviewer, visual-tester
└── gates/                         ← Gate定義
    ├── design-validation.md       ← Gate 1: 設計検証
    ├── quality-sweep.md           ← Gate 2: 品質スイープ
    └── adversarial-review.md      ← Gate 3: 敵対的レビュー
```

## スキル一覧

| スキル | 説明 | トリガー |
|--------|------|----------|
| discovery | アイデア検証・事業設計 | 「ディスカバリー」「discovery」「アイデア」「ビジネス設計」 |
| design | プロダクト設計・技術設計 | 「設計」「design」「仕様」「アーキテクチャ」 |
| implement | 実装・テスト・品質保証 | 「実装」「implement」「コーディング」 |
| review | レビュー評議会・監査 | 「レビュー」「review」「監査」「audit」 |
| scan-updates | AI開発ツール最新情報収集 | 「最新情報」「scan-updates」「アップデート確認」 |

## エージェント一覧

### Producers（成果物を生成）

| ID | 名前 | フェーズ | ファイル |
|----|------|----------|----------|
| D1 | Idea Excavator | discovery | producers/discovery/d1-excavator.md |
| D2 | Problem Validator | discovery | producers/discovery/d2-validator.md |
| D3 | User Profiler | discovery | producers/discovery/d3-profiler.md |
| D4 | Market Scout | discovery | producers/discovery/d4-scout.md |
| B1 | Value Architect | business | producers/discovery/b1-value-architect.md |
| B2 | Competitor Analyst | business | producers/discovery/b2-competitor-analyst.md |
| B3 | Revenue Designer | business | producers/discovery/b3-revenue-designer.md |
| B4 | Go-to-Market Planner | business | producers/discovery/b4-gtm-planner.md |
| P1 | PRD Author | design | producers/design/p1-prd-author.md |
| P2 | Feature Cataloger | design | producers/design/p2-feature-cataloger.md |
| P3 | UI State Designer | design | producers/design/p3-ui-state-designer.md |
| P4 | Feature Spec Writer | design | producers/design/p4-feature-spec-writer.md |
| P5 | UX Validator | design | producers/design/p5-ux-validator.md |
| T1 | Tech Stack Selector | design | producers/design/t1-tech-stack-selector.md |
| T2 | API Architect | design | producers/design/t2-api-architect.md |
| T3 | Data Modeler | design | producers/design/t3-data-modeler.md |
| T4 | Cross-Cutting Designer | design | producers/design/t4-cross-cutting-designer.md |
| I1 | Code Implementer | implementation | producers/implementation/i1-code-implementer.md |
| I2 | Test Writer | implementation | producers/implementation/i2-test-writer.md |
| I5 | Documentation Writer | implementation | producers/implementation/i5-documentation-writer.md |

### Validators（品質を検証）

| ID | 名前 | フェーズ | ファイル |
|----|------|----------|----------|
| T5 | Security Reviewer | design | validators/security-reviewer.md |
| I3 | Code Auditor | implementation | validators/code-auditor.md |
| I4 | Integration Validator | implementation | validators/integration-validator.md |
| R1 | SSOT Compliance Auditor | review | validators/r1-ssot-auditor.md |
| R2 | Quality Gate Keeper | review | validators/r2-quality-gatekeeper.md |
| R3 | Security Guardian | review | validators/r3-security-guardian.md |
| R4 | User Experience Advocate | review | validators/r4-ux-advocate.md |
| R5 | Performance Analyst | review | validators/r5-performance-analyst.md |
| — | Feasibility Checker | gate | validators/feasibility-checker.md |
| — | Coherence Auditor | gate | validators/coherence-auditor.md |
| — | Gap Detector | gate | validators/gap-detector.md |
| — | SSOT Drift Detector | gate | validators/ssot-drift-detector.md |
| — | Security Scanner | gate | validators/security-scanner.md |
| — | Test Coverage Auditor | gate | validators/test-coverage-auditor.md |
| — | Perf Profiler | gate | validators/perf-profiler.md |
| — | Prosecutor | gate | validators/prosecutor.md |
| — | Defense | gate | validators/defense.md |
| — | Judge | gate | validators/judge.md |

### Meta（プロセス監視）

| 名前 | ファイル |
|------|----------|
| SSOT Explorer | meta/ssot-explorer.md |
| Code Reviewer | meta/code-reviewer.md |
| Visual Tester | meta/visual-tester.md |

## Gates

| Gate | 種別 | トリガー | CLI |
|------|------|----------|-----|
| Design Validation | parallel | 設計完了後 | framework gate design |
| Quality Sweep | parallel | 実装完了後 | framework gate quality |
| Adversarial Review | adversarial | リリース判定 | framework gate release |

## 開発フロー全体像

```
Discovery & Business → Design → [Gate 1] → Implementation → [Gate 2] → Review → [Gate 3] → Release
       ↓                 ↓                       ↓                          ↓
    D1-D4, B1-B4      P1-P5                  I1-I5                      R1-R5
                       T1-T5
       ↓                 ↓                       ↓                          ↓
  IDEA_CANVAS        PRD, SSOT              コード実装                  最終判定
  VALUE_PROP         API, DB                テスト(L1/L2/L3)           リリース可否
```

## スキルの起動方法

スキルは Skill ツール経由で起動:

```
「ディスカバリーを開始して」→ /discovery
「設計を開始して」          → /design
「実装を開始して」          → /implement
「レビュー評議会を開催して」→ /review
「最新情報を確認して」      → /scan-updates
```

## 関連ドキュメント

- specs/01_DISCOVERY.md: ディスカバリーフロー詳細
- specs/02_GENERATION_CHAIN.md: 生成チェーン詳細
- specs/04_FEATURE_SPEC.md: 機能仕様フロー詳細
- specs/06_CODE_QUALITY.md: コード品質基準（Gate D含む）
- specs/07_AI_PROTOCOL.md: エスカレーション基準
