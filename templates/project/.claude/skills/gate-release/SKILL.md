---
name: gate-release
description: |
  Gate 3: Adversarial Review。リリース前の最終品質判定（裁判構造）。
  「gate-release」「リリースゲート」「adversarial review」で実行。
---

# Gate 3: Adversarial Review

## 概要

リリース前の最終品質判定を「裁判構造」で実施するGate。検察（Prosecutor）が問題を起訴し、弁護（Defense）が反論し、裁判官（Judge）が最終判決を下す。

**Gate 1/2との根本的な違い**: Gate 1/2はparallel型（各Validator独立）だが、Gate 3はadversarial型（3エージェント順次・相互依存、並列化不可）。

## Agents（参照）

**順序厳守**（並列不可）:

1. @agents/validators/prosecutor.md → 起訴状作成
2. @agents/validators/defense.md → 弁護書作成（起訴状を入力として受け取る）
3. @agents/validators/judge.md → 判決書作成（起訴状+弁護書を入力として受け取る）

## 実行フロー（Agent Teams独立セッション）

**重要**: Gate 3はadversarial型。各エージェントは独立セッション（独立コンテキスト）で動く。
DefenseはProsecutorの思考過程を見ることができない。JudgeはProsecutor/Defenseの思考過程を見ることができない。

```
1. コンテキスト収集
   - git diff + SSOT + Gate 1/2レポート + テスト結果

2. Prosecutor（独立セッション — 自分でファイルを読む）
   → 起訴状 (.framework/reports/gate3-indictment.md)

3. Defense（独立セッション — 起訴状のみ見える、Prosecutor思考過程は見えない）
   → 弁護書 (.framework/reports/gate3-defense.md)

4. Judge（独立セッション — 起訴状+弁護書のみ、コードは読まない）
   → 判決書 (.framework/reports/gate3-verdict.md)

5. 統合レポート
   → .framework/reports/trial-verdict-{branch}.md
```

### Agent Teamsによるコンテキスト分離
- Prosecutor: コード・SSOT・Gate 1/2レポートを自分で読む
- Defense: 起訴状 + コード（テスト結果含む）のみ。Prosecutorのプロンプトや推論過程は見えない
- Judge: 起訴状 + 弁護書のみ。コードは読まない。文書だけで判決する

## 判決

| 判決 | 条件 | アクション |
|------|------|-----------|
| **SHIP** | GUILTY = 0 | PR作成・マージ可 |
| **SHIP_WITH_CONDITIONS** | GUILTYがMEDIUM以下のみ | 条件修正後マージ（Gate 3再実行不要） |
| **BLOCK** | GUILTY CRITICAL/HIGH ≥ 1 | Gate 2から再実行 |

## 実行手順

### 事前準備（CLI）

```bash
framework gate release
# → .framework/gate-context/adversarial-review.md が生成される
# → Gate 1/2の結果も表示される
# → 「~5-10分かかる」旨が表示される
```

### 裁判実行（スキル）

```
/gate-release を実行
```

### 結果の扱い

- **SHIP**: PR作成・マージ可
- **SHIP_WITH_CONDITIONS**: 条件を修正してGate 2のみ再実行（Gate 3は不要）
- **BLOCK**: Gate 2から再実行が必要。根本原因の分析を推奨

## Post-Gate知見記録

Gate 3実行後、以下をLEARNINGS.mdに記録する:
- **SHIP_WITH_CONDITIONS**: 全条件を記録（次回事前回避するため）
- **BLOCK**: 全理由を記録
- **Prosecutorの起訴でDefense反論不能だった項目**: 記録（構造的弱点）

記録フォーマット:
```markdown
## [YYYY-MM-DD] [カテゴリ]: [タイトル]
- **発見元**: Gate 3
- **重要度**: CRITICAL / WARNING
- **内容**: [Verdict] — [内容]
- **対策**: [次回どう回避するか]
- **繰り返し回数**: [N]
- **promoted**: false
```

## Auto-remediation

BLOCK時に `--auto-fix` オプションで自動修正→再Gate実行が可能:

```bash
framework gate release --auto-fix               # デフォルト2回リトライ
framework gate release --auto-fix --max-retries 3  # 最大3回
```

フロー: BLOCK → GUILTY/条件を抽出 → `claude -p` で修正 → npm test → 再Gate
- 修正後テスト失敗: 変更revert → エスカレーション
- 最大リトライ超過: エスカレーション（人間介入必要）
- `--auto-fix` なし: 従来通りBLOCKで停止

## ルール

1. **Prosecutor→Defense→Judgeの順序を厳守**（並列化不可）
2. **各ステップの出力を次のステップの入力として明示的に渡す**
3. **Judgeは新規調査を行わない**（起訴状+弁護書のみで判断）
4. **Gate判定結果はCEOへの報告に必ず含めること**
5. **BLOCK時は根本原因を分析してからGate 2に戻る**
