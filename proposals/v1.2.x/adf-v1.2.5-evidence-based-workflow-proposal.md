# ADF v1.2.5 spec proposal — Evidence-Based Workflow Discipline

> 作成日: 2026-05-10
> 起票者: ARC (CEO directive `5d04c953` + `fb0f2cea` per、CEO「設計の中に LLM agent に対して必ず実 file 読み + 実 DB / 実 log + Web 検索を script 制御で全工程に強制する基本原則を組込済か？」への structural fix)
> 引き渡し先: ADF (本 spec 範囲は ARC が直接 GitHub 化)

---

## 0. 背景 (なぜ v1.2.5 が必要か)

### 0.1 本日累積した ARC 反省 patterns [文献確認 ARC 本日 honest 記述]

ARC は本日のみで 7+ 件の「impl/schema 実態を verify せず spec 起草」反省を Discord で送信:
- v0.4 patch: agents table 実態を CTO が verify、ARC 未確認
- v0.5/v0.6 patch: 同根、auditor が複数 cycle で BLOCK
- v0.7 patch: production schema (`attempts` 列不在) を verify せず spec 起草
- v0.8 cycle 1: PR #333 impl 実態を未 verify、warn log 記述で auditor BLOCK
- v0.8 cycle 2: 部分 edit drift で再 BLOCK
- PR #125 (ADF v1.2.x 4 layer): proposal 信頼で起票、v1.2.0 完了状態 verify 漏れ
- PR #131 (v1.2.3/1.2.4 spec): impl/dogfood 状態を未 verify

= **memory `feedback_check_ssot_before_drafting` 反省累積、構造的 fix 不在**

### 0.2 既存 ADF の証拠機構 (組込済 + gap)

[文献確認: ARC msg `5a1b9efb`]:

| 機構 | spec | 種別 | 強制 |
|---|---|---|---|
| Honest Mode 根拠ラベル | CLAUDE.md | advisory | LLM 自主規律 (弱) |
| label check hook (Stop) | SPEC-DOC4L-009 F2 | Hook | LLM output 段で block |
| citation 検証 | SPEC-DOC4L-009 F3 | Hook | mechanical grep |
| 4-Evidence (process/DB/log/tmux) | SPEC-DOC4L-011 | script + CI | CTO routine merge gate |
| Traceability Matrix | SPEC-DOC4L-015 | script + CLI | drift 検出 |
| spec-read-before-question hook | 既 install | Hook | 質問前 spec 読了強制 |

**Gap (未組込)**:
1. spec 起草時の事前 verify (impl 実態 grep) を script 強制する mechanism 不在
2. PR 起票前の証拠提出 (実 file + 実 DB query + Web 検索) を CI gate 強制 不在
3. `[検証済]` ラベル付き断定の自動 verify (file 引用 grep + line range 一致) 不在

= **「全工程で証拠必須」を統一原則として script 強制する spec が不在**

### 0.3 CEO 提起の核心

[文献確認 CEO `5d04c953`]:
> 「LLM agent に対して、必ず実 file (spec/impl/実装 file) を読み、実 DB / log + Web 検索を元に常に証拠がある形で全工程を行う script 制御を基本として組込済か？」

= **structural failure の構造的 fix 要請**。本日反省 patterns の根因解消。

---

## SPEC-DOC4L-016: Evidence-Based Workflow Discipline

### 1. 目的

全工程 (spec 起草 / instruction 作成 / impl / review / verify) で **実 file 引用 + 実 DB query 出力 + 実 log 抜粋 + Web 検索 URL** を script 強制する。「impl 実態未確認の起草」「想定だけの review」を構造的に block。

### 2. 機能要件

#### 2.1 F1: Evidence Section in Spec / PR

全 SPEC 起票時 (`docs/spec/*.md`) と PR description に **§Evidence** section を必須化:

```markdown
## §Evidence (本 spec / PR の主張根拠)

### 実 file 引用
- `path/to/file.ts:42-50` (本 spec の R-X 根拠) [content quoted]

### 実 DB query 出力
- `psql -c "SELECT ... FROM ... WHERE ..."` 実行結果:
  ```
  (output)
  ```

### 実 log 抜粋
- `tail -N /path/to/log` 実行結果:
  ```
  (output)
  ```

### Web 検索 / 公式 doc URL
- https://... (claim X の根拠)
```

各断定 (`[検証済]` / `[文献確認]` ラベル付き) は本 §Evidence の sub-entry に **必ず紐付ける**。

#### 2.2 F2: CI gate (script 強制)

