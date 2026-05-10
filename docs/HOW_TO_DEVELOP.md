# ADF 開発手順 — 誰でも同じ進め方ができる GitHub ベースの canonical guide

> **Issued**: 2026-05-10 (CEO directive `00cd7176` per、ARC 起票)
> **Audience**: ARC / adf-lead / dev-bot (dev-001 等) / auditor / CTO / CEO
> **Honesty**: 全 claim に [検証済] / [文献確認] / [推測] ラベル

---

## 0. 本 doc の位置付け

[文献確認: CEO directive `00cd7176`] 「誰がみても同じ進め方ができる様に GitHub ベースで手順を見える化」directive 受領。本 doc は **canonical** な開発手順 SoT。各 dev-bot / lead-bot / ARC は本 doc を起点に開発を進める。

---

## 1. ADF version 別の開発フロー

### 1.1 v1.2.0 完了 gate

[文献確認: proposal `proposals/v1.2.x/adf-v1.2.x-spec-proposal.md` §「ADF v1.2.x roadmap」]

| substep | scope | gate |
|---|---|---|
| 1/5 | 型定義 + templates + init-feature + principle0 骨子 | ✅ |
| 2/5 | trace verify + trace graph | PR merge + Issue close |
| 3/5 | Gate 0 + Gate 1 拡張 | PR merge + Issue close |
| 4/5 | (proposal で予定、Issue 起票必要) | TBD |
| 5/5 | (同上) | TBD |
| haishin-puls-hub dogfood | 1 週間実証、KPI 達成 | dogfood report Drive 配置 + Discord 共有 |

### 1.2 v1.2.1 開発フロー (SPEC-DOC4L-008、Hooks 基盤統合)

