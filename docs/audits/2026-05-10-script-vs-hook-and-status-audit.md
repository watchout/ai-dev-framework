# ADF Audit: script 制御 vs Boris 式 Hook 原則整合性 + v1.2.x 開発状況

> **Date**: 2026-05-10
> **Author**: ARC
> **Trigger**: CEO directive `00cd7176` + `0eeb341e` (CEO `110eb130` 採択 (A) 統合 plan)
> **Honesty**: 全 claim に [検証済] / [文献確認] / [推測] ラベル

---

## 0. 監査範囲

[文献確認: CEO directive 0eeb341e]
- (1) script 制御 vs Boris 式 Hook 原則整合性 (ADF 全 4 layer × 3 version)
- (2) v1.2.0 / v1.2.1 / v1.2.2 開発進捗 vs 実装ソース整合性
- (3) 設計概念固定化 (spec template 強化、Notion canonical link)
- (4) 開発手順見える化 (誰でも再現可能、GitHub ベース)

参照原則 [文献確認: Notion https://www.notion.so/35ad2b26f3dc8122b9f5e513b769d4e4]
- **default**: script 制御 (daemon / cron / launchd / pg trigger / GH Actions)
- **fallback**: Boris 式 Hook、不可避 4 case のみ:
  1. tool 呼出 BLOCK (PreToolUse)
  2. LLM context 注入 (UserPromptSubmit / SessionStart)
  3. session 起動時 state 復元 (SessionStart)
  4. tool 実行直後の検証 (PostToolUse)

---

## 1. script vs Hook 原則整合性 (検証済)

### 1.1 v1.2.0 (`docs/specs/09_ENFORCEMENT.md`)

[文献確認 grep]:

| 機構 | 実装 | 原則整合 |
|---|---|---|
| §1 Framework Mode | script (`framework run/exit`) | ✅ |
| §2 Bypass Audit | CI workflow (script) | ✅ |
| §3 Hook & Settings Integrity | hook (PreToolUse / SessionStart) | 🟡 case 該当不明確 (PreToolUse での自己整合 check は case 1 = tool BLOCK 範囲) |
| §4 AEGIS Gateway | MCP middleware (script) | ✅ |
| §5 Session lifecycle | hook (SessionStart) | ✅ case 3 |
| §6 Read-receipt | hook (UserPromptSubmit / PostToolUse) | ✅ case 2/4 |

**判定**: v1.2.0 は実 mechanism として原則整合だが、**§1 冒頭で原則の選定根拠が implicit**。本 audit で明示化提案。

### 1.2 v1.2.1 (SPEC-DOC4L-008)

[文献確認: `docs/spec/v1.2.1-hooks.md` §4.4 F4-1〜F4-4]

| FR | 機構 | 不可避 case 該当 | 整合 |
|---|---|---|---|
| F4-1 PostToolUse (lint 強制) | hook | case 4 (tool 実行直後検証) | ✅ |
| F4-2 Stop (test 強制) | hook | case 4 (完了 block) | ✅ |
| F4-3 SessionStart (spec/state 注入) | hook | case 2 + 3 | ✅ |
| F4-4 PreToolUse (危険コマンド block) | hook | case 1 (tool BLOCK) | ✅ |

**判定**: v1.2.1 全 Hook が不可避 4 case 内、**違反なし**。

### 1.3 v1.2.2 (SPEC-DOC4L-009)

[文献確認: `docs/spec/v1.2.2-plan-verify.md` §4.1〜§4.5]

| FR | 機構 | 整合 |
|---|---|---|
| F1 Plan Mode 必須化 | SessionStart hook 拡張 + `framework dispatch` CLI (script) | ✅ Hook=case 2/3、CLI=script default |
| F2 label check | Stop hook | ✅ case 4 |
| F3 citation 検証 | Stop hook | ✅ case 4 |
| F4 post-merge full verify | **GitHub Actions** (script) | ✅ script default |
| F5 verdict persist | **`framework verdict` CLI** (script) + SessionStart auto-load (hook、case 3) | ✅ |

**判定**: Hook と script の境界が原則通り、**違反なし**。

### 1.4 全体結論

**v1.2.x の 4 layer spec 設計は script vs Hook 原則と整合している (違反なし)**。impl 段で逸脱が起きないよう、本 audit で template 強化 + canonical link 追加で **構造的に enforce** する。

---

## 2. v1.2.x 開発状況 vs 実装ソース整合性 [全 検証済 GitHub + 実 file]

### 2.1 v1.2.0 status

| substep | Issue | PR | 状態 |
|---|---|---|---|
| 1/5 型定義 + templates + init-feature + principle0 | #92 CLOSED | #96 MERGED | ✅ |
| 2/5 trace verify + trace graph | **#101 OPEN** | #103 MERGED | 🟡 Issue close 漏れ |
| 3/5 Gate 0 + Gate 1 拡張 | **#102 OPEN** | #104 MERGED | 🟡 Issue close 漏れ |
| 4/5 (proposal §roadmap で予定) | 🔴 Issue 不在 | — | 🔴 計画 placeholder のみ |
| 5/5 (同上) | 🔴 Issue 不在 | — | 🔴 同上 |
| haishin-puls-hub dogfood (proposal 前提) | — | — | 🟡 framework install 確認、dogfood レポート未確認 |

[文献確認 `gh issue list --label v1.2.0 --state all`]: 上記 3 件のみ heart。

### 2.2 v1.2.1 status

| 項目 | 状態 |
|---|---|
| SPEC/IMPL/VERIFY/OPS-DOC4L-008 4 layer doc (PR #125) | ✅ MERGED |
| VERIFY §3 patch (PR #128) | 🟡 OPEN |
| 6-section instruction (PR #129) | 🟡 OPEN、L1+L2+L3 LGTM、CTO merge 待ち |
| `framework hook init/validate/test/list` CLI 実装 | 🔴 `src/cli/commands/hook/` 不在 = 0 行 |
| `templates/project/.claude/scripts/{block-dangerous,stop-verify,inject-spec-context,post-edit-verify}.sh` | 🔴 0 ファイル = 0 行 |
| `templates/project/.claude/settings.json` v1.2.1 4 hook 構成 | 🔴 v1.2.1 構成 0 行 |
| haishin-puls-hub dogfood (1 週間) | 🔴 未開始 |

[文献確認 `ls src/cli/commands/`]: `hook/` directory 不在。`grep -rn "hook init"` で実装 code 0 件。

### 2.3 v1.2.2 status

| 項目 | 状態 |
|---|---|
| SPEC/IMPL/VERIFY/OPS-DOC4L-009 4 layer doc | ✅ MERGED (PR #125 同時) |
| Issue #127 起票 | ✅ |
| 全 impl (Plan Mode / label-check / citation / post-merge verify / verdict) | 🔴 v1.2.1 dogfood gating で全未着手 |

### 2.4 順序逆転 risk

CEO 指摘 (msg `11728604`) 通り、現状は:
- spec 完成 (12 file) >> impl 着手 (0 行)
- v1.2.0 完了 gate (substep 4/5/5/5) 未確定
- v1.2.1 着手は v1.2.0 完了後 gating の建前だが、v1.2.0 自体が「完了」 line を引けない状態

= **spec 先行 vs impl 着手 vs v1.2.0 完了の 3 way 順序逆転**

---

## 3. 修正 plan

### 3.1 本 audit PR で実施 (即着手)

1. ✅ 本 audit doc commit
2. ✅ `templates/project/docs/spec/_template.md` に「制御機構選定原則」 section 追加 + Notion link
3. ✅ `templates/project/docs/ops/_template.md` に同 section 追加
4. ✅ `docs/specs/09_ENFORCEMENT.md` 冒頭に script/Hook 選定原則明示
5. ✅ `docs/HOW_TO_DEVELOP.md` 新規 (誰でも再現可能な開発手順、GitHub ベース)

### 3.2 別 dispatch / Issue で進行

1. v1.2.0 substep 2/3 Issue close (#101, #102) — adf-lead に dispatch
2. v1.2.0 substep 4/5, 5/5 Issue 起票 — proposal §roadmap per、内容確定後 ARC が起票
3. v1.2.0 完了 gate KPI 明示化 (haishin-puls-hub dogfood レポート確認)
4. v1.2.1 dev-001 への sub-PR A 起票は v1.2.0 完了 gate 後で hold (PR #129 merge 後も待機)

---

## 4. ARC honest 反省

[honest]:
- 本日 v0.4 / v0.5 / v0.6 / v0.7 / v0.8 / cycle 2 / cycle 3 と patch 累積、すべて「impl/schema 実態を verify せず spec 起草」が原因
- PR #125 (ADF v1.2.x 4 layer) も同様、proposal を信頼して 8 file 起票、v1.2.0 完了状態 verify 漏れ
- `memory feedback_check_ssot_before_drafting` 反省累積 ≥ 7 件 (本日)
- 構造的修正必要: ARC が spec 起草前に verify checklist を通す mechanism (Pre-impl gate に組込検討、CTO 領域)

---

## 5. 後続 chain

- 本 audit doc + template 強化 + 09_ENFORCEMENT 更新 + HOW_TO_DEVELOP doc を 1 PR で起票
- ARC LGTM → CTO L3 sanity → merge (route:fast-merge 候補、design integrity update + doc only)
- merge 後 adf-lead に v1.2.0 substep 4/5, 5/5 Issue 起票 + #101, #102 close dispatch

---

## 6. References

- CEO directive: `00cd7176` (deep verify)、`0eeb341e` (script vs Hook)、`110eb130` (A 統合採択)、`fd0ddd5b` (進めて GO)
- Notion canonical: https://www.notion.so/35ad2b26f3dc8122b9f5e513b769d4e4
- proposal: `proposals/v1.2.x/adf-v1.2.x-spec-proposal.md` (PR #124、d512cd9)
- v1.2.0 SPEC-INDEX: `docs/specs/SPEC-INDEX.md`
- governance-flow: `~/.claude/rules/governance-flow.md`