`.github/workflows/evidence-check.yml` で PR description の §Evidence section 存在 + format を check:
- §Evidence 不在 → exit 2 (block)
- 4 sub-section (file / DB / log / Web) 全空 → warn (small PR は許容)
- `[検証済]` 断定が 1+ あって §Evidence 空 → exit 2 (block、honesty 違反)

#### 2.3 F3: Pre-commit hook (Boris case 1)

`.claude/hooks/pre-commit-evidence-check.sh`:
- commit message + diff から `[検証済]` 断定を抽出
- 各断定が SPEC §Evidence (or commit message) に file 引用 / DB query / log / URL を持つか mechanical check
- 不一致 → exit 2 (block)

= Hook 不可避 case 1 (tool 呼出 BLOCK) 該当。

#### 2.4 F4: `framework evidence verify` CLI

```
framework evidence verify <pr-number>
  exit 0: 全 §Evidence claim が file 実在 / line range 一致 / DB query 再実行可能 / URL 200 OK
  exit 2: 1+ claim で証跡 broken (stderr に detail)
```

re-execution check で「過去 commit 時には valid だった証跡が後で壊れていないか」も verify (Traceability matrix と連携)。

#### 2.5 F5: PR template 強化

`.github/PULL_REQUEST_TEMPLATE.md` に §Evidence 必須 section を default 含める:

```markdown
## §Evidence (本 PR の主張根拠)

### 実 file 引用
<!-- file:line + quoted content -->

### 実 DB query 出力
<!-- psql -c '...' で再実行可能な query + output -->

### 実 log 抜粋
<!-- tail/grep で再実行可能 + output -->

### Web 検索 / 公式 doc URL
<!-- URL + 該当 claim -->

### [検証済] ラベル付き断定の根拠
<!-- 各 [検証済] 断定がどの evidence に紐付くか -->
```

#### 2.6 F6: 違反時 rollback

- §Evidence 不在 PR → CI gate で block、PR author が追記
- `[検証済]` 断定 + §Evidence 空 → CI gate で block、honesty 違反
- false evidence (file 引用が grep 不一致 / URL 404) → PR review で reject、ARC patch 要請

### 3. 非機能要件

- evidence verify CLI 実行時間 < 10 秒 (中規模 PR)
- §Evidence section 文字数 上限 5000 char/section (PR review 容易性)
- PII / secret を §Evidence に含めないこと (filter 必須)

### 4. 完了条件

- haishin-puls-hub で 1 週間 dogfood
- 期間中 §Evidence 不在 PR 0 件 (= 100% 強制成功)
- `[検証済]` 断定の false positive 検出 ≥ 3 件 (機能している証拠)
- ARC 反省 pattern (impl 未 verify spec 起草) を本 spec で構造的に防止確認

### 5. 期待効果

| failure mode | 対応 FR | 期待効果 |
|---|---|---|
| spec 起草時 impl 未 verify (本日 ARC 7+ 件累積) | F1 / F2 / F4 | 95%+ 防止 |
| `[検証済]` overclaim | F3 / F4 | 90%+ 防止 |
| Web 知識 cutoff だけで断定 | F1 (Web URL 必須) | 80%+ 防止 |
| review 時の前提 verify 漏れ | F4 (CLI で再実行 verify) | 構造的解消 |

---

## ADF への引き渡し条件

- 既存 ADF v1.2.0/1/2/3/4 SPEC との整合性確認 (本 spec は新軸、衝突なし想定)
- ID 体系 SPEC-DOC4L-016 既存 ID 群と衝突なし (010-015 まで予約済、016 が次)
- 制御機構選定原則: 全 FR が script + Hook (case 1)、原則整合
- dogfooding 順序: v1.2.5 は v1.2.0/1/2/3/4 と独立、並行 dogfood 可

---

## 補足: 他 spec との関係

- **v1.2.2 SPEC-DOC4L-009 F2/F3 (label check / citation 検証)**: bot output 段の Hook 制御、本 v1.2.5 は spec / PR description 段の script 制御 = 補完関係
- **v1.2.3 SPEC-DOC4L-011 (4-Evidence)**: CTO routine 用、本 v1.2.5 は全 dev workflow 用 = scope 拡張
- **v1.2.4 SPEC-DOC4L-015 (Traceability)**: 要件↔test↔code link、本 v1.2.5 は claim↔evidence link = 別軸

---

## 改訂履歴

- 2026-05-10: ARC 起票 (CEO directive `5d04c953` + `fb0f2cea` per)
