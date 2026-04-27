# 04b. IMPL.md フォーマット規範

> 対応 SPEC: `docs/specs/lead-impl-workflow/SPEC.md` FR-L2 (IMPL.md format)
> 対応 IMPL: `docs/specs/lead-impl-workflow/IMPL.md` §2 (Documentation layer) / §4.3 (template)
> Phase: doc4l SPEC layer / Step 3.4 (Lead IMPL Authoring)
> Status: v1.0 (Phase 0.1)

本ドキュメントは ADF の生成チェーン Step 3.4 (Lead IMPL Authoring) で lead-bot が作成する **IMPL.md (施工図)** のフォーマット規範を定義する [文献確認: SPEC.md FR-L2.1 が必須セクションを列挙]。各 feature の `docs/specs/<feature>/IMPL.md` は §1〜§10 の必須セクションを備え、すべての substantive assertion に evidence label を付与しなければならない [文献確認: SPEC.md FR-L2.2]。

---

## §1 アーキテクチャ概観

**目的**: feature 全体のレイヤ構造・プロセス境界・主要 component を 1 図で示す [文献確認: lead-impl-workflow/IMPL.md §1.1 が 3 層図を採用]。

**必須要素**:
- レイヤ図 (Documentation / Code / Skill / Hook 等の層分離が ASCII art で可視化されていること)
- プロセス境界 (CLI / CI / hook / external service の責任分担)
- 工程の流れ (Step X → Step Y の data flow が明示)

**書式例**:
```
┌─────────────────────────┐
│ Documentation layer     │  ← 規範
└─────────────────────────┘
           ↓
┌─────────────────────────┐
│ Code layer (validator)  │  ← deterministic
└─────────────────────────┘
```

---

## §2 モジュール構造

**目的**: 新規 / 変更ファイルツリーを 1 表に集約し、reviewer が PR diff を読む前に全体像を掴める状態を作る [文献確認: lead-impl-workflow/IMPL.md §2 の 3 表構造]。

**必須要素**:
- 種別 (新規 / 既存改訂 / 削除) × パス × 変更概要の 3 列表
- レイヤ別に表を分割可 (例: §2.1 Documentation / §2.2 Code / §2.3 Skill)

**書式例**:
| 種別 | パス | 変更概要 |
|---|---|---|
| 新規 | `src/cli/lib/foo.ts` | bar logic を分離 |
| 既存改訂 | `src/cli/commands/baz.ts` | foo 呼出し追加 |

---

## §3 実装順序

**目的**: feature を sub-PR に分解し、依存グラフと着手順序を明示する [文献確認: governance-flow.md "1 PR 1 concern" 原則]。

**必須要素**:
- Phase 区分 (例: Phase 0 文書化 / Phase 1 code / Phase 2 CI 強制)
- Sub-PR 番号 + 概要 + 依存関係 (並行可 / N-1 merge 後 等)
- 依存グラフ図 (ASCII art 可)

**1 PR 1 concern 原則**: 1 sub-PR は 1 つの concern に絞る。bundle 必須の場合は **Gap 名 + bundle 理由** を明記する (例: 「★ 同 PR bundle、CTO Gap C 反映で window ゼロ達成」) [文献確認: lead-impl-workflow Sub-PR 0.1 が CTO Gap C 反映で bundle 化]。

---

## §4 コードパターン

**目的**: 主要 interface / class / function signature を具体的に示し、実装者の頭で再構築させない [文献確認: lead-impl-workflow/IMPL.md §4.1 の validator signature 例]。

**必須要素**:
- TypeScript / 該当言語の signature (型まで含めて具体的に)
- 入力 / 出力 の型と invariant
- 既存パターンとの整合性参照 (例: 「既存 X と同構造」)

**書式例**:
```typescript
export interface FooResult {
  status: "PASS" | "WARNING" | "BLOCK";
  findings: Finding[];
}
export function validateFoo(path: string): FooResult { ... }
```

---

## §5 既存コードからの移行

**目的**: 既存 codebase への影響範囲を **実コード grep で実測** し、紙上設計と実装乖離を排除する [文献確認: SPEC.md FR-L6 dogfood 事例「fs.* 〜15 箇所 推定 vs 546 箇所 実数 = 36倍乖離」]。

**必須要素**:
- 影響箇所の grep 結果 (件数 + 代表的な path 列挙)
- 後方互換戦略 (互換維持 / 段階的廃止 / 一括移行 のいずれか明示)
- 既存 OPEN PR / 進行中 feature への影響評価

**Step 3.45 (Feasibility PoC) との関係**: §5 内の assumption は Step 3.45 で `framework feasibility-check` により検証される [文献確認: SPEC.md FR-L6.2]。Gate 3 (per-FR traceability matrix) は §5 を中心に評価する [文献確認: SPEC.md FR-L6.3]。

---

## §6 サブPR 5-section template

**目的**: lead-bot が起票する各 sub-PR の 5-section instruction で **共通する Forbidden / Test fixtures** を IMPL.md レベルで一度宣言し、各 issue で重複記述を避ける [文献確認: lead-pr-instruction skill の 5-section format]。

**必須要素**:
- 全 sub-PR 共通の Forbidden behavior (例: 「`any` 型禁止」「`console.log` 残置禁止」)
- 全 sub-PR 共通の Test fixtures (例: 「lint pass」「既存 test 破壊なし」)
- per-sub-PR の Open decisions 範囲のデフォルト境界

個別 sub-PR の instruction §1〜§5 はこの common template を継承し、差分のみを issue 本文に記載する。

---

## §7 Adapter / 契約の詳細

