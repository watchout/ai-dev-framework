# AI開発フレームワーク ガイド

> このファイルはClaude Codeがフレームワークの概念と開発フローを理解するためのガイドです。

---

## 開発ライフサイクル

```
Discovery → Business → Product → Technical → Implementation → Review
   ↓          ↓          ↓          ↓            ↓             ↓
 ヒアリング  事業設計   機能設計   技術設計      実装        品質検証
```

### Phase概要

| Phase | 目的 | 成果物 |
|-------|------|--------|
| Discovery | アイデア検証、要件収集 | IDEA_CANVAS, USER_PERSONA |
| Business | 事業設計、価値提案 | VALUE_PROPOSITION, COMPETITOR_ANALYSIS |
| Product | 機能設計、UI設計 | PRD, FEATURE_CATALOG, UI_STATE |
| Technical | 技術設計、API/DB設計 | TECH_STACK, API_CONTRACT, DATA_MODEL |
| Implementation | コード実装 | ソースコード、テスト |
| Review | 品質保証 | 監査レポート、承認 |

---

## スキルシステム（専門家エージェント）

`.claude/skills/` に定義された専門家エージェントを活用して開発を進める。

### Phase別専門家チーム

```
Discovery Phase (D1-D4):
  D1: Idea Excavator      - アイデア発掘
  D2: Problem Validator   - 課題検証
  D3: User Researcher     - ユーザー調査
  D4: Opportunity Mapper  - 機会分析

Business Phase (B1-B4):
  B1: Market Analyst      - 市場分析
  B2: Business Designer   - ビジネスモデル設計
  B3: Value Architect     - 価値提案設計
  B4: Pricing Strategist  - 価格戦略

Product Phase (P1-P5):
  P1: PRD Writer          - 要件定義
  P2: UX Designer         - UX設計
  P3: UI Designer         - UI設計
  P4: Feature Spec Writer - 機能仕様作成
  P5: Acceptance Criteria - 受入条件定義

Technical Phase (T1-T5):
  T1: Architect           - アーキテクチャ設計
  T2: API Designer        - API設計
  T3: DB Designer         - データベース設計
  T4: Security Engineer   - セキュリティ設計
  T5: DevOps Engineer     - インフラ・CI/CD設計

Implementation Phase (I1-I5):
  I1: Frontend Dev        - フロントエンド実装
  I2: Backend Dev         - バックエンド実装
  I3: Code Auditor        - コード監査
  I4: Test Engineer       - テスト実装
  I5: Integration Engineer - 統合・結合

Review Council (R1-R3):
  R1: Quality Gatekeeper  - 品質ゲート
  R2: Security Reviewer   - セキュリティレビュー
  R3: UX Reviewer         - UXレビュー
```

### スキル実行コマンド

```
「ディスカバリーを開始して」   → Discovery Phase全体を実行
「ビジネス設計を開始して」     → Business Phase全体を実行
「プロダクト設計を開始して」   → Product Phase全体を実行
「技術設計を開始して」         → Technical Phase全体を実行
「実装を開始して」             → Implementation Phase全体を実行
「レビュー評議会を開催して」   → Review Council全体を実行
```

### 個別エージェント実行

```
「D1を実行」  → Idea Excavatorが担当
「P4を実行」  → Feature Spec Writerが担当
「I3を実行」  → Code Auditorが担当
```

---

## 合議制意思決定プロトコル

重要な意思決定は複数の専門家による合議で行う。

### 合議レベル

| レベル | 対象 | 参加者 | トリガー |
|--------|------|--------|----------|
| 軽量合議 | DETAIL層の決定 | 2-3名 | 軽微な仕様変更 |
| 標準合議 | CONTRACT層の定義 | 3-4名 | API/DB/UI設計 |
| 重量合議 | CORE層の変更 | 全専門家 | アーキテクチャ変更 |

### 合議実行コマンド

