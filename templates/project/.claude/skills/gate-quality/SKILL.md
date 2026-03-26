---
name: gate-quality
description: |
  Gate 2: Quality Sweep。実装完了後のコード品質検証Gate。
  「gate-quality」「品質ゲート」「quality sweep」で実行。
---

# Gate 2: Quality Sweep

## 概要

実装完了後、PRマージ前に4つのValidatorが順次コードを検証し、PASS/BLOCKを判定するGateスキル。

## Agents（参照）

4つのValidatorを順次実行する:

1. @agents/validators/ssot-drift-detector.md → SSOT仕様との乖離検出
2. @agents/validators/security-scanner.md → セキュリティ脆弱性検出
3. @agents/validators/test-coverage-auditor.md → テストカバレッジ監査
4. @agents/validators/perf-profiler.md → パフォーマンス問題検出

## 実行フロー

```
1. コンテキスト収集
   - git diff main...HEAD（変更差分）
   - SSOT文書の読み込み
   - npm test 実行結果

2. Validator順次実行
   ssot-drift-detector → security-scanner → test-coverage-auditor → perf-profiler

3. 統合判定
   - PASS: 全CRITICAL = 0 かつ WARNING合計 ≤ 5
   - BLOCK: CRITICAL ≥ 1 または WARNING > 5

4. レポート出力
   → .framework/reports/quality-sweep-{branch}.md
```

## 追加コンテキスト: notes/

`notes/` ディレクトリにタスク単位のメモがある場合、検証対象のタスクに対応するnotesファイルを読み、実装者の判断理由を考慮すること。ただし、notes内の説明がSSOTと矛盾する場合はSSOTが正（SSOTはSingle Source of Truth）。

## 判定基準

| 条件 | 判定 |
|------|------|
| 全CRITICAL = 0、WARNING ≤ 5 | **PASS** → PR作成可 |
| CRITICAL ≥ 1 | **BLOCK** → 修正優先 |
| WARNING > 5 | **BLOCK** → 改善必要 |

### Phase別WARNING閾値

プロジェクトのPhaseに応じてWARNING閾値を調整する:

| Phase | WARNING上限 | 理由 |
|-------|-----------|------|
| 初期構築（Wave 1-2） | ≤ 10 | 基盤構築中は設計上の暫定実装が多い |
| 中期（Wave 3+） | ≤ 5 | 標準基準 |
| リリース前 | ≤ 3 | 厳格基準 |

CLIで `--phase early` を指定するとWARNING上限が10に緩和される。

## 実行手順

### 自動実行（推奨）

```bash
# 1コマンドで完結: コンテキスト収集 → 4 Validator並列実行 → 統合判定
framework gate quality

# オプション
framework gate quality --phase early          # WARNING閾値を緩和（Wave 1-2）
framework gate quality --sequential           # デバッグ用：順次実行
framework gate quality --timeout 180          # タイムアウト延長
framework gate quality --context-only         # コンテキスト収集のみ（手動実行用）
```

### 手動実行（フォールバック）

CLIの自動実行が失敗した場合:
```bash
# 1. コンテキスト収集のみ
framework gate quality --context-only

# 2. スキルで手動実行
/gate-quality
```

### 結果の扱い

- **PASS**: PR作成に進む
- **BLOCK（1回目）**: 指摘事項を修正 → 再実行
- **BLOCK（2回目連続）**: 根本原因を分析してから再実行。場当たり的修正は禁止
- **BLOCK（3回目）**: CEOにエスカレーション

## レポートフォーマット

```markdown
# Quality Sweep Report

## Date: {date}
## Branch: {branch}
## Verdict: PASS / BLOCK

## Validator Results

### 1. SSOT Drift Detector
- CRITICAL: X件
- WARNING: X件
- INFO: X件
{findings}

### 2. Security Scanner
- CRITICAL: X件
- WARNING: X件
- INFO: X件
{findings}

### 3. Test Coverage Auditor
- CRITICAL: X件
- WARNING: X件
- INFO: X件
{findings}

### 4. Performance Profiler
- CRITICAL: X件
- WARNING: X件
- INFO: X件
{findings}

## Aggregate
- Total CRITICAL: X
- Total WARNING: X
- Total INFO: X
- Verdict: PASS / BLOCK
```

## スコープ制御

デフォルトではgit diff範囲のファイルのみを検証対象とする。
`--full` フラグを付けるとリポジトリ全体を対象にする。

- **デフォルト（diffのみ）**: 変更ファイルに関連するSSOT要件のみチェック
- **--full**: リポジトリ全体のSSOT準拠性、セキュリティ、カバレッジをチェック

各Validatorは「Changed Files」セクションのファイルリストを基準に検証範囲を限定すること。

## Post-Gate知見記録

Gate 2実行後、以下をLEARNINGS.mdに記録する:
- **CRITICAL検出**: 全件記録（カテゴリ・内容・対策を明記）
- **WARNING繰り返しパターン**: 過去のLEARNINGS.mdを確認し、同一パターンが2回目以上なら記録（繰り返し回数をインクリメント）
- **初回WARNINGは記録しない**（ノイズ防止）
- **INFOは記録しない**

記録フォーマット:
```markdown
## [YYYY-MM-DD] [カテゴリ]: [タイトル]
- **発見元**: Gate 2
- **重要度**: CRITICAL / WARNING
- **内容**: [Validator名] [Finding ID] — [内容]
- **対策**: [次回どう回避するか]
- **繰り返し回数**: [N]
- **promoted**: false
```

## Auto-remediation

BLOCK時に `--auto-fix` オプションで自動修正→再Gate実行が可能:

```bash
framework gate quality --auto-fix               # デフォルト2回リトライ
framework gate quality --auto-fix --max-retries 3  # 最大3回
```

フロー: BLOCK → 修正指示抽出 → `claude -p` で修正 → npm test → 再Gate
- 修正後テスト失敗: 変更revert → エスカレーション
- 最大リトライ超過: エスカレーション（人間介入必要）
- `--auto-fix` なし: 従来通りBLOCKで停止

## ルール

1. **BLOCK時はPR作成を進めず修正優先**
2. **2回連続BLOCK時は根本原因分析してからリトライ**
3. **Gate判定結果はCEOへの報告に含めること**
4. **各Validatorの出力を全てレポートに含める（省略しない）**