**目的**: feature が外部世界 (UI / LLM / DB / Auth / Platform 等) と接する箇所の adapter 契約を明示する [文献確認: governance-flow.md 「Abstraction leak の典型 smell」 + 2026-04-23 CEO directive (multi-LLM 1 script 失敗事例)]。env var 切替や文字列 config による多態は abstraction leak として検出する。

**必須要素**:
- adapter interface (port pattern、TypeScript interface 推奨)
- 各 adapter 実装の variant 一覧 (例: ClaudeAdapter / CodexAdapter / GeminiAdapter)
- 対称性確認 (外部世界 X に adapter があるなら同抽象レベルの Y にも adapter 必須)
- failure mode 列挙 (silent exit / timeout / rate limit / partial failure 各々の detection + recovery)

---

## §8 Phase 0 ブートストラップ (該当時)

**目的**: feature が新規 framework 機構を立ち上げる場合 (例: 新 Gate / 新 skill / 新 hook)、文書化のみで先行 merge できる Phase 0 boundary を明示する [文献確認: lead-impl-workflow/IMPL.md §3 Phase 0 が CTO Gap C 反映で sub-PR bundle を要求した実例]。

**必須要素 (Phase 0 が存在する feature のみ)**:
- 文書化スコープ (どの spec / template / rule を新規・改訂するか)
- code touch 禁止の明示 ("Phase 0 = 文書化のみ" の宣言)
- Phase 1 着手前提 (Phase 0 merge 完了が Phase 1 着手の Gate)

Phase 0 を持たない feature は本セクションを「該当なし」として明記する。§8 header 自体は省略禁止。

---

## §9 Open decisions

**目的**: implementer (dev-bot) が **自由に判断してよい** 項目を列挙する [文献確認: engineer-scope-discipline skill が 5-section instruction §5 を「the only free space」として規定]。本セクションに列挙されないものは暗黙凍結。

**必須要素**:
- implementer 自由項目の **明示列挙** (例: 内部変数名 / private helper の有無 / commit message phrasing / branch 名)
- 暗黙凍結の宣言 ("ここに列挙されていないものは暗黙凍結")
- escalate の宛先 (lead-bot / ARC / CTO のいずれか)

---

## §10 lead 責任の明示

**目的**: 当該 IMPL.md の作成者 (lead-bot interim を含む) と更新責任者を明示する [文献確認: SPEC.md FR-L3 lead 責任の codify]。SPEC drift / IMPL stale が発覚した際の問合せ先を読み手に伝える。

**必須要素**:
- 作成者 (例: lead-bot / ARC interim / 担当者名)
- 最終更新日 (Conventional commits 由来推奨)
- SPEC との対応 (`対応 SPEC: <path>` を frontmatter または本文 §10 で明示)
- escalate criteria (どの判断は lead で完結 / どの判断は ARC / CTO へ escalate するか)

---

## §11 Evidence label 規約 (substantive assertion 全件必須)

IMPL.md 内のすべての substantive assertion (技術判断・実数値・設計選択) には以下 3 種のいずれかのラベルを付与する [文献確認: SPEC.md FR-L2.2 + ~/.claude/skills/evidence-based-reasoning/SKILL.md]。ラベル不在の assertion は L1 lead レビューで差戻し対象。

| ラベル | 意味 | 使用条件 |
|---|---|---|
| `[検証済]` (英: `[observed]`) | 実コード / 実環境で観測 | grep / 実行 / smoke 実施で確認した数値・挙動 |
| `[文献確認]` (英: `[referenced]`) | 既存 doc / spec / commit / msg を参照 | path / msg id / commit hash を併記推奨 |
| `[推測]` (英: `[unverified]` / `[hypothesis]` / `[propose]`) | hypothesis、未検証 | Step 3.45 (Feasibility PoC) で検証され `[検証済]` に置換される候補 |

**書式例**:
- `fs.readFileSync の利用箇所は約 15 箇所 [推測: 静的見積]`
- `fs.readFileSync の利用箇所は 546 箇所 [検証済: ripgrep 実行 04-27]`
- `adapter pattern を採用 [文献確認: distribution/SPEC.md FR-D2]`

**Step 3.45 との連携**: `[推測]` ラベルは Step 3.45 PoC 検証で実コード grep / smoke 等により検証され、`[検証済]` に置換される [文献確認: SPEC.md FR-L6.2]。Gate 3 (per-FR traceability matrix) は各 FR について最低 1 件の `[検証済]` を要求する [文献確認: SPEC.md FR-L6.3]。

---

## §12 template 参照

`framework init-feature <name>` 実行時に生成される IMPL.md の雛形は `templates/specs/IMPL.md.template` (Sub-PR 0.3 で新規作成) を出力源とする [文献確認: lead-impl-workflow/IMPL.md §2.1]。本フォーマット規範 (§1〜§11) は template の各セクション header と 1:1 対応する [推測: template 生成 CLI の実装は Phase 1 (`init-feature` 拡張) で行う、Phase 0.3 では template ファイルのみ先行 commit]。

---

## 関連 doc

- 親 SPEC: `docs/specs/lead-impl-workflow/SPEC.md` (FR-L2 / FR-L3 / FR-L6)
- 親 IMPL: `docs/specs/lead-impl-workflow/IMPL.md` (§2.1 / §3 Phase 0 / §4)
- governance: `.claude/rules/governance-flow.md` (Role mapping、本 Phase 0.1 で同期改訂)
- template: `templates/specs/IMPL.md.template` (Sub-PR 0.3)
- feasibility 仕様: `docs/specs/04c_FEASIBILITY_POC_FORMAT.md` (Sub-PR 0.4)
