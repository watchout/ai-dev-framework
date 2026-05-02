# 04c_FEASIBILITY_POC_FORMAT.md - Feasibility / PoC Document Format

> **Status**: Frozen format spec (Sub-PR 0.4 of lead-impl-workflow)
> **Effective**: 2026-05-02
> **Owner**: lead-bot (authoring) + codex-auditor (validation)
> **Parent SPEC**: `docs/specs/lead-impl-workflow/SPEC.md` FR-L6
> **Companion**: `04b_IMPL_FORMAT.md` (IMPL.md format), `02_GENERATION_CHAIN.md` Step 3.45

---

## §1 目的 (Feasibility / PoC ドキュメントの位置づけ)

ADF 生成チェーンの Step 3.45 (Feasibility PoC) で作成される **施工可能性 (feasibility) 検証** の成果物フォーマット。紙上設計 (SSOT / IMPL §5 推測) と実コード / 実環境の乖離を、実装着手前に **PoC 実施で検証** し、`[推測]` ラベル付き assertion を `[検証済]` に置換する根拠を残す。

[文献確認: 親 SPEC FR-L6 / IMPL §3 Phase 0 Sub-PR 0.4]

### Feasibility document が必要となる典型 case

- IMPL §5 (既存コードからの移行) で `fs.* 〜15 箇所` 等の **見積を `[推測]` で記載** したが、実数値が桁違いの可能性 (ARC 実観測: 推測 15 → 実数 546 = 36 倍乖離)
- 外部 API / SDK の挙動に rate limit / shape 不一致 / impedance mismatch がある可能性 (CTO BLOCK Gap A)
- Pilot deploy で install bundle 漏れ / env var 不足等の構造的失敗 (webb-dev pilot, msg `5e4b007d`)

[文献確認: 親 SPEC FR-L6 rationale block]

### `04b_IMPL_FORMAT.md` との関係

- `04b`: IMPL.md (施工図) 全体の format。§5 で `[推測]` を許容
- `04c` (本 doc): `[推測]` を `[検証済]` に格上げするための PoC 成果物 format

---

## §2 必須セクション (Goal / Hypothesis / Method / Result / Decision)

PoC ドキュメント (例: `docs/specs/<feature>/feasibility/<topic>.md`) は以下 5 sub-section を必須とする。

### Goal

PoC で何を検証するか。1-2 sentence で明示。検証対象の `[推測]` ラベル付き assertion (IMPL §5 等) への back-reference を含める。

### Hypothesis

検証前の仮説 (What we expect to find)。具体的な数値 / 挙動 / shape を記述。後段の Result と直接対比できる粒度。

### Method

検証手段。再現可能な手順。許容される手段:

- **実コード grep / count**: `grep -rn "<pattern>" <path>` 等の実行コマンドと expected line range
- **Smoke test**: 最小実行可能スクリプト / `framework feasibility-check` CLI 実行 (Step 3.45 deterministic mode)
- **Plan-tool / static analysis**: AST 解析 / type check 結果
- **External dependency call**: 実 API / SDK 呼び出し (sandbox / staging で可)

[文献確認: 親 SPEC FR-L6.2 dual-mode (plan-tool / grep) / 親 IMPL §3 `framework feasibility-check`]

### Result

実測値 / 観測結果。Hypothesis との差分を明示。差分の origin (推定根拠の誤り / scope 過小評価 / 環境差異等) を 1 sentence で記述。

### Decision

PoC 結果からの判断:

- **GO**: SPEC / IMPL 該当 assertion を `[検証済]` に格上げ + IMPL §5 数値を実測値に置換
- **REVISE**: SPEC / IMPL に修正必要 (差分が大きく設計再考、ARC へ escalate)
- **BLOCK**: 実装不可 / scope 大幅拡大 (CEO escalate / Sub-PR 分割)

---

## §3 Evidence label 規約

PoC ドキュメント本文の全 substantive assertion (技術判断・実数値・設計選択) には `04b_IMPL_FORMAT.md` §11 と同根の以下 3 ラベルを付与する。drift 防止のため **04b と literal 一致** で扱う。

[文献確認: `docs/specs/04b_IMPL_FORMAT.md` §11 / 親 SPEC FR-L6.2]

| ラベル | 意味 | 典型用途 |
|---|---|---|
| `[検証済]` (英: `[observed]`) | 実コード / 実環境で観測 | grep / 実行 / smoke / API 呼び出しで確認した数値・挙動 |
| `[文献確認]` (英: `[referenced]`) | 既存 doc / spec / commit / msg を参照 | path / msg id / commit hash を併記推奨 |
| `[推測]` (英: `[unverified]` / `[hypothesis]` / `[propose]`) | hypothesis、未検証 | PoC 後段の Method / Result で `[検証済]` に置換される候補 |

**書式例** (04b §11 と同形式):

- `src/cli/lib 配下の fs.* 呼び出しは 546 箇所 [検証済: rg "fs\\." src/cli/lib | wc -l → 546 (2026-05-02)]`
- `Notifier API は send / sendDM の 2 表面で impedance mismatch を持つ [文献確認: agent-comms-mcp/src/notifier.ts §3]`
- `traceability matrix の Generator coverage は ≥80% に到達できる [推測: PoC 未実施]`

ラベル不在の assertion は L1 lead レビューで差戻し対象 (04b §11 と同 policy)。

