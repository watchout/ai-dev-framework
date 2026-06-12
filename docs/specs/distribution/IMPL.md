# ADF 配布 IMPL (施工図)

> doc4l 4-layer doc / IMPL layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md (FR-D1〜FR-D5)
> 関連: VERIFY.md / OPS.md (同 directory)

本 IMPL は ADF 配布のための **施工図** であり、ADF core / Internal config layer / dogfooding 整備の具体的なソースツリー・モジュール構造・実装順序・サブPR 分解を定義する。dev-bot (adf-dev) が本 IMPL を参照して 5-section instruction (各 GitHub Issue) を実装する。

---

## §1 アーキテクチャ概観

### §1.1 レイヤ構造

```
┌────────────────────────────────────────────────┐
│ Application layer (project の bot / dev)        │
│ ↓ uses                                          │
│ Internal config layer (@iyasaka/adf-internal-config) │
│   - notifier-adapter (agent-comms-mcp 実装)      │
│   - state-store-adapter (agent-memory 実装)      │
│   - task-tracker-adapter (GitHub Issues 実装)    │
│ ↓ implements interfaces from                    │
│ ADF core (@watchout/adf)                        │
│   - core/adapters/types.ts (Notifier, StateStore, TaskTracker, LLMProvider)│
│   - core/adapter-loader.ts (config.json から動的 load)│
│   - core/cli/* (init / gate / trace / spec / migrate)│
│   - core/lib/* (engine、validator、auditor)       │
└────────────────────────────────────────────────┘
```

**設計原則** [文献確認: SPEC §1, FR-D2.1, FR-D3.1]:
- ADF core は `@iyasaka/*` を一切 import しない
- ADF core は `agent-comms-mcp` / `agent-memory` の API 名 / channel ID 等の固有名詞を持たない
- 連携は `Notifier` / `StateStore` / `TaskTracker` interface 経由

### §1.2 プロセス境界

```
┌──────────┐   ┌────────────┐   ┌────────────────┐
│ adf CLI  │ → │ adapter    │ → │ external infra │
│ (in repo)│   │ (loaded at │   │ (agent-comms,  │
│          │   │  runtime)  │   │  agent-memory) │
└──────────┘   └────────────┘   └────────────────┘
              ↑ interface 経由のみ
              ↓ adapter 不在時 → no-op default
```

[推測 unverified: adapter loader の dynamic require は npm 公開後に install path 解決を smoke で確認必要]

---

## §2 モジュール構造

### §2.1 ADF core (`watchout/ai-dev-framework`) のソースツリー

新設・変更が必要なファイルを **★** で示す。

```
src/
  cli/
    adapters/                    ★ NEW directory
      types.ts                   ★ NEW (Notifier / StateStore / TaskTracker interface)
      defaults.ts                ★ NEW (no-op / console / file-based default 実装)
      loader.ts                  ★ NEW (config.json から adapter 解決)
      loader.test.ts             ★ NEW
    commands/
      init.ts                    変更 (.framework/config.json の adapters field を生成)
      gate.ts                    変更 (notifier 経由の通知に切替)
      ...                        (他既存維持)
    lib/
      llm-provider.ts            既存維持 (PR #52、Adapter pattern 適用済) [文献確認: adf-dev-state.md §改修D]
      profile-model.ts           既存維持
      ...
templates/
  framework/
    config.json.template         ★ NEW (adapters の default 設定)
docs/
  specs/
    distribution/                ★ 本ディレクトリ
      SPEC.md / IMPL.md / VERIFY.md / OPS.md
.framework/
  project.json                   ★ NEW (Issue #105 で着手中、§8 参照)
.github/
  workflows/
    oss-readiness.yml            ★ NEW (FR-D3.3 implementation)
```

### §2.2 Internal config layer (`@iyasaka/adf-internal-config`) のソースツリー

**配置候補** [推測 unverified、CTO 判断要]:
- (a) iyasaka 組織下に新規 monorepo `iyasaka-adf-internal-config` を作成
- (b) 既存 `agent-comms-mcp` / `agent-memory` リポジトリ内に sub-package として配置
- (c) iyasaka project 本体に同梱