```
「合議して：[議題]」     → 自動で適切な専門家を選定
「軽量合議：[議題]」     → 2-3名で素早く決定
「標準合議：[議題]」     → 3-4名で慎重に検討
「重量合議：[議題]」     → 全員参加で徹底議論
```

### 自動合議トリガー

以下の場合、自動的に合議が発動する:

- CORE層の変更提案 → 重量合議
- CONTRACT層の新規定義 → 標準合議
- 複数SSOTへの影響 → 標準合議
- 技術的負債の可能性 → 軽量合議
- セキュリティ関連 → 標準合議

---

## Agent Teamsパターン

複数エージェントが協調して作業を進めるパターン。

### 利用可能なチーム構成

```
分析チーム（3名）:
  - リサーチャー: 情報収集
  - アナリスト: 分析・構造化
  - レポーター: 文書化

開発チーム（3名）:
  - アーキテクト: 設計判断
  - 実装者: コーディング
  - レビュアー: 品質確認

調査チーム（3名）:
  - 調査員: 深掘り調査
  - 検証員: ファクトチェック
  - まとめ役: 統合・報告
```

### チーム実行コマンド

```
「分析チームを編成して：[対象]」
「開発チームを編成して：[機能名]」
「調査チームを編成して：[調査対象]」
```

---

## SSOT 3層構造

仕様書は3層構造で管理される。

```
CORE層（変わりにくい）:
  - 目的、スコープ、ビジネスルール
  - 変更には重量合議が必要

CONTRACT層（破壊しない）:
  - API契約、画面I/O、DB主要テーブル
  - 変更には標準合議が必要

DETAIL層（変更前提）:
  - エラー文言、バリデーション、UI微調整
  - 軽量合議または自律判断で変更可能
```

### 層別の行動ルール

```
CORE/CONTRACT層が未定義:
  → 実装を開始せず、確認を求める

DETAIL層が未定義:
  → デフォルト案で実装
  → Decision Backlogに記録
```

---

## 生成チェーン

ドキュメントは依存関係に従って段階的に生成する。

```
Step 0: Discovery（ヒアリング）
  ↓
Step 1: Business（事業設計）
  IDEA_CANVAS → USER_PERSONA → COMPETITOR → VALUE_PROPOSITION
  ↓
Step 2: Product（プロダクト設計）
  PRD → FEATURE_CATALOG → UI_STATE → 各機能SSOT
  ↓
Step 3: Technical（技術設計）
  TECH_STACK → API → DB → CROSS_CUTTING
  ↓
Step 4: Implementation（実装開始）
```

---

## 知識データベース

`docs/knowledge/` に蓄積された知識を活用する。

### 参照ルール

1. Discovery開始前に関連知識を確認
2. 既知情報は確認形式で質問
3. 提案時は根拠を示す
4. 不足・矛盾を発見したら報告

### 知識カテゴリ

```
docs/knowledge/
├── trends/        ← 技術・市場トレンド
├── competitors/   ← 競合情報
├── users/         ← ユーザー調査
└── domain/        ← ドメイン知識
```

---

## CLIコマンド（参考）

```bash
framework discover      # ディスカバリー実行
framework generate      # SSOT生成
framework plan          # 実装計画作成
framework audit         # 品質監査
framework run           # タスク実行
framework status        # 進捗表示
```

---

## 重要な原則

1. **仕様書駆動**: 仕様書にない機能は実装しない
2. **合議制**: 重要な判断は複数専門家で議論
3. **段階的生成**: ドキュメントは依存順に生成
4. **3層管理**: CORE/CONTRACT/DETAILで変更影響を制御
5. **知識活用**: 蓄積された知識を参照して提案

---

## このガイドの使い方

Claude Codeセッション開始時、このファイルを読み込むことで:

- 開発フローを理解する
- 適切なスキル/エージェントを選択できる
- 合議が必要な場面を判断できる
- SSOTの層を意識した実装ができる