---

## §4 Per-FR Traceability Matrix

PoC が parent SPEC の FR (Functional Requirement) を網羅していることを、FR-ID 単位で評価する表。各行が 1 FR、列は FR-ID / Hypothesis / Evidence class / Source / Result。

[文献確認: 親 SPEC FR-L6.3]

### 必須 column (最低限)

| FR-ID | Hypothesis | Evidence class | Source | Result |
|---|---|---|---|---|
| (例) FR-L6.2 | dual-mode (plan-tool / grep) で `framework feasibility-check` が exit 0 を返す | `[検証済]` | `src/cli/commands/feasibility-check.test.ts` smoke 結果 | PASS — exit 0 + skip key 出現 |
| FR-L6.3 | Per-FR matrix が PoC ドキュメントに必ず付随する | `[文献確認]` | 本 §4 (04c) | 規約上 必須 |
| FR-L6.X | (PoC 対象 FR、未検証) | `[推測]` | (PoC 未実施) | TBD |

### 採用 / 禁止される変形

- ✅ 列追加 (Severity / Notes / Owner 等) は許容
- ✅ 1 FR を複数行に分割 (sub-hypothesis 単位) も許容
- ❌ 必須 5 column のいずれかを省略
- ❌ Evidence class 欄に 3 ラベル以外の値 (e.g. `[ok]` `[done]`) 混入 — drift 防止

### Gate 3 (PoC Verified, FR-L6.3) との連携

`04c` 準拠の matrix を持つ feature は、Gate 3 (PoC Verified, FR-L6.3) で **「per-FR ≥1 件の `[検証済]` 」rule** を deterministic に check 可能 [文献確認: 親 SPEC FR-L6.3]。`[推測]` のみで構成された FR 行は WARNING 発行。Gate 3 (FR-L6.3) は IMPL.md presence validation の Gate 2 (FR-L4) と別物で、本 04c で扱う Feasibility PoC ↔ per-FR matrix の verify を担う。

---

## §5 PoC 結果から SPEC への昇格 flow

```
Step 3 (SSOT freeze, Freeze 2)
  → Step 3.45 Lead IMPL Authoring (04b 準拠の IMPL.md 起草、§5 で [推測] 許容)
       ├─ feasibility 必要判定 (lead-bot)
       │     - 推測の数値が桁違い risk / 外部依存の shape 不確定 / pilot 失敗 pattern 該当
       └─ Yes → 04c 準拠の Feasibility PoC ドキュメント作成
            ├─ Goal / Hypothesis / Method / Result / Decision (§2)
            ├─ Per-FR matrix (§4)
            └─ Decision = {GO, REVISE, BLOCK}
                 ├─ GO    → IMPL §5 数値を実測値に置換 + [推測] → [検証済]
                 ├─ REVISE → SPEC / IMPL を改訂 (ARC へ escalate)
                 └─ BLOCK  → Sub-PR 再分割 / scope 縮小 (CEO escalate も視野)
  → Pre-impl gate (codex-auditor 6 項目) PASS
  → Step 3.5 Task Decomposition
  → Step 4 Dev Start
```

PoC 完了後、IMPL.md §5 の `[推測]` ラベルが少なくとも 1 件 `[検証済]` に置換されることが、Gate 3 / Pre-impl gate の通過に対して観測可能な signal となる [文献確認: 親 SPEC FR-L6.2 / FR-L6.3]。

### REVISE 時の handling

PoC Result が Hypothesis と桁違いに乖離した場合 (実例: 推測 15 → 実数 546)、SPEC / IMPL §5 をそのまま update せず、ARC に escalate して **設計再考の要否** を判断する。乖離が単なる scope 過小評価なら IMPL update のみ、乖離が design 前提を覆すなら SPEC 改訂が必要。

[文献確認: 親 SPEC rationale block "ARC が実体験で観測した IMPL.md §5.1 の `fs.* 〜15 箇所` 推定 vs 546 箇所 実数"]

---

## §6 関連 doc link

- 親 SPEC: `docs/specs/lead-impl-workflow/SPEC.md` FR-L6 (Step 3.45 + Gate 3 + `framework feasibility-check`)
- 親 IMPL: `docs/specs/lead-impl-workflow/IMPL.md` §3 Phase 0 Sub-PR 0.4 (本 04c 自身の land scope)
- IMPL format 規範: `docs/specs/04b_IMPL_FORMAT.md` (§1〜§10 + Evidence label §11)
- Generation chain: `docs/specs/02_GENERATION_CHAIN.md` (Sub-PR 0.2 で Step 3.4 reference + Gate 2 IMPL Presence FR-L4 を land、Step 3.45 Feasibility PoC + Gate 3 PoC Verified FR-L6.3 は Sub-PR 0.5 で別 land 予定)
- Feature spec format: `docs/specs/04_FEATURE_SPEC.md` (12-section SSOT)
- Governance: `~/.claude/rules/governance-flow.md` Pre-impl gate (2026-05-02 effective、CEO directive `c4fb8e6c`)

[文献確認: relative path link は 2026-05-02 時点で全て有効。Sub-PR 0.2 で Gate 2 IMPL Presence (FR-L4) が land、本 04c が扱う Step 3.45 / Gate 3 (FR-L6 系) は Sub-PR 0.5 で別 land 予定 — anchor が指す具体 section は両 PR land 後に揃う]