推奨: **(a)** 単独 repo。理由: agent-comms-mcp / agent-memory のいずれか一方の改版で adapter のみ変更したいケースで、二者へ依存させると lock 連鎖が発生する。

```
iyasaka-adf-internal-config/
  src/
    notifier/
      agent-comms-adapter.ts     # @watchout/adf の Notifier interface を実装
      agent-comms-adapter.test.ts
    state-store/
      agent-memory-adapter.ts    # StateStore interface を実装
      agent-memory-adapter.test.ts
    task-tracker/
      github-issues-adapter.ts   # 既存 GitHub Issues を thin wrap (default としても流用)
  package.json                    # peerDependencies: @watchout/adf
  tsconfig.json
```

[文献確認: adapter import path は `@iyasaka/adf-internal-config/notifier` 等、SPEC §5 Adapter API で例示]

### §2.3 dogfooding 配置

ADF リポジトリ自身に以下を配置:
- `.framework/project.json` (Issue #105、profileType=cli)
- `.framework/config.json` (adapters 全て default = no-op / console / github-issues、internal layer は ADF 自身は不要)
- `docs/spec/` 配下に SPEC.md (ADF v1.2.0 doc4l に準拠した spec を 1 件以上)、Gate 0 が validate

[検証済 observed: 現状 ADF 自身の Gate B が `.framework/project.json not found` で FAILURE、PR #104 run 24700587063]

---

## §3 実装順序 (サブPR 分解、1 PR 1 concern)

### 段階 (sequence)

```
[Phase 0] dogfooding 解消
  Issue #105: .framework/project.json bootstrap (route:fast-merge)
    └→ Gate B PASS、PR #104 含む全 PR が unblock

[Phase 1] Adapter interface 抽出 (ADF core の前提整備)
  Sub-PR 1.1: src/cli/adapters/types.ts 新設 (Notifier / StateStore / TaskTracker interface のみ、実装なし)
  Sub-PR 1.2: src/cli/adapters/defaults.ts 新設 (no-op / console / file-based / github-issues default)
  Sub-PR 1.3: src/cli/adapters/loader.ts 新設 + .framework/config.json schema 拡張

[Phase 2] 既存 core を adapter 経由に書き換え
  Sub-PR 2.1: gate.ts 内の通知を Notifier 経由に refactor (behavior 不変、interface 切替のみ)
  Sub-PR 2.2: state 永続化箇所を StateStore 経由に refactor
  Sub-PR 2.3: GitHub Issue 操作箇所を TaskTracker 経由に refactor

[Phase 3] OSS readiness
  Sub-PR 3.1: scripts/check-oss-readiness.sh 新設 (内部固有名詞 grep)
  Sub-PR 3.2: .github/workflows/oss-readiness.yml 新設 (CI 統合)
  Sub-PR 3.3: 既存 source の固有名詞 hardcode を grep で洗出して削除 / config 化

[Phase 4] Internal config layer 公開
  Sub-PR 4.1: iyasaka-adf-internal-config repo init (package skeleton + peerDependencies 宣言)
  Sub-PR 4.2: notifier-adapter (agent-comms-mcp 経由) 実装 + test
  Sub-PR 4.3: state-store-adapter (agent-memory 経由) 実装 + test
  Sub-PR 4.4: 内部各 project (iyasaka / hotel-kanri / haishin-puls-hub / wbs etc.) で install + smoke

[Phase 5] Stage A 完了 (内部全 bot 展開)
  Issue (PR ではない): 各 project の `.framework/config.json` に internal adapter 設定を追加 (rollout)
```

### 各 PR の依存

```
Phase 0 (#105)
  ↓
Phase 1.1 → 1.2 → 1.3
                     ↓
Phase 2.1 / 2.2 / 2.3 (並行可、ただし interface 確定後)
                     ↓
Phase 3.1 → 3.2 → 3.3
                     ↓
Phase 4.1 → 4.2 / 4.3 (並行可)
                     ↓
Phase 4.4 → Phase 5
```

[推測 unverified: Phase 2 の refactor は behavior 不変のため retrofit-engine.test.ts / verify-engine.test.ts 等の既存テストが green 維持を smoke で確認必要]

---

## §4 コードパターン

### §4.1 Adapter interface (`src/cli/adapters/types.ts`) — CTO BLOCK Gap A 反映

旧設計 (`notify(channel, message, opts)`) は agent-comms-mcp `send` (reply_to 必須) と impedance mismatch のため **廃案**。新設計は **destination の discriminated union** で reply / channel / default を統一表現する:

```typescript
export type NotifyDestination =
  | { type: "reply"; reply_to: string }      // agent-comms-mcp send 互換
  | { type: "channel"; channel: string; thread_id?: string }  // agent-comms-mcp notify 互換
  | { type: "default" };                     // adapter 自身が判断 (許可しない adapter は throw)

export interface NotifyOptions {
  destination: NotifyDestination;
  mentions?: string[];
  message_type?: "chat" | "instruction" | "report" | "approval" | "emergency";
  metadata?: Record<string, unknown>;
}

export interface Notifier {
  notify(message: string, opts: NotifyOptions): Promise<void>;
}

// StateStore — KV state 永続化
export interface StateStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

// TaskTracker — タスク状態
export interface Task {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  labels?: string[];
}
export interface TaskFilter {
  status?: Task["status"];
  label?: string;
}
export interface TaskTracker {
  getActiveTask(): Promise<Task | null>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  listTasks(filter: TaskFilter): Promise<Task[]>;
}
```

[文献確認: PoC 実装 + smoke `proposals/distribution-poc/src/types.ts` + `agent-comms-notifier.ts`、test 7/7 PASS [検証済 observed: 04-27 PoC test run、destination 全 mode + mentions empty + metadata forward]]

### §4.2 Adapter loader (`src/cli/adapters/loader.ts`) — CTO BLOCK Gap B 反映

旧設計 (magic string `if (ref === "console" || ref === "no-op")` + dynamic import 二重路) は silent fallback risk のため **廃案**。新設計は **builtins registry + schema validation + fail-closed throw** に統一:

```typescript
// builtins を明示的 registry object に集約
export const NOTIFIER_BUILTINS: Record<string, () => Notifier> = {
  "console": () => consoleNotifier,
  "no-op": () => noOpNotifier,
};

// 起動時 schema validation (unknown key / 型不一致を reject)
export function validateConfig(raw: unknown): FrameworkConfig {
  // strict: KNOWN_TOP_LEVEL_KEYS / KNOWN_ADAPTER_KEYS 以外は throw
  // type check: adapter ref は non-empty string のみ
  // (詳細は PoC 実装参照)
}

// loader 本体: builtin 優先 → dynamic import (fail-closed throw)
export async function loadNotifier(cfg: FrameworkConfig, defaultRef = "no-op"): Promise<Notifier> {
  const adapterRef = cfg.adapters?.notifier ?? defaultRef;
  if (adapterRef in NOTIFIER_BUILTINS) {
    return NOTIFIER_BUILTINS[adapterRef]();
  }
  let mod: unknown;
  try {
    mod = await import(adapterRef);
  } catch (err) {
    throw new AdapterLoadError(
      `notifier adapter "${adapterRef}" not found in builtins (${Object.keys(NOTIFIER_BUILTINS).join(", ")}) and dynamic import failed: ${err.message}`,
    );
  }
  // shape check: notify method 存在を verify、不一致は throw
  if (!isNotifierShape(mod)) {
    throw new AdapterLoadError(`notifier adapter "${adapterRef}" loaded but shape invalid`);
  }
  return mod.default ?? mod;
}
// loadStateStore / loadTaskTracker も同型 (各 BUILTINS に対して)
```

設計原則:
- **明示的 registry**: 新 builtin を追加するには code 改変 (env var / 文字列 hack 禁止)
- **schema validation**: unknown adapter key / 型不一致 / empty string は ConfigValidationError throw、起動 fail-closed
- **silent fallback 排除**: builtin 不在 + import 失敗 = AdapterLoadError throw、catch 不在
- **shape check**: import 成功でも interface 違反は AdapterLoadError throw

[文献確認: PoC 実装 + smoke `proposals/distribution-poc/src/loader.ts` + `loader.test.ts`、test 21/21 PASS [検証済 observed: 04-27 PoC test run、unknown key reject + typo throw + invalid JSON throw + builtin round-trip]]

### §4.3 Default 実装 (`src/cli/adapters/defaults.ts`)

```typescript
export const consoleNotifier: Notifier = {
  async notify(message, opts) {
    // destination type に応じて出力形式を変える、unknown destination は throw
    // (詳細は PoC 実装参照)
  },
};
export const noOpNotifier: Notifier = { async notify() {} };

// stateStore default = "memory" (in-memory Map、fresh process で空)
// productive な default は file-based を Phase 1.2 で追加 candidate

// taskTracker default = "no-op"、productive 用は github-issues adapter (Phase 1.2)
```

[文献確認: PoC `proposals/distribution-poc/src/defaults.ts`、本 IMPL の Phase 1.2 で正式実装に移管]

### §4.4 Config schema (`.framework/config.json`)

```typescript
interface FrameworkConfig {
  // 既存 fields (docs_layers / gates / 等) は維持
  adapters?: {
    notifier?: string;      // "console" | "no-op" | package 名 | 絶対パス
    stateStore?: string;    // "memory" | "no-op" | package 名
    taskTracker?: string;   // "no-op" | "github-issues" (Phase 1.2 以降) | package 名
  };
}
```

未指定 = default 適用 (`no-op` series)。**unknown key を含む config は起動時 ConfigValidationError throw** (silent fallback なし)。

---

## §5 既存コードからの移行

### §5.1 影響範囲 grep 結果 (実数、Step 3.45 dogfood evidence)

[検証済 observed: 04-27 session で Explore Agent (≒ feasibility-check grep mode 等価) が実コード grep を実行、以下は実数。lead-impl-workflow/SPEC.md FR-L6 dogfooding (FR-L6.5) の output]

| 領域 | 当初推定 | **実数** | 乖離 | 移行 PR | 設計含意 |
|---|---|---|---|---|---|
| `console.*` (log/error/warn) + `logger.*` の通知系 → `Notifier` | 〜30 箇所 | **113 箇所** (console 83 + logger 30) | 過小 (3.8倍) | Phase 2.1 | 既存 logger.ts (stdout/stderr redirect + colorization) を facade として継続活用、Notifier はその下流 |
| `fs.readFileSync` / `fs.writeFileSync` 全般 | 〜15 箇所 | **546 箇所** (180 read + 366 write) | **過小 36倍 🔴** | (要 scope 再定義) | **全件 adapter 経由化は非現実的**。「永続化 state」(`.framework/*.json`) と「ファイル一般操作」(template / config 読込等) を分離し、StateStore 対象は前者のみに絞る |
| `.framework/*.json` read/write | 未推定 | **6 箇所** | — | Phase 2.2 | StateStore 真の対象 = この 6 箇所、現実的規模 |
| `gh issue` / `gh pr` 直接呼出 → `TaskTracker` | 〜20 箇所 | **8 箇所** (全て hooks-installer.ts) | 過大 | Phase 2.3 | 集中、refactor 軽量 |
| 内部固有名詞 hardcode (`iyasaka` 2 / `watchout` 15 / `hotel-kanri` 6 / `haishin-puls-hub` 3 / `wbs` 12 / `agent-comms-mcp` 0 / `agent-memory` 0 / Discord ID 0) | 未調査 | **38 箇所** (大半は test/example) | — | Phase 3.3 | 本体融合は最小、test/example が大半。grep ベースで自動洗出可、Phase 3.3 cost 軽い |

[文献確認: PR #82 で hooks-installer が gh CLI 直接呼出を実装済 → Phase 2.3 で wrap 必要]
[文献確認: 既存 `src/cli/lib/llm-provider.ts` (PR #52) が adapter pattern + factory + role-based config の参考実装、Phase 1 で同 pattern 採用]
[検証済 observed: 既存 `gate-engine.ts` の `GateIO` interface が既に adapter pattern 的、Phase 2.1 Notifier 設計時に GateIO と整合させる]

#### §5.1.1 Phase 2.2 scope 再定義 (CRITICAL 36 倍乖離 への対応)

実数 546 箇所のうち StateStore 対象は **6 箇所のみ** (`.framework/*.json` read/write)。残 540 箇所は以下に分類して **adapter 経由化対象外**とする:

- **Config 読込** (project.json / config.json / gates.json 等の設定 file): adapter 不要、起動時 1 回のみ、`readConfigFile()` 共通関数で済む
- **Template 操作** (`templates/` 配下の md / json template): adapter 不要、ファイル一般操作
- **Test fixture I/O** (`tests/` 内の tmp file 操作): adapter 不要、test scope
- **CLI temporary I/O** (`/tmp/` や `os.tmpdir()` 経由の一時ファイル): adapter 不要、process scope

この scope 狭化で Phase 2.2 の実装規模は **当初推定 15 箇所 ≈ 実 scope 6 箇所** で realistic、IMPL §3 Phase 2.2 の sub-PR 分解はそのまま有効。

[検証済 observed: 04-27 Explore agent 結果より分類、`os.homedir()` / `~/.adf/` 系の永続化 state 候補は別途 grep 必要 (本 dogfood では未抽出、follow-up 必要)]

#### §5.1.2 既存 GateIO との整合方針

[検証済 observed: 既存 `src/cli/lib/gate-engine.ts` に `GateIO` interface が存在、print abstraction 済]

新 Notifier 設計時に既存 GateIO との関係を明確化する candidate:
- (a) GateIO を Notifier の destination type の 1 つとして fold (`{type: "gate-io"}` 等)、既存 GateIO 利用箇所を Notifier 経由に移行
- (b) GateIO を別抽象として保持、Notifier は agent-comms-mcp / Slack / webhook 系 (channel 通知) のみ扱う
- 推奨: **(b)** — GateIO は CLI runtime print の abstraction、Notifier は人/bot への通知、責任分離が明確

本判断は Phase 1.1 sub-PR 5-section instruction の Open decisions に enumerate、adf-dev が実装時に最終決定可。

#### §5.1.3 profile-model 整合修正

[検証済 observed: 04-27 Explore agent 結果より、実装の `ProfileType` enum は **7 種** (`app, lp, hp, api, cli, mcp-server, library`)]

distribution/SPEC.md §5 CLI 例に `hotel` を含めていたが実装に存在しない (誤記)。`lp` (landing page) を漏らしていた。本 IMPL Phase 1 着手時に SPEC §5 を修正 (typo fix で route:fast-merge 範囲)。

### §5.1.4 webb-dev pilot 失敗 retro (Step 3.45 必要性 validate)

[検証済 observed: 2026-04-27 webb-dev pilot で PR #243 (cycle 3 merged、commit `c6b2a56`) の `aun install` が plugin install path bug で失敗、msg `5e4b007d`]

経緯:
- PR #243 (`claude mcp add` 経路 + start wrapper) merge 直後、webb-dev で fresh install pilot 実行
- `aun init` 後 plugin entry が dependency 解決 fail (`MODULE_NOT_FOUND` for `./core/db` / `./adapters/discord`)
- 根因: `cpSync(server.ts)` で source ファイル単一コピーしたが、`server.ts` の relative import 先 (`./core/`, `./adapters/`) が plugin install dir 内に不在
- forward fix B 案: bundle approach (`bun build --target=bun --outfile=server.bundled.js`) を CTO 認可で採用 → PR #247 cycle 4 で実装、現在 review chain 進行中

**Step 3.45 を framework に組込んでいれば防げた typical case**:
- PR #243 cycle 3 設計時点で feasibility-check が「fresh install path で `aun init` 後の dependency 解決」smoke を要求 → bug を merge 前に捕捉
- 当時 ARC + CTO は紙設計 + contract test で進めて、real install 環境での dependency 解決 path の検証が抜けた
- 本 amend FR-L6 が組込まれた後は、Step 3.45 で必ず「実 install 環境 smoke (1 件)」を要求、merge 前に install bug を表面化

[文献確認: CTO 設計判断 msg `038a5662` 「webb-dev pilot 失敗が本提案の必要性を実機で validate」]

#### bundle 配布形式と adapter loader の整合 (PR #247 cycle 4 反映)

PR #247 で確定した bundle approach (`server.bundled.js` 単一ファイル配布) は、ADF distribution の Phase 4 (`@iyasaka/adf-internal-config` 配布) でも有効候補:

- 現 distribution/IMPL.md §4.2 の loader は **npm package 名 OR 絶対パス** を dynamic import 想定
- bundle 形式 (single `.mjs` file、絶対パス指定) も Node.js dynamic import で resolve 可能 ([検証済 observed: PoC smoke `Bundle path support` 3 件 PASS、04-27 14:55 JST])
- internal config layer の adapter は npm 配布 OR bundle 配布のどちらでも可、選択は Phase 4.1 着手時の adf-dev 判断 (Open decision、§9 に追記候補)

[検証済 observed: `proposals/distribution-poc/test/loader.test.ts` に Bundle path support 3 件追加、smoke で bundled-style absolute path → loadNotifier 成功 + invalid shape reject + non-existent path AdapterLoadError throw 確認]

### §5.2 後方互換戦略

- adapter 未設定の既存 project (`.framework/config.json` に `adapters` field 不在) → default 適用 = 挙動不変
- `LLMProvider` (既存) は本 IMPL の adapter pattern と既に整合 [文献確認: PR #52 改修 D]

---

## §6 サブPR ごとの 5-section instruction 雛形

各サブPR は別 GitHub Issue で 5-section instruction を起票する。共通の Forbidden / Test fixtures パターン:

### §6.1 全 PR 共通 Forbidden (継承)

- ❌ 内部固有名詞 (`iyasaka` / `watchout` / `agent-comms-mcp` / `agent-memory` etc.) を ADF core source に含めない (Phase 4 layer 以外)
- ❌ env var switch で N 実装切替を導入しない [文献確認: memory `project_adf_oss_aware_design.md`]
- ❌ scope 外の既存ファイルを touch しない (1 PR 1 concern)
- ❌ silent fallback (通信障害を別経路で代替) を導入しない [文献確認: memory `feedback_no_silent_fallback.md`]
- ❌ 削除コメント (// removed for X) や backwards-compat shim を残さない

### §6.2 全 PR 共通 Test fixtures (継承)

- adapter interface 変更時: 既存テスト全 PASS + 新規 unit test ≥ 1
- 新規ファイル: 単体テスト必須 (vitest)
- type check: `tsc --noEmit` clean
- breaking change 検出 script (`scripts/detect-breaking-changes.sh`) PASS、または `breaking-change-verified` label 付与

### §6.3 各サブPR の `route:` label

| Phase | route: |
|---|---|
| 0 | fast-merge (bootstrap) |
| 1.1 / 1.2 / 1.3 | fast-merge (新規追加、既存挙動不変) |
| 2.1 / 2.2 / 2.3 | fast-merge (refactor、behavior 不変) |
| 3.1 / 3.2 | fast-merge |
| 3.3 | **ceo-approval** (内部固有名詞削除は破壊的変更可能性あり、breaking-change-verified 必須) |
| 4.1〜4.4 | fast-merge (新規 repo / 新規 package) |

[文献確認: governance-flow.md `~/.claude/rules/governance-flow.md` route 判定]

---

## §7 Adapter 契約の詳細仕様

### §7.1 Notifier

**契約**:
- `notify` は async、5s 以内に return (timeout は loader で enforce)
- 失敗時は throw、core 側で catch して「通信不可の報告」のみログ、retry なし [文献確認: memory `feedback_no_silent_fallback.md`]
- `mentions` は agent_id 文字列の配列 (例: `["cto", "arc"]`)、Discord snowflake は禁止 [文献確認: memory `feedback_agent_id_mentions.md`]

### §7.2 StateStore

**契約**:
- key は文字列、namespace は呼出側が prefix で管理 (例: `"adf:gate:lastRun"`)
- value は JSON serializable
- `get` は不在で null、エラー時は throw

### §7.3 TaskTracker

**契約**:
- `getActiveTask` の「active」定義は実装側 (GitHub Issues 実装は `status:in-progress` label) [文献確認: PR #82 hooks-installer]
- 不在で null

---

## §8 Phase 0: bootstrap PR (Issue #105) の施工図

本 §は Issue #105 の 5-section instruction を補完する施工図。

### §8.1 修正範囲

新規ファイル 1 件のみ:
- `.framework/project.json`

他のファイルは touch しない (Forbidden §6.1 継承)。

### §8.2 ファイル内容

```json
{
  "name": "ai-dev-framework",
  "profileType": "cli",
  "description": "AI Dev Framework — meta-framework for AI agent-driven development",
  "techStack": {
    "framework": "nodejs-cli",
    "ui": "none",
    "language": "typescript",
    "runtime": "node",
    "package_manager": "npm",
    "deployment": "npm-package"
  },
  "repository": "watchout/ai-dev-framework",
  "createdAt": "<commit author timestamp ISO8601>",
  "updatedAt": "<同上>"
}
```

### §8.3 検証コマンド

```bash
# 1. JSON 妥当性
node -e "JSON.parse(require('fs').readFileSync('.framework/project.json'))"
# 2. profile-model 整合
npx tsx -e 'import("./src/cli/lib/profile-model.js").then(m => console.log(m.isValidProfileType("cli")))'
# 3. Gate B local 再現
# (3-1) 修正前: git stash → bash -c 'if [ ! -f .framework/project.json ]; then exit 1; fi'  → exit 1 確認
# (3-2) 修正後: git stash pop → 同上で exit 0 確認
```

[検証済 observed: Gate B workflow の check は `if [ ! -f .framework/project.json ]; then exit 1`、`.github/workflows/gate-b.yml` で確認済]

### §8.4 PR description テンプレート (adf-dev 用)

```markdown
## Summary
- ADF リポジトリ自身に `.framework/project.json` を追加し、Gate B FAILURE を解消する dogfooding 整備
- profileType=cli を採用 (理由: ADF は CLI tool)
- IMPL.md §8 (docs/specs/distribution/IMPL.md) 準拠

## Test plan
- [ ] `JSON.parse()` で valid JSON
- [ ] `isValidProfileType("cli")` returns true
- [ ] Gate B 修正前: FAILURE 再現 (`gh run view <run> --log` 引用)
- [ ] Gate B 修正後 (本 PR): CI Gate B が PASS
- [ ] 他 Gate (A / C / CI / Critical Gate) 全 PASS

## Files changed
- `.framework/project.json` (新規)
```

---

## §9 Open decisions (implementer 自由 / 各サブPR で実装者判断 OK)

サブPR 共通の Open scope:
- 各ファイル内の private helper の命名 / 内部構造
- commit message phrasing (Conventional commits 必須)
- branch 名 (例: `feat/adapter-types-phase1-1`)
- PR description の体裁 (test plan checkbox は必須)
- vitest test file 内の test 名 / describe 階層

ここに列挙されていないものは **暗黙凍結**。判断に迷ったら lead (ARC interim) に escalate。

---

## §10 lead 責任の明示

本 IMPL の作成・維持は lead (現時点で ARC interim) の責任 [文献確認: governance-flow.md / Role mapping table]:

- 各サブPR の 5-section instruction を本 IMPL から抽出して GitHub Issue に転記
- adf-dev からの open decisions 範囲外の escalation を受け、本 IMPL を更新
- 本 IMPL の更新 PR は ARC + CTO の連名 review

---

## Evidence label legend

- `[検証済 observed]` — 既存 smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — 公式 doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke / 設計 review が必要
