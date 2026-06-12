# Lead IMPL Authoring Workflow IMPL (施工図)

> doc4l 4-layer / IMPL layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md (FR-L1〜FR-L5)
> 関連: VERIFY.md / OPS.md (同 directory)

本 IMPL は SPEC.md FR-L1〜FR-L5 の **施工図** であり、ADF framework に Step 3.4: Lead IMPL Authoring と Gate 2: IMPL Presence を組み込むための具体的なソースツリー・モジュール構造・実装順序・サブPR 分解を定義する。

---

## §1 アーキテクチャ概観

### §1.1 文書 / コード / 強制機構の 3 層

```
┌────────────────────────────────────────────────────┐
│ Documentation layer (人間 + LLM が読む)              │
│   docs/specs/02_GENERATION_CHAIN.md  ← Step 3.4 追記│
│   docs/specs/04_FEATURE_SPEC.md      ← IMPL 関係追記 │
│   docs/specs/04b_IMPL_FORMAT.md      ← NEW         │
│   docs/specs/05_IMPLEMENTATION.md    ← Lead IMPL § 追加│
│   docs/specs/09_ENFORCEMENT.md       ← Gate 2 § 追加 │
│   ~/.claude/rules/governance-flow.md ← Role mapping 更新│
│   templates/specs/IMPL.md.template   ← NEW         │
└────────────────────────────────────────────────────┘
                ↓ 規範を実装
┌────────────────────────────────────────────────────┐
│ Code layer (deterministic enforcement)              │
│   src/cli/lib/impl-validator.ts        ← NEW       │
│   src/cli/lib/impl-validator.test.ts   ← NEW       │
│   src/cli/commands/gate.ts             ← `gate impl` 追加│
│   src/cli/commands/impl.ts             ← NEW       │
│   src/cli/commands/init-feature.ts     ← IMPL 雛形 追加│
│   .github/workflows/gate-impl.yml      ← NEW       │
└────────────────────────────────────────────────────┘
                ↓ skill 整合
┌────────────────────────────────────────────────────┐
│ Skill layer (LLM bot 用)                             │
│   ~/.claude/skills/lead-impl-authoring/SKILL.md ← NEW│
│   ~/.claude/skills/lead-pr-instruction/SKILL.md ← 改訂│
└────────────────────────────────────────────────────┘
```

[文献確認: SPEC FR-L1〜FR-L4 各項に対応]

### §1.2 工程の流れ (改訂後)

```
Step 3 Technical (SSOT 完成、Freeze 2)
   │
   ▼
[Step 3.4 Lead IMPL Authoring]   ★ NEW
   │  lead-bot が SSOT を読み IMPL.md を作成
   │  - §1 〜 §10 必須セクション (FR-L2.1)
   │  - Open decisions 明示
   │  - evidence label 必須
   │
   ▼ Gate (IMPL.md 存在 + lead 承認 + format validate)
   │
   ▼
Step 3.5 Planning (Wave 分類、GitHub Issues 起票)
   │  各 Issue は IMPL.md §X を reference して 5-section instruction を抽出
   │
   ▼ Gate 2 (IMPL Presence、CI 強制)
   │
   ▼
Step 4 Dev Start (5-section instruction に従って実装)
```

---

## §2 モジュール構造 (新規 / 変更ファイル一覧)

### §2.1 Documentation layer

| 種別 | パス | 変更概要 |
|---|---|---|
| 既存改訂 | `docs/specs/02_GENERATION_CHAIN.md` | Step 3.4 を新規 section、Gate Conditions に "Step 3.4 → 3.5" 追加 |
| 既存改訂 | `docs/specs/04_FEATURE_SPEC.md` | 末尾に "Output → IMPL.md" 言及追加 |
| 新規 | `docs/specs/04b_IMPL_FORMAT.md` | IMPL.md format 定義 (FR-L2.1 必須セクション + evidence label 規約) |
| 既存改訂 | `docs/specs/05_IMPLEMENTATION.md` | "Lead-side IMPL drafting" section 新規 |
| 既存改訂 | `docs/specs/09_ENFORCEMENT.md` | "Gate 2: IMPL Presence" section 新規 (FR-L4) |
| 新規 | `templates/specs/IMPL.md.template` | `framework init-feature` 出力テンプレート |
| 既存改訂 | `~/.claude/rules/governance-flow.md` | Role mapping table の lead 行に "IMPL doc authoring" 追加 |

