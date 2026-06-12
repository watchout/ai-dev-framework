# Lead IMPL Authoring Workflow SPEC

> doc4l 4-layer / SPEC layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 関連: IMPL.md / VERIFY.md / OPS.md (同 directory)

## §1 目的

ADF の生成チェーン (Step 0 Discovery → Step 4 Dev Start) に **Step 3.4: Lead IMPL Authoring** を追加し、SSOT (CONTRACT 層) と dev 実装の間に lead-bot が **施工図 (IMPL.md)** を必ず作成する工程を framework 強制で組み込む。

これにより以下を解消する [文献確認: 本セッション 2026-04-27 でのプロセス違反観察、Issue #105 起票時に IMPL なしで 5-section instruction を直接起票した事象]:

- SSOT (何を作るか) と dev 実装 (どう作ったか) の間にある **「どう作るかの設計」工程が暗黙化** されている
- 5-section instruction のみで dev に丸投げされ、lead 自身が施工図を可視化していない (lead-pr-instruction skill は instruction format のみ規定、IMPL 工程は規定なし)
- Sub-PR 分解 / module 構造 / code 移行 strategy が各 lead 個人の頭の中に閉じ、追跡 / レビュー / dogfooding 不能

## §2 非目的

- ❌ SSOT format の変更 — `03_SSOT_FORMAT.md` の 12 sections は維持、IMPL は別 artifact
- ❌ 5-section instruction の廃止 — IMPL 出力を 5-section instruction に転記する関係性は維持
- ❌ doc4l v1.2.0 の SPEC/IMPL/VERIFY/OPS feature-level doc 4 layer 構造の変更 — 本 SPEC はその構造を per-feature → per-PR まで貫通させる integration
- ❌ ARC 役割 (architect / SSOT / 完了判定) の変更 — SPEC は引き続き ARC、IMPL は引き続き lead
- ❌ 既存 PR (#104 / #91 / Issue #105 / Phase 1 残) の遡及 retroactive 適用 — 新 PR から適用、移行 plan は OPS.md で扱う

## §3 ユーザーストーリー

### US-L1: lead-bot として

```
lead-bot として、
私は SSOT を読んだ後、
IMPL.md (施工図) を本工程として明示的に作成する責任が framework から課される状態を期待する。
私の頭の中で完結してしまう曖昧さを除去できる。
```

### US-L2: dev-bot として

```
dev-bot として、
私は実装着手前に IMPL.md (施工図) を読み、
module 構造 / 移行 strategy / sub-PR 順序 / code pattern を
SSOT より具体的なレベルで把握できる状態を期待する。
5-section instruction だけでは Open decisions の境界が曖昧。
```

### US-L3: ARC として

```
ARC として、
私は SPEC (CONTRACT) と IMPL (施工図) を分離して保持できる状態を期待する。
SPEC freeze と IMPL 進化を独立に追跡でき、SPEC drift を検知できる。
```

### US-L4: auditor / CTO として

```
auditor / CTO として、
私は PR が IMPL.md §X 準拠であることを review 時に直接照合できる状態を期待する。
implementation の judgment (axis 4 / 5) を IMPL 参照で具体化できる。
```

### US-L5: framework 利用 project として

```
framework 利用 project として、
私は IMPL.md 不在の dispatch を framework gate が機械検出して block する状態を期待する。
LLM 意志に頼らず deterministic に強制してほしい。
```

[文献確認: memory `feedback_self_enforcement_via_hook.md` — 反復遵守は hook 強制]

## §4 機能要件

### FR-L1: 工程の組込み (`02_GENERATION_CHAIN.md` 改訂)

**FR-L1.1 (MUST)** Step 3 (Technical) と Step 3.5 (Planning) の間に **Step 3.4: Lead IMPL Authoring** を新設する

**FR-L1.2 (MUST)** Step 3.4 の input は SSOT 一式 (Freeze 2 完了済)、output は per-feature の IMPL.md

**FR-L1.3 (MUST)** Step 3.4 → Step 3.5 の Gate 条件として「対象 feature の IMPL.md 存在 + lead 承認」を追加

### FR-L2: IMPL.md の format (`docs/specs/04_FEATURE_SPEC.md` 拡張、または新規 `04b_IMPL_FORMAT.md`)

**FR-L2.1 (MUST)** IMPL.md の必須セクション:
1. アーキテクチャ概観 (レイヤ構造 / プロセス境界)
2. モジュール構造 (新規 / 変更ファイルツリー)
3. 実装順序 (sub-PR 分解 / 依存グラフ)
4. コードパターン (interface / class / pattern の具体例)
5. 既存コードからの移行 (影響範囲 grep / 後方互換戦略)
6. サブPR 5-section template (Forbidden / Test fixtures の継承共通項)
7. Adapter / 契約の詳細
8. Phase 0 ブートストラップ (該当時)
9. Open decisions
10. lead 責任の明示

**FR-L2.2 (MUST)** 各 substantive assertion に evidence label 必須 [文献確認: skill-validator hook 既存挙動]

**FR-L2.3 (SHOULD)** templates/ に IMPL.md template を提供、`framework init-feature <name>` で生成

### FR-L3: lead 責任の codify (`governance-flow.md` 改訂、`05_IMPLEMENTATION.md` 拡張)

**FR-L3.1 (MUST)** governance-flow.md の Role mapping table に lead 責任として「IMPL doc authoring」を追加

**FR-L3.2 (MUST)** `05_IMPLEMENTATION.md` に「Lead-side IMPL drafting」section を新設、IMPL 不在 PR は 5-section instruction の起票を block するルールを明文化

**FR-L3.3 (SHOULD)** `lead-pr-instruction` skill の前段に `lead-impl-authoring` skill を追加、5-section instruction は IMPL.md §X の reference として記述するパターンを enforce

### FR-L4: Gate 機構による強制 (`09_ENFORCEMENT.md` 拡張、新 Gate)

**FR-L4.1 (MUST)** **Gate 2: IMPL Presence** を新設 — PR の linked Issue が IMPL.md の特定セクションを reference していることを検証 (referenced path が repo に存在 + 該当 section が non-empty)

**FR-L4.2 (MUST)** Gate 2 は CI で deterministic に動作 (LLM 判断不使用)、判定方法は grep + section header parsing

**FR-L4.3 (SHOULD)** Gate 2 は IMPL.md の必須セクション (FR-L2.1) 存在を validate、欠落は WARNING (BLOCK は L1 lead レビューで判断)

### FR-L5: dogfooding と migration

**FR-L5.1 (MUST)** ADF v1.2.0 の残 substep (4/5, 5/5) は本 IMPL workflow を適用して着手

**FR-L5.2 (MUST)** ADF distribution 取組 (`docs/specs/distribution/`) は本 IMPL workflow に整合 [検証済 observed: distribution/IMPL.md が本 SPEC 同時並行で作成済、§10 で lead 責任明示]

**FR-L5.3 (SHOULD)** 既存 OPEN PR (#104 / #91) は遡及適用しない、merge 後の follow-up issue で逐次 IMPL 化

### FR-L6: Step 3.45 Feasibility PoC + Gate 3 + framework feasibility-check CLI (CTO amend GO、msg `038a5662` 04-27)

CEO 質問「設計を起こす段階で実現可能な方式なのかを検証するフローも必要だろうか？」への回答として、Step 3.4 (Lead IMPL Authoring) と Step 3.5 (Planning) の間に **feasibility 検証工程** を挿入し、紙上設計と実コードの乖離を構造的に排除する。

[文献確認: 本 amend は ARC が実体験で観測した IMPL.md §5.1 の `fs.* 〜15 箇所` 推定 vs **546 箇所 実数** = 36倍乖離 / CTO BLOCK Gap A の Notifier ↔ send API impedance mismatch / webb-dev pilot 失敗 (msg `5e4b007d`) の PR #243 install bundle 漏れ — いずれも Step 3.45 PoC 検証で先行捕捉できた typical case]

#### FR-L6.1 (MUST) Step 3.45 工程の組込み

`docs/specs/02_GENERATION_CHAIN.md` の Step 3.4 と Step 3.5 の間に **Step 3.45: Feasibility PoC** を新設:

```
Step 3.4 IMPL Authoring (lead)
   ↓
[Step 3.45 Feasibility PoC] ★
  - lead が `framework feasibility-check <feature>` を実行
  - 実コード grep + smoke 1 件で feasibility 検証
  - IMPL.md §5 の [推測 unverified] を [検証済 observed] に置換
  - 不可能な assumption 発見時は IMPL を修正、または ARC に escalate
   ↓
[Gate 3 PoC Verified] ★
  - per-FR traceability matrix で deterministic 判定
   ↓
Step 3.5 Planning (Wave 分類、Issue 起票)
```

#### FR-L6.2 (MUST) framework feasibility-check CLI

`framework feasibility-check <feature> [--mode=plan-tool|grep]` を新設:

- 内部利用 (Claude Code 環境): `--mode=plan-tool`、Claude Code の /plan tool を backend 経由で起動 (LLMProvider adapter 経由 [文献確認: distribution/SPEC.md FR-D2 の adapter pattern])
- OSS 利用: `--mode=grep` (default、外部依存なし)、grep + diff-stat 等 static check による degraded fallback
- output: feature の IMPL.md §5 を更新 (evidence label を automerge candidate)

[推測 unverified: `framework feasibility-check` の `--mode=plan-tool` は本 amend dogfood で smoke 確認、grep fallback は production で動作確認必須]

#### FR-L6.3 (MUST) Gate 3: PoC Verified — per-FR traceability matrix (CTO 推奨採用)

ARC 当初案 (`[検証済] ≥ 5 + [推測] ≤ 3` 件数 ratio) は CTO により fragile (件数 manipulate 可能) として却下。

**採用案: per-FR traceability matrix**:
- 各 FR-L*.* (および対象 feature の SPEC.md 内全 FR-*.*) に対して、IMPL.md §5 evidence 内に最低 1 件 `[検証済 observed]` ラベルが存在することを必須化
- `framework gate poc --feature=<name>` で deterministic check:
  1. 対象 feature SPEC.md から FR-*.* を全列挙 (regex `^\*\*FR-[A-Z]+-?\d+\.\d+`)
  2. 各 FR ID が IMPL.md §5 で言及されていることを grep
  3. 該当 §5 mention の同一段落 (context window 5 行) 内に `[検証済 observed]` ラベル存在を grep
  4. 0 件 FR が 1 つでも存在 → BLOCK

[文献確認: CTO 設計判断 msg `038a5662` 「FR 完全 cover が deterministic 判定可能 / FR 定義行数増 → 検証要求自動増加」]

#### FR-L6.4 (SHOULD) Step 3.45 escalation criteria

PoC で feasibility 不可と判明した場合の escalation:
- IMPL §5 で発見した assumption gap が 1 FR 範囲内 → IMPL 修正で完結
- gap が SPEC FR の根本前提を破壊 → ARC に escalate、SPEC 改訂候補 (Freeze 2 後も再 freeze 可)
- gap が cross-cutting (他 SPEC への波及) → CTO に escalate

#### FR-L6.5 (MUST) dogfooding

本 amend SPEC の IMPL.md §5 を **本 amend 自身の Step 3.45 first dogfood として実コード検証**。`framework feasibility-check lead-impl-workflow` (or 等価な手作業 grep) を実行、結果を CTO delta 監査 evidence として添付。

[検証済 observed: ARC が Explore agent で実コード調査 (本 session 04-27) 完了、113 console / 546 fs.* / 8 gh CLI / 38 内部固有名詞 hardcode の実数を取得。distribution/IMPL.md §5.1 の post-hoc update が本 dogfood と等価]

## §5 インターフェース

### CLI

```bash
framework init-feature <name>                          # SPEC + IMPL + VERIFY + OPS のスケルトン生成 (拡張)
framework gate impl [--feature=<name>]                  # Gate 2 単体実行 (新規)
framework impl validate <path>                          # IMPL.md フォーマット検証 (新規)
framework feasibility-check <feature> [--mode=plan-tool|grep]  # Step 3.45 PoC 検証 (FR-L6.2、新規)
framework gate poc --feature=<name>                     # Gate 3 単体実行 (FR-L6.3、新規)
```

### File 配置

```
docs/specs/<feature-name>/
  SPEC.md       # 要件 (architect 責任)
  IMPL.md       # 施工図 (lead 責任) ★本 SPEC の対象
  VERIFY.md     # 検証 (lead + tester 責任)
  OPS.md        # 運用 (lead + ops 責任)
```

### IMPL.md template (要約、詳細は templates/)

```markdown
# <Feature> IMPL (施工図)

> doc4l IMPL layer / 対応 SPEC: ./SPEC.md

## §1 アーキテクチャ概観
## §2 モジュール構造
## §3 実装順序 (サブPR 分解)
## §4 コードパターン
## §5 既存コードからの移行
## §6 サブPR 5-section template
## §7 Adapter / 契約の詳細
## §8 Phase 0 ブートストラップ (該当時)
## §9 Open decisions
## §10 lead 責任の明示
```

## §6 非機能要件

### §6.1 性能

- `framework gate impl` 実行時間 < 5s (deterministic grep + parse のみ) [推測 unverified: 計測必要]

### §6.2 可用性

- IMPL.md 不在で gate が誤って PASS する false negative は許容しない (CI 強制条件)
- IMPL.md 形式違反で gate が常時 BLOCK する false positive は WARNING にとどめ、L1 review で人間判断 [推測 unverified: 運用後に false positive rate 観測]

### §6.3 セキュリティ (STRIDE)

| 脅威 | 対策 |
|---|---|
| Spoofing | IMPL.md 改竄は git history で検証、`git log -p IMPL.md` で reviewer 追跡可 |
| Tampering | IMPL.md は repo 内、merge 経由のみ更新、protected branch 経由 |
| Repudiation | IMPL.md 更新は通常の PR review 4-layer chain |
| Information disclosure | IMPL.md は public repo (Stage B 後) で内部固有名詞 hardcode 禁止 [文献確認: distribution/SPEC FR-D3.1] |
| Denial of Service | gate impl は CI 5min timeout 内 |
| Elevation of privilege | gate impl は read-only、project workspace 内 |

## §7 受入基準 (Gherkin)

### AC-L1: Step 3.4 の組込み (FR-L1)

```gherkin
Given SSOT 一式が Freeze 2 完了
When framework が Step 3 → Step 3.5 への遷移を試行
Then 対象 feature の IMPL.md 存在を Gate 検証
And 不在の場合は Gate fail で Step 3.5 進行 block
```

### AC-L2: IMPL.md format validation (FR-L2.1, FR-L4.3)

```gherkin
Given 任意の IMPL.md ファイル
When `framework impl validate <path>` を実行
Then §1〜§10 の必須セクション存在を check
And 欠落セクションは WARNING として列挙
And evidence label が 0 件の場合は CRITICAL として BLOCK
```

### AC-L3: Gate 2 IMPL Presence (FR-L4.1, FR-L4.2)

```gherkin
Given PR が linked GitHub Issue を持ち、Issue body が "IMPL.md §X" を reference
When CI で Gate 2 が走る
Then referenced path が repo に存在することを検証
And 該当 section が non-empty (L0+ 文字数閾値) であることを検証
And いずれか不成立は CI FAILURE
```

### AC-L4: lead 責任の codify (FR-L3.1, FR-L3.2)

```gherkin
Given governance-flow.md の Role mapping
When 文書を読む
Then lead 責任に "IMPL doc authoring" が列挙されていること
And 05_IMPLEMENTATION.md に "Lead-side IMPL drafting" section が存在
```

### AC-L5: dogfooding (FR-L5.1, FR-L5.2)

```gherkin
Given v1.2.0 substep 4/5 (migrate-to-v1.2) の作業着手時
When lead が 5-section instruction を起票しようとする
Then IMPL.md (該当 substep 用) が事前に存在
And lead-pr-instruction skill 適用前に lead-impl-authoring skill が走った形跡 (audit log)
```

### AC-L6: 既存 PR 遡及不要 (FR-L5.3)

```gherkin
Given PR #104 (substep 3/5) が本 SPEC merge 時点で OPEN
When 本 SPEC が main に merge
Then PR #104 は IMPL Gate 2 適用対象外 (grandfathered)
And follow-up issue で post-hoc IMPL 起票
```

### AC-L7: Step 3.45 Feasibility PoC (FR-L6)

```gherkin
Given lead が feature の SPEC + IMPL を一通り author 完了
When `framework feasibility-check <feature>` を実行
Then IMPL.md §5 の [推測 unverified] ラベルが [検証済 observed] に置換される候補が生成される
And feasibility 不可 (実 API 不一致 / 実コード件数大幅乖離) 検出時は明確エラーで報告される
And silent fallback は発生しない
```

```gherkin
Given amend SPEC 例: distribution/IMPL.md §5.1 が「fs.* 〜15 箇所」と推定記載
When ARC が `framework feasibility-check distribution` を grep mode で実行
Then 実数 546 箇所が報告される
And 36 倍乖離が CRITICAL として表面化、IMPL 改訂を要求される
```

[文献確認: 本 amend dogfood (FR-L6.5) で実証済、distribution/IMPL §5.1 の post-hoc 修正 candidate が本 AC を実証]

### AC-L8: Gate 3 PoC Verified — per-FR traceability matrix (FR-L6.3)

```gherkin
Given feature SPEC.md に FR-X.1, FR-X.2, FR-X.3 の 3 件 FR が定義
And feature IMPL.md §5 で FR-X.1 と FR-X.2 のみ [検証済 observed] ラベル付き mention あり
When `framework gate poc --feature=X` を CI で実行
Then FR-X.3 の §5 mention に [検証済] 不在として BLOCK exit code 1
And error message に "FR-X.3: no [検証済] evidence in IMPL §5" を含む
```

```gherkin
Given feature SPEC.md の全 FR に対して IMPL.md §5 で [検証済] mention あり
When `framework gate poc --feature=<name>` を実行
Then exit 0、Gate 3 PASS
```

### AC-L9: framework feasibility-check CLI dual-mode (FR-L6.2)

```gherkin
Given Claude Code 環境で `framework feasibility-check <feature>` を実行 (mode 未指定)
When CLI が起動
Then default mode は plan-tool (LLMProvider adapter 経由)
And plan-tool 不在 (OSS install 環境等) 時は grep mode に明示的 fallback
And mode 切替は標準出力で明示通知 (silent fallback 禁止 [文献確認: memory `feedback_no_silent_fallback.md`])
```

## §8 前提・依存

- **依存 SSOT**:
  - `docs/specs/02_GENERATION_CHAIN.md` (Step 構造) [文献確認: 本セッションで read 済]
  - `docs/specs/04_FEATURE_SPEC.md` (Feature SSOT format)
  - `docs/specs/05_IMPLEMENTATION.md` (Implementation order)
  - `docs/specs/09_ENFORCEMENT.md` (Gate 機構)
  - `~/.claude/rules/governance-flow.md` (4-layer chain) [文献確認: 本セッション CLAUDE.md でロード]
  - doc4l v1.2.0 (Drive `gdrive:開発/ADF/v1.2.0_2026-04-20/specs/`) [文献確認: Issue #102]
- **依存 skill**:
  - `~/.claude/skills/lead-pr-instruction/` — 既存、5-section format を規定
  - `~/.claude/skills/lead-design-audit/` — 既存、spec→PR 変換時 audit
- **依存 PR / Issue**:
  - PR #104 substep 3/5 (Gate 0 / traceability-auditor) — 本 SPEC の AC-L6 grandfather 対象 [文献確認: https://github.com/watchout/ai-dev-framework/pull/104]
  - Issue #105 (bootstrap) — 本 SPEC 適用前の 5-section-only 起票事例、grandfather 対象
  - Phase 1 残 #65-#69 — 本 SPEC merge 後に IMPL workflow で起票
- **co-evolution 依存**:
  - distribution/SPEC.md (本 SPEC と同時並行) — 本 SPEC が dogfooded される対象 [文献確認: docs/specs/distribution/IMPL.md §10]

## §9 用語

| 用語 | 定義 |
|---|---|
| IMPL.md | 施工図 (construction drawing)。SPEC を実装可能なレベルに落とした blueprint |
| Step 3.4 | 本 SPEC で新設する Lead IMPL Authoring 工程 |
| Step 3.45 | 本 SPEC FR-L6 で新設する Feasibility PoC 工程 (実コード grep + smoke で feasibility 検証) |
| Gate 2 | 本 SPEC で新設する IMPL Presence enforcement gate |
| Gate 3 | 本 SPEC FR-L6.3 で新設する PoC Verified gate (per-FR traceability matrix) |
| feasibility-check | `framework feasibility-check <feature>` CLI、Step 3.45 の中核 mechanism (plan-tool / grep dual mode) |
| per-FR traceability matrix | 各 FR-*.* に対して IMPL.md §5 evidence 内に最低 1 件 `[検証済 observed]` を必須とする deterministic check 方式 |
| 施工図 | IMPL.md の和語訳。建築用語の借用、SPEC = 設計図、IMPL = 施工図 |
| Grandfather | 本 SPEC merge 時点で既に OPEN な PR は適用対象外 |

---

## §10 設計レビュー結果 — 抜けの確認

本 SPEC 完成前に以下を audit:

| audit 項目 | 状態 |
|---|---|
| 1 SSOT → IMPL → 5-section → dispatch の chain が closed-loop か | ✅ FR-L1〜L4 で chain 完結 |
| 2 lead 責任が role mapping に明示か | ✅ FR-L3.1 |
| 3 dev が IMPL を見る規範が存在するか | ✅ US-L2 + 5-section 内で IMPL §X reference 強制 (FR-L4.1) |
| 4 IMPL 不在の dispatch が機械的に block されるか | ✅ FR-L4.1 (Gate 2) |
| 5 IMPL format が deterministic に validate されるか | ✅ FR-L4.3, AC-L2 |
| 6 既存 OPEN PR が壊れないか | ✅ FR-L5.3 (grandfather) |
| 7 dogfooding 計画があるか | ✅ FR-L5.1 (v1.2.0 substep 4/5 から適用) |
| 8 ARC scope と分離されているか | ✅ §2 (SPEC = ARC、IMPL = lead) |
| 9 OSS 公開時に内部固有名詞混入しないか | ✅ §6.3 + distribution/SPEC FR-D3.1 整合 |
| 10 evidence label が enforce されているか | ✅ FR-L2.2 + skill-validator hook 既存 |
| 11 反復遵守を hook 強制しているか | ✅ FR-L4 (Gate 2) [文献確認: memory `feedback_self_enforcement_via_hook.md`] |
| 12 時刻概念に依存していないか | ✅ AC は全て条件 → 結果の関係、cadence なし [文献確認: memory `feedback_no_time_concept.md`] |

未解決 / open decision (CEO / CTO 確認候補):
- (a) Step 3.4 を「workflow step」と位置付けるか「Gate」と位置付けるか — 本 SPEC では両方 (Step 3.4 = workflow、Gate 2 = enforcement)
- (b) IMPL.md 必須セクションを framework 固定 vs project 拡張可能 — 本 SPEC では §1〜§10 を MUST 固定、追加 § は SHOULD

### §10.1 Sync 順序 (CTO BLOCK Gap C 反映、msg `fca4e7ee` 04-27)

`~/.claude/rules/governance-flow.md` 更新と本 SPEC の整合は **同 PR bundle** で達成する:

```
[Sub-PR 0.1] (1 PR で同時 merge)
  ├ docs/specs/04b_IMPL_FORMAT.md (新規、format 規範)
  └ ~/.claude/rules/governance-flow.md (改訂、Role mapping table の lead 行に「IMPL doc authoring」追加)
```

理由:
- governance-flow.md だけ先 merge → format 規範不在のまま IMPL 強制が始まる、dev bot 混乱
- 04b_IMPL_FORMAT.md だけ先 merge → governance-flow.md 旧 Role mapping のまま「IMPL は誰の責任か」不明、lead 役のいる project と不在の project で挙動分裂
- 同 PR bundle = window ゼロ、整合性保証

実装者 (adf-dev) への明示: **0.1 サブPR の Test fixtures に「両ファイルが同じ commit に含まれる」を merge gate として codify**。

[文献確認: lead-impl-workflow/IMPL.md §3 Phase 0 改訂版]

---

## Evidence label legend

- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
