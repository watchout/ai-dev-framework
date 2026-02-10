---
name: discovery
description: |
  Discovery Phase専門家チーム。アイデア検証と初期ヒアリングを担当。
  「ディスカバリーを開始」「discovery」で実行。
  個別エージェント: 「D1」「D2」「D3」「D4」で個別実行可能。
---

# Discovery Phase Skill - アイデア発見・検証

## 概要

プロジェクトの初期段階で、アイデアの核心を引き出し、
市場での妥当性を検証するための専門家チーム。

## エージェント構成

```
Discovery Workflow
─────────────────────────────────────────────────────

D1: Idea Excavator（アイデア発掘者）
    ↓ アイデアの核心を抽出
D2: Problem Validator（課題検証者）
    ↓ 課題の実在性を検証
D3: User Profiler（ユーザープロファイラー）
    ↓ ターゲットユーザーを特定
D4: Market Scout（市場偵察者）
    ↓ 市場機会を評価

→ IDEA_CANVAS.md + USER_PERSONA.md 生成
```

## 各エージェントの役割

### D1: Idea Excavator（アイデア発掘者）

**役割**: ユーザーの漠然としたアイデアから核心を引き出す

**質問例**:
- 「どんな問題を解決したいですか？」
- 「理想の状態はどんな姿ですか？」
- 「既存の解決策の何が不満ですか？」

**出力**: アイデアの核心、解決すべき課題の仮説

詳細: `agents/d1-idea-excavator.md`

### D2: Problem Validator（課題検証者）

**役割**: 課題が実在し、解決する価値があるか検証

**質問例**:
- 「この問題で具体的に困った経験は？」
- 「今どうやって対処していますか？」
- 「解決されたらいくら払えますか？」

**出力**: 課題の深刻度、解決意欲の評価

詳細: `agents/d2-problem-validator.md`

### D3: User Profiler（ユーザープロファイラー）

**役割**: ターゲットユーザーの具体像を特定

**質問例**:
- 「最も困っているのは誰ですか？」
- 「その人の1日を教えてください」
- 「その人は普段どこで情報を得ますか？」

**出力**: ペルソナ仮説、ユーザージャーニー仮説

詳細: `agents/d3-user-profiler.md`

### D4: Market Scout（市場偵察者）

**役割**: 市場機会と競合状況を評価

**質問例**:
- 「競合サービスを知っていますか？」
- 「なぜ競合では不十分なのですか？」
- 「どのくらいの市場規模を想定していますか？」

**出力**: 競合分析仮説、差別化ポイント仮説

詳細: `agents/d4-market-scout.md`

## 実行方法

### フルワークフロー

```
「ディスカバリーを開始して」
「discovery」
```

全エージェントが順次実行され、以下が生成される：
- IDEA_CANVAS.md
- USER_PERSONA.md（50%完成度）
- COMPETITOR_ANALYSIS.md（30%完成度）

### 個別エージェント

```
「D1を実行」→ Idea Excavatorのみ実行
「D2を実行」→ Problem Validatorのみ実行
「D3を実行」→ User Profilerのみ実行
「D4を実行」→ Market Scoutのみ実行
```

## 合議ポイント

Discovery Phase完了時に以下の合議を行う：

1. **課題の実在性確認**
   - 参加者: D2 + Business Expert
   - 判定: この課題は解決する価値があるか

2. **ターゲットの妥当性確認**
   - 参加者: D3 + User Advocate
   - 判定: このペルソナは存在し、到達可能か

3. **市場機会の評価**
   - 参加者: D4 + Business Expert
   - 判定: 参入する価値のある市場か

## 成果物

| 成果物 | 完成度 | 次フェーズへの入力 |
|--------|--------|-------------------|
| IDEA_CANVAS.md | 80% | Business Phase全体 |
| USER_PERSONA.md | 50% | Product Phase |
| COMPETITOR_ANALYSIS.md | 30% | Business Phase |

## 次のフェーズ

Discovery完了後は `.claude/skills/business/SKILL.md` へ移行。