### §2.2 Code layer

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `src/cli/lib/impl-validator.ts` | IMPL.md format validator (deterministic) |
| 新規 | `src/cli/lib/impl-validator.test.ts` | unit test |
| 既存改訂 | `src/cli/commands/gate.ts` | `framework gate impl [--feature=<name>]` サブコマンド追加 |
| 新規 | `src/cli/commands/impl.ts` | `framework impl validate <path>` コマンド |
| 既存改訂 | `src/cli/commands/init-feature.ts` | IMPL.md.template の emit を追加 |
| 既存改訂 | `src/cli/lib/gate-check-engine.ts` | Gate 2 chain への組込 |
| 新規 | `.github/workflows/gate-impl.yml` | CI Gate 2 |

### §2.3 Skill layer

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `~/.claude/skills/lead-impl-authoring/SKILL.md` | lead-bot 用 skill、IMPL 作成の手順 |
| 既存改訂 | `~/.claude/skills/lead-pr-instruction/SKILL.md` | 前段に lead-impl-authoring 必須を明記、5-section instruction の各 section が IMPL.md §X を reference する pattern を追加 |

[推測 unverified: skill-authoring skill (`~/.claude/skills/skill-authoring/`) を applying して SKILL.md を author、validation 15 項目通過必須]

---

## §3 実装順序 (サブPR 分解)

> CTO BLOCK Gap C 反映 (msg `fca4e7ee` 04-27): governance-flow.md sync を Phase 0.1 と **同 PR bundle** に変更。dev bot 挙動不整合 risk を排除する。