[文献確認: `docs/spec/v1.2.1-hooks.md` + Issue #126]

```
v1.2.0 完了 gate
  → adf-lead が 6-section instruction 起票 (PR #129)
  → ARC final review LGTM
  → CTO L3 sanity → merge
  → adf-lead が dev-001 に sub-PR A 起票 dispatch
  → dev-001 sub-PR A impl (PreToolUse + framework hook init + 必要 lib)
  → 4-layer chain: lead-ama L1 → auditor L2 → CTO L3 → CEO L4 (route:ceo-approval 該当時)
  → merge
  → sub-PR B (Stop hook) 着手
  → sub-PR C (PostToolUse + SessionStart)
  → sub-PR D1 (CLI validate/test/list)
  → sub-PR D2 (template + SPEC-INDEX update)
  → 全 merge 後 haishin-puls-hub install + 1 週間 dogfood
  → dogfood report + KPI 確認 (post-merge skip 0 / main 直 push 0 / admin merge 0)
  → v1.2.1 完了
```

### 1.3 v1.2.2 開発フロー (SPEC-DOC4L-009、Plan Mode + Verify)

[文献確認: `docs/spec/v1.2.2-plan-verify.md` + Issue #127]

```
v1.2.1 dogfood 完了 gating
  → adf-lead が 6-section instruction 起票
  → ARC final review LGTM
  → CTO L3 sanity → merge
  → adf-lead が dev-bot に sub-PR 起票 dispatch
  → 5 sub-PR (Plan Mode + label + citation + post-merge verify + verdict) 順次 impl
  → 4-layer chain per sub-PR
  → 全 merge 後 haishin-puls-hub で 2 週間 dogfood
  → KPI 確認 (label gaming 検出 ≥ 5 / citation hallucinate ≥ 3 / Plan block ≥ 5 / post-merge skip 0 継続)
  → v1.2.2 完了
```

---

## 2. Role / Layer 別の責務

[文献確認: `~/.claude/rules/governance-flow.md`]

| Role | 責務 | block 権限 |
|---|---|---|
| **ARC** | spec 起草 + spec-impl 整合性 patch + 制御機構選定原則の chain 監督 | ✅ spec patch 経由 |
| **adf-lead** | 6-section instruction + L1 review + dev-bot 進捗監督 | ✅ L1 |
| **dev-bot** (dev-001 等) | impl + test + PR 起票 (5-section instruction の Open decisions 範囲) | (起票のみ) |
| **codex-auditor** | Pre-impl gate (7 項目) + Post-impl L2 (6-axis) | ✅ L2 |
| **CTO** | L3 sanity + cross-cutting design + governance gate + merge ボタン | ✅ L3 + merge |
| **CEO** | L4 (route:ceo-approval 時) + 戦略判断 | ✅ L4 (critical PR) |

---

## 3. 1 PR の作り方 (誰でも再現可能)

### 3.1 起票前 checklist

- [ ] 対応 Issue を `gh issue list` で確認、本 PR と紐付ける
- [ ] **対応 SPEC / IMPL / VERIFY / OPS 4 layer doc を読了** (memory `feedback_check_ssot_before_drafting` per、未 verify で起票禁止)
- [ ] 制御機構選定原則 (SPEC §10 / OPS §9) を確認、本 PR の機構が原則と整合しているか self-check
- [ ] 1 PR 1 concern 原則確認 (混在は分離)

### 3.2 開発手順

1. `git checkout -b <type>/<scope>-<short-name>` (例: `feat/v1.2.1-pre-tool-use`、`fix/verify-doc4l-008-stop-hook-exit-code`)
2. 対応 spec の Forbidden behavior に違反していないか self-check
3. impl + test 作成
4. **CI green を local で verify** (`pnpm test` + `pnpm lint` + `pnpm typecheck`)
5. `git commit` (Conventional commits、`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`)
6. `git push -u origin <branch>`
7. `gh pr create --base main --head <branch> --title "..." --body "..."`
8. PR description に必須項目記述:
   - Summary
   - References (spec / Issue / 関連 PR / Notion)
   - Test plan (checklist)
   - Layer 0 self-check
9. label 設定 (`route:fast-merge` or `route:ceo-approval`)

### 3.3 review chain (4-layer)

```
PR 起票 (dev-bot)
  → Layer 0 (CI 自動 gate): typecheck + lint + test + breaking-change-detection
  → Layer 1 (lead-bot): sprint 視点 + 仕様準拠 + PR description verify
  → Layer 2 (codex-auditor): 6-axis (設計意図 / scope / hidden / regression / SSOT / honesty)
  → Layer 3 (CTO): governance / framework / cross-cutting / merge ボタン
  → Layer 4 (CEO): route:ceo-approval 時のみ
  → CTO merge 実行
  → post-merge verification (project-specific)
```

各 Layer は **independent に block 可能**、1 つでも reject なら merge しない。

---

## 4. Issue の作り方 (canonical)

### 4.1 v1.2.0 substep の場合
- title: `[v1.2.0] サブステップ N/5: <scope>`
- label: `v1.2.0`, `doc4l`, `active`, `substep-N`
- body: 対応 SPEC FR + DoD checklist + 関連 PR / Issue link

### 4.2 v1.2.1/v1.2.2 dogfood + impl の場合
- title: `v1.2.X <feature> dogfood + impl (SPEC-DOC4L-NNN)`
- label: `enhancement`
- body: scope + 実装範囲 checklist + dogfood KPI + chain 説明

### 4.3 spec patch の場合
- title: `spec(...): <description>` (Conventional commits)
- label: 必要に応じて

---

## 5. 制御機構選定原則 (script 制御 vs Boris 式 Hook)

[文献確認: Notion canonical https://www.notion.so/35ad2b26f3dc8122b9f5e513b769d4e4]

新 spec / impl 起票時、必ず以下原則を通すこと:

| 原則 | 内容 |
|---|---|
| default | script 制御 (daemon / cron / launchd / pg trigger / GH Actions) |
| fallback | Boris 式 Hook、不可避 4 case のみ |
| Hook 不可避 4 case | (1) tool 呼出 BLOCK / (2) LLM context 注入 / (3) session 起動 state 復元 / (4) tool 実行直後検証 |
| 違反時 | CTO L3 review で reject、script 化 refactor 要請 |

SPEC §10 (制御機構選定原則) で本 PR の機構が原則と整合していることを記述する。

---

## 6. Honest 原則 (全 bot 適用)

[文献確認: CLAUDE.md「Honest Mode」]

1. **根拠ラベル必須**: 主要 claim に `[検証済]` / `[文献確認]` / `[推測]` 付与
2. **「分からない」は valid な答え**: 嘘 / hallucinate より honest な「不明」が価値
3. **Sycophancy 禁止**: 同調するために結論を変えない
4. **能動的検証**: WebSearch / Bash / Read を能動的に使う、cutoff 知識のみで断定しない

特に `[検証済]` は「実 file / コマンド / DB query 結果を見た」場合のみ。spec 起草時の前提検証も `[検証済]` 必須。

---

## 7. 並行 chain と escalation

### 7.1 並行 chain
- 複数 PR / Issue を並行進行する場合、ARC / adf-lead が依存関係を可視化 (Issue / PR の `Linked issues`)
- 1 PR 内で複数 concern が混在しないこと (1 PR 1 concern)

### 7.2 escalation
- spec design gap 発見 → adf-lead → ARC (第一次)
- cross-repo / 戦略的 abstraction → adf-lead → CTO (第二次)
- 経営判断必要 → CEO

---

## 8. 関連 doc

- `docs/specs/SPEC-INDEX.md` (v1.2.0 spec INDEX)
- `docs/specs/09_ENFORCEMENT.md` (script 制御 vs Hook 原則明示)
- `docs/spec/v1.2.1-hooks.md` (SPEC-DOC4L-008)
- `docs/spec/v1.2.2-plan-verify.md` (SPEC-DOC4L-009)
- `proposals/v1.2.x/adf-v1.2.x-spec-proposal.md` (proposal、PR #124)
- `~/.claude/rules/governance-flow.md` (4-layer chain + Pre-impl gate)
- Notion canonical: [script 制御 vs Boris 式 Hook 使い分け原則](https://www.notion.so/35ad2b26f3dc8122b9f5e513b769d4e4)
- `docs/audits/2026-05-10-script-vs-hook-and-status-audit.md` (本 audit)