```
[Phase 0] 文書化のみ (低リスク、CI 影響なし)
  Sub-PR 0.1: 04b_IMPL_FORMAT.md 新規 + governance-flow.md (~/.claude/rules/) 改訂
              (★ 同 PR bundle、CTO Gap C 反映: format 規範と Role mapping 更新を同期)
  Sub-PR 0.2: 02_GENERATION_CHAIN.md (Step 3.45 + Gate 3 追加) / 04_FEATURE_SPEC.md / 05_IMPLEMENTATION.md / 09_ENFORCEMENT.md 改訂
              (Sub-PR 0.1 merge 後、format への参照を core spec に組込)
              (★ Step 3.45 + Gate 3 の文書化 = FR-L6 反映、CTO amend GO msg `038a5662`)
  Sub-PR 0.3: templates/specs/IMPL.md.template 新規 (旧 0.4 を繰上げ)
  Sub-PR 0.4: 04c_FEASIBILITY_POC_FORMAT.md 新規 (Step 3.45 evidence label 規約 + per-FR traceability matrix 仕様)
              (★ FR-L6 文書化、Sub-PR 0.2 と並行可)

[Phase 1] Code validator (deterministic)
  Sub-PR 1.1: src/cli/lib/impl-validator.ts + test 新規
  Sub-PR 1.2: src/cli/commands/impl.ts (`framework impl validate`) 新規
  Sub-PR 1.3: src/cli/commands/gate.ts に `gate impl` サブコマンド追加 + test
  Sub-PR 1.4: src/cli/commands/init-feature.ts に IMPL 雛形生成追加 + test
  Sub-PR 1.5: src/cli/lib/feasibility-engine.ts + test 新規 (FR-L6.2 中核 logic)
              - plan-tool mode (LLMProvider adapter 経由)
              - grep mode (default、外部依存なし、fs.readFileSync + regex 集計)
              - mode 切替は明示的、silent fallback 禁止
  Sub-PR 1.6: src/cli/commands/feasibility-check.ts (`framework feasibility-check <feature>`) 新規 + test (FR-L6.2)
  Sub-PR 1.7: src/cli/lib/gate-poc.ts + test 新規 (FR-L6.3 per-FR traceability matrix)
              - feature SPEC.md から FR-*.* 列挙 (regex)
              - 各 FR の IMPL.md §5 mention で [検証済] 存在 grep
              - 0 件 FR 1 つでも fail
  Sub-PR 1.8: src/cli/commands/gate.ts に `gate poc --feature=<name>` サブコマンド追加 + test (FR-L6.3)

[Phase 2] CI 強制 (Gate 2 + Gate 3 + session-level hook)
  Sub-PR 2.1: .github/workflows/gate-impl.yml 新規 (Gate 2)
  Sub-PR 2.2: gate-check-engine.ts に Gate 2 を chain に追加
  Sub-PR 2.3: branch protection rules を更新 (Gate 2 を required check) — repo settings 変更 = manual / route:ceo-approval
  Sub-PR 2.4: .github/workflows/gate-poc.yml 新規 (Gate 3、FR-L6.3) — feature 分岐 PR で trigger
  Sub-PR 2.5: gate-check-engine.ts に Gate 3 を chain に追加 (Gate 2 と独立、並列実行可)
  Sub-PR 2.6: branch protection で Gate 3 を required check に追加 — route:ceo-approval (Gate 2 と同 PR か別 PR は implementer 判断)
  Sub-PR 2.7: ★ split 2026-05-07 (ARC verdict、PR #123 Finding 3a) — 2 つの直交する hook に分割

  Sub-PR 2.7.1: IMPL-presence hook — IMPL.md 不在の状態で 5-section instruction (skill `lead-pr-instruction`) を発火しようとした瞬間に block
              [文献確認: memory `feedback_self_enforcement_via_hook.md` (反復遵守は hook で強制、LLM 意志に頼ると skip する) + `feedback_script_control_principle.md` (行動制約はコードで強制)]
              - hook script 配置: `~/.claude/hooks/lead-impl-presence-check.sh`
              - 発火条件: skill `lead-pr-instruction` 起動直前 (PreToolUse hook)
              - 検出方法: skill 発火直前に対象 feature directory を scan、IMPL.md 不在 + Step 3.45 evidence 不在で exit 2 (block) + 明確エラー出力
              - 関連既存 issue: #68 pre-tool-call gateway (AEGIS-style interceptor) と path 共有候補、本 sub-PR は単発 hook で先行実装可

  Sub-PR 2.7.2: Pre-impl gate LGTM hook — auditor LGTM 履歴不在の状態で 5-section instruction を dispatch しようとした瞬間に block (PR #123 で実装中)
              [文献確認: CEO directive `bc79b603` (#dev-arc 2026-05-02)]
              - hook script 配置: `.claude/scripts/lead-pre-impl-gate-check/dispatch.sh`
              - 発火条件: 5-section dispatch 直前
              - 検出方法: 対象 5-section instruction に対する auditor LGTM 履歴を check、不在で exit 2 + 明確エラー出力
              - PR #123 が本 sub-PR として land、Finding 1/2/3b 修正後 cycle 2 で merge

  両者は直交する責務 (IMPL doc 強制 vs Pre-impl gate 強制)、layered protection として並行運用。

[Phase 3] Skill layer
  Sub-PR 3.1: ~/.claude/skills/lead-impl-authoring/SKILL.md 新規
  Sub-PR 3.2: ~/.claude/skills/lead-pr-instruction/SKILL.md 改訂

[Phase 4] dogfooding 適用
  (PR ではない) v1.2.0 substep 4/5 (migrate-to-v1.2) 着手時に本 workflow 適用
  (PR ではない) ADF distribution Phase 1+ も本 workflow に整合確認
```

### 依存グラフ

```
Phase 0 (文書化)
   ↓ 規範 fix
Phase 1 (validator code) — Phase 0 を文書 source として参照
   ↓ validator 利用可能
Phase 2 (CI 強制)
   ↓ 強制発動
Phase 3 (skill 整合) — 並行可、Phase 2 完了前に skill 公開しても害なし
   ↓ ↓
Phase 4 (適用)
```

[推測 unverified: Phase 0 だけで先行 merge し、Phase 1 着手時点で文書ベースで dev に作業させても workflow が運用始められる、validator は後追い導入で OK]

---

## §4 コードパターン

### §4.1 IMPL.md validator (`src/cli/lib/impl-validator.ts`)

```typescript
// 必須セクション定義 (FR-L2.1 から)
const REQUIRED_SECTIONS = [
  /^## §1 アーキテクチャ概観/m,
  /^## §2 モジュール構造/m,
  /^## §3 実装順序/m,
  /^## §4 コードパターン/m,
  /^## §5 既存コードからの移行/m,
  /^## §6 サブPR/m,         // 5-section template
  /^## §7 .*契約/m,           // Adapter / 契約の詳細
  /^## §8 Phase 0/m,          // bootstrap (該当時、optional)
  /^## §9 Open decisions/m,
  /^## §10 lead 責任/m,
];

// evidence label patterns
const EVIDENCE_LABEL_RE = /\[(?:検証済 observed|文献確認 referenced|推測 unverified|observed|referenced|unverified|hypothesis|propose)[^\]]*\]/g;

export interface ImplValidationResult {
  status: "PASS" | "WARNING" | "BLOCK";
  missingSections: string[];     // §X 名
  evidenceLabelCount: number;
  errors: ImplFinding[];
  warnings: ImplFinding[];
}

export interface ImplFinding {
  type: "missing_section" | "no_evidence_label" | "empty_section" | "format";
  message: string;
  line?: number;
}

export function validateImpl(path: string): ImplValidationResult {
  const content = fs.readFileSync(path, "utf-8");
  const missing: string[] = [];
  for (const re of REQUIRED_SECTIONS) {
    if (!re.test(content)) {
      const sectionName = re.source.match(/§\d+ [^\\]+/)?.[0] ?? re.source;
      missing.push(sectionName);
    }
  }
  const evidenceCount = (content.match(EVIDENCE_LABEL_RE) ?? []).length;
  // CRITICAL: evidence label 0 件
  // WARNING: 必須セクション欠落 (§8 は optional 例外)
  // ...
  return {
    status: evidenceCount === 0 ? "BLOCK" : missing.length > 0 ? "WARNING" : "PASS",
    missingSections: missing,
    evidenceLabelCount: evidenceCount,
    errors: evidenceCount === 0 ? [{ type: "no_evidence_label", message: "evidence label が 0 件" }] : [],
    warnings: missing.map(m => ({ type: "missing_section", message: `必須セクション欠落: ${m}` })),
  };
}
```

[文献確認: 既存 `gate-spec-validator.ts` (PR #104) と同じ構造を踏襲、deterministic validation の原則 #92 に準拠]

### §4.2 Gate 2 CI workflow (`.github/workflows/gate-impl.yml`)

```yaml
name: "Gate 2: IMPL Presence"
on:
  pull_request:
    branches: [main]

jobs:
  gate-impl:
    name: Gate 2 — IMPL Presence
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Resolve linked Issue and IMPL reference
        id: resolve
        run: |
          # PR description / linked issue body から "IMPL.md §X" reference を抽出
          # gh CLI で linked issue を取得、body を grep
          # 結果を $GITHUB_OUTPUT に保存 (impl_path, section_anchor)
          ...
        env:
          GH_TOKEN: ${{ github.token }}
      - name: Validate IMPL exists and section non-empty
        run: |
          # impl_path が存在すること
          # 該当 section が L0+ 文字数閾値以上であること
          npx tsx src/cli/index.ts gate impl --pr-number ${{ github.event.pull_request.number }}
      - name: Gate 2 summary
        run: echo "Gate 2 (IMPL Presence) — PASSED"
```

[推測 unverified: linked issue 抽出は `gh pr view --json closingIssuesReferences` で取得、CI 環境で動作確認必要]

### §4.2b feasibility-check engine (`src/cli/lib/feasibility-engine.ts`) — FR-L6.2

```typescript
// Step 3.45 PoC 検証 logic、dual-mode で plan-tool / grep を切替
export type FeasibilityMode = "plan-tool" | "grep";

export interface FeasibilityResult {
  mode: FeasibilityMode;
  feature: string;
  evidenceUpdates: EvidenceCandidate[];   // [推測] → [検証済] 候補
  divergences: Divergence[];              // 推定値 vs 実数の乖離検出
  status: "PASS" | "WARNING" | "BLOCK";
}

export interface EvidenceCandidate {
  implPath: string;
  lineNumber: number;
  before: string;        // 旧 [推測 unverified: ...]
  after: string;         // 新 [検証済 observed: <実数>]
  source: "grep" | "plan-tool";
}

export interface Divergence {
  metric: string;        // 例: "fs.readFileSync count"
  estimated: number | string;
  actual: number | string;
  ratio?: number;        // estimated / actual
  severity: "INFO" | "WARNING" | "CRITICAL";  // 10x 以上は CRITICAL
}

export async function runFeasibilityCheck(
  feature: string,
  opts: { mode?: FeasibilityMode; repoRoot: string },
): Promise<FeasibilityResult> {
  const mode = opts.mode ?? detectMode();
  // mode 切替を明示通知 (silent fallback 禁止)
  logger.info(`feasibility-check mode: ${mode}`);

  if (mode === "plan-tool") {
    // LLMProvider adapter 経由で /plan tool を起動 (distribution/SPEC FR-D2 整合)
    return await runPlanToolMode(feature, opts.repoRoot);
  } else {
    // grep mode: 外部依存なし、static analysis のみ
    return await runGrepMode(feature, opts.repoRoot);
  }
}

function detectMode(): FeasibilityMode {
  // Claude Code 環境検出: env CLAUDECODE 等を check (PoC、production は明示 flag)
  // 不明時は grep mode (default、OSS 互換)
  return process.env.CLAUDECODE ? "plan-tool" : "grep";
}

// grep mode: feature の SPEC.md / IMPL.md を読み、§5 内 [推測] パターンの近接 grep を実コード対象で実行
async function runGrepMode(feature: string, repoRoot: string): Promise<FeasibilityResult> {
  // 1. docs/specs/<feature>/IMPL.md §5 から「fs.readFileSync」「console.log」等の grep target 抽出
  // 2. src/ + templates/ で対応 grep を実行、件数取得
  // 3. IMPL §5 の推定値と比較、divergence ratio 計算
  // 4. divergence ≥ 10x → CRITICAL、IMPL.md update candidate を生成
  // (詳細実装は Phase 1.5 で adf-dev に dispatch)
}
```

設計原則:
- **dual-mode は明示切替**、mode 自動 fallback 時は標準出力に明示通知 [文献確認: memory `feedback_no_silent_fallback.md`]
- **grep mode で OSS 互換**、Claude Code 不在環境でも degraded で機能
- **plan-tool mode は LLMProvider adapter 経由**、distribution/SPEC.md FR-D2 と整合

[文献確認: 本 amend dogfood で Explore agent が grep mode 等価機能を実コード対象に実行、113 console / 546 fs.* / 8 gh CLI / 38 内部固有名詞 を取得済 [検証済 observed: 04-27 session で Explore Agent run]]

### §4.2c Gate 3 per-FR traceability matrix (`src/cli/lib/gate-poc.ts`) — FR-L6.3

```typescript
// 各 FR-*.* に対して IMPL.md §5 evidence 内の [検証済] 存在を grep
const FR_PATTERN = /^\*\*FR-[A-Z]+-?\d+\.\d+/m;
const VERIFIED_LABEL = /\[検証済 observed[^\]]*\]/;

export interface GatePocResult {
  feature: string;
  totalFrs: number;
  uncoveredFrs: string[];      // §5 evidence 不在の FR
  status: "PASS" | "BLOCK";
}

export function runGatePoc(feature: string, repoRoot: string): GatePocResult {
  const specPath = `${repoRoot}/docs/specs/${feature}/SPEC.md`;
  const implPath = `${repoRoot}/docs/specs/${feature}/IMPL.md`;
  const spec = fs.readFileSync(specPath, "utf-8");
  const impl = fs.readFileSync(implPath, "utf-8");

  // 1. SPEC から FR-*.* 全列挙
  const frIds = [...spec.matchAll(/\*\*(FR-[A-Z]+-?\d+\.\d+)/gm)].map(m => m[1]);
  const unique = Array.from(new Set(frIds));

  // 2. IMPL §5 抽出
  const section5 = extractSection(impl, "§5");

  // 3. 各 FR が §5 内で言及されかつ近接 (5 行 window) に [検証済] あるか
  const uncovered: string[] = [];
  for (const fr of unique) {
    const lines = section5.split("\n");
    const idx = lines.findIndex(l => l.includes(fr));
    if (idx === -1) {
      uncovered.push(fr);
      continue;
    }
    const window = lines.slice(Math.max(0, idx - 5), idx + 6).join("\n");
    if (!VERIFIED_LABEL.test(window)) uncovered.push(fr);
  }

  return {
    feature,
    totalFrs: unique.length,
    uncoveredFrs: uncovered,
    status: uncovered.length === 0 ? "PASS" : "BLOCK",
  };
}
```

設計原則:
- **deterministic**: regex のみ、LLM 判断なし [文献確認: 09_ENFORCEMENT.md 原則 0]
- **count manipulation 不可**: ARC 当初 ratio 案 (`件数 ≥ 5`) は CTO により fragile として却下、per-FR で必須化 [文献確認: CTO 設計判断 msg `038a5662`]
- **FR 増加 → 検証要求自動増加**: SPEC を厚く書くほど Gate 3 cost 増加、scope discipline へ pressure

### §4.3 IMPL.md template (`templates/specs/IMPL.md.template`)

```markdown
# {{FEATURE_NAME}} IMPL (施工図)

> doc4l 4-layer / IMPL layer
> 作成: {{LEAD_BOT}}
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md
> 関連: VERIFY.md / OPS.md (同 directory)

## §1 アーキテクチャ概観
<!-- レイヤ構造 / プロセス境界 / data flow を記述 -->

## §2 モジュール構造
<!-- 新規 / 変更ファイルツリー -->

## §3 実装順序 (サブPR 分解)
<!-- Phase / Sub-PR 番号 / 依存グラフ -->

## §4 コードパターン
<!-- TypeScript interface / class / pattern の具体例 -->

## §5 既存コードからの移行
<!-- 影響範囲 grep / 後方互換戦略 -->

## §6 サブPR 5-section template (継承共通項)
<!-- 全 sub-PR が継承する Forbidden / Test fixtures -->

## §7 Adapter / 契約の詳細
<!-- 必要な場合のみ。なければ "N/A: 本 feature は外部 adapter なし" と理由付きで記載 -->

## §8 Phase 0: bootstrap PR の施工図
<!-- 該当時のみ、なければ "N/A: bootstrap 不要" -->

## §9 Open decisions (implementer 自由)

## §10 lead 責任の明示

---

## Evidence label legend
- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
```

---

## §5 既存コードからの移行

### §5.1 既存 IMPL の retrofit

[文献確認: 本 SPEC FR-L5.3 で grandfather が決定]

| 既存 artifact | 状態 | 移行 |
|---|---|---|
| `docs/specs/distribution/SPEC.md` (本セッション作成) | IMPL.md は存在 (§9 まで埋まっているが §10 未明示) | follow-up で §10 補完 |
| `docs/specs/distribution/IMPL.md` (本セッション作成) | §1〜§10 構造済 | retrofit 不要、template に逆転写候補 |
| `docs/specs/lead-impl-workflow/IMPL.md` (本ファイル) | dogfooding | 自己参照、retrofit 不要 |
| `docs/specs/v1.2.0_*/SPEC.md` (Drive) | feature 単位の SPEC のみ、IMPL は別 | grandfather、merge 後 follow-up |

### §5.2 既存 OPEN PR の遡及不要

| PR | 状態 | 措置 |
|---|---|---|
| #104 substep 3/5 | OPEN、Gate B FAILURE blocked | grandfather、Issue #105 merge 後に Gate B 解消、Gate 2 適用なし |
| #91 substep 2 (read-receipt) | OPEN、on-hold | grandfather、解除可否別判断 |
| Issue #105 (bootstrap) | 起票済、5-section only | grandfather、本 IMPL §8 に inline 施工図あり |

[文献確認: SPEC AC-L6 grandfather]

### §5.3 既存 closed PR への遡及

不要。merge 済 PR は audit log で trace 可、retrofit 不要。

---

## §6 サブPR ごとの 5-section instruction 共通項

### §6.1 全 PR 共通 Forbidden

- ❌ scope 外の既存ファイルを touch しない (1 PR 1 concern)
- ❌ 既存 Gate (A/B/C/0/1) 挙動を変更しない (本 SPEC は Gate 2 を新設、既存 Gate には触れない)
- ❌ LLM-judgment ベースの validation を導入しない (deterministic 原則 0 違反)
- ❌ skip / no-verify / bypass を新規追加しない
- ❌ 削除コメントや backwards-compat shim を残さない

### §6.2 全 PR 共通 Test fixtures

- 文書 PR (Phase 0): `npm run framework -- spec validate docs/specs/lead-impl-workflow/SPEC.md` (or 同等) PASS
- code PR (Phase 1+): `npm test` 全 PASS、`tsc --noEmit` clean、新規 test ≥ 1
- CI workflow PR (Phase 2): GitHub Actions syntax validate + dry-run 確認
- skill PR (Phase 3): skill-authoring 15-item validation PASS

### §6.3 各 sub-PR の `route:` label

| Phase | route: | 理由 |
|---|---|---|
| 0.1〜0.4 | fast-merge | 文書のみ、既存挙動不変 |
| 1.1〜1.4 | fast-merge | 新規追加、既存挙動不変 |
| 2.1〜2.2 | fast-merge | CI 追加、既存 Gate には触れない |
| 2.3 | **ceo-approval** | branch protection settings 変更 = governance change |
| 3.1 | fast-merge | 新規 skill |
| 3.2 | fast-merge | 既存 skill 改訂、behavior は厳格化方向 |

[文献確認: governance-flow.md route 判定]

---

## §7 Adapter / 契約の詳細

本 SPEC は外部 adapter を導入しない。Notifier / StateStore / TaskTracker の整合は distribution/IMPL.md §1.1 で扱う、本 SPEC は impl-validator の単独 logic のみ。

[文献確認: distribution/IMPL.md §1.1 のレイヤ構造]

---

## §8 Phase 0: bootstrap (本 IMPL は該当なし)

本 IMPL は code adapter を introduce しないため、bootstrap PR は不要。Phase 0 から直接 Phase 0.1 (文書化) で着手可。

---

## §9 Open decisions (implementer 自由)

各サブPR で implementer 判断 OK の項目:
- private helper 関数の命名 / 内部構造
- vitest test の describe / it 階層
- commit message phrasing (Conventional commits 必須)
- branch 名 (例: `feat/impl-validator-phase1-1`)
- IMPL.md template の文言詳細 (§ header は固定、内部例文は自由)
- gate-impl.yml の job name / step name
- impl-validator の error message 文言

ここに列挙されていないものは **暗黙凍結**。判断に迷ったら本 IMPL にコメント or lead (ARC interim) に escalate。

---

## §10 lead 責任の明示

本 IMPL の作成・維持は lead (現時点で ARC interim) の責任 [文献確認: SPEC FR-L3.1 で governance-flow.md に追記予定の項]:

- SPEC.md / IMPL.md / VERIFY.md / OPS.md の 4 ファイルセットを co-evolution 維持
- 各サブPR の 5-section instruction を本 IMPL から抽出して GitHub Issue に転記
- adf-dev からの open decisions 範囲外の escalation を受け、本 IMPL を更新
- 本 IMPL の更新 PR は ARC + CTO の連名 review

---

## §11 設計レビュー結果 — 抜けの確認

| audit 項目 | 状態 |
|---|---|
| 1 文書 / コード / 強制 / skill の 4 layer 全てに変更がカバーされているか | ✅ §1.1 で図示、§2 で全リスト |
| 2 sub-PR が 1 concern 1 PR か | ✅ §3 で Phase 単位細分化 |
| 3 既存 Gate との整合 | ✅ §6.1 既存 Gate 不変、Gate 2 のみ新設 |
| 4 dogfooding 計画 | ✅ §3 Phase 4 + SPEC FR-L5 |
| 5 grandfather 戦略 | ✅ §5.2 |
| 6 evidence label が IMPL 内に多数存在 | ✅ 本 IMPL 内 [検証済] [文献確認] [推測] 多数 |
| 7 hook / CI 強制が deterministic か | ✅ §4.1 (regex) §4.2 (gh CLI + node script) |
| 8 内部固有名詞混入なし | ✅ ADF 自身が internal-agnostic、本 SPEC/IMPL も同 |
| 9 時刻概念に依存していないか | ✅ Phase 番号と依存関係のみ、時刻ベースなし |
| 10 LLM 判断ループが残っていないか | ✅ Step 3.4 (lead 作成) は LLM 業務だが Gate 2 (CI 検証) は deterministic |

---

## Evidence label legend

- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
