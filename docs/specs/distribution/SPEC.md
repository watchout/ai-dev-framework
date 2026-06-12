# ADF 配布 SPEC

> doc4l 4-layer doc / SPEC layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 関連: IMPL.md / VERIFY.md / OPS.md (同 directory)

## §1 目的

AI Dev Framework (ADF) を 2 段階で配布する:

- **Stage A (本ゴール)**: 社内全 bot/プロジェクト (iyasaka / hotel-kanri / haishin-puls-hub / wbs / agent-comms-mcp / agent-memory 等) に ADF を install し、全プロジェクトの開発を ADF governance 下で運用する
- **Stage B (見越し設計)**: ADF を OSS として一般公開 (`watchout/ai-dev-framework`) し、外部開発者が internal 依存なしに導入できる状態にする

Stage A 達成時点で、Stage B への移行が **追加の破壊的変更を要さず** 設定 layer の差分だけで完了する状態にすることを設計目標とする。 [推測: 設計目標、実装後 VERIFY で測定]

### §1.1 Cross-repo API stability 約束 (CTO BLOCK Gap A 対応 / msg `fca4e7ee` 警告反映)

本 SPEC 配布で **adapter 経由依存** となる外部 API は、ADF Notifier / StateStore / TaskTracker 契約の **public contract に昇格** する。各 repo は以下の stability 水準を約束する:

| 外部 API | repo | 約束水準 | 約束 owner |
|---|---|---|---|
| `mcp__agent-comms__send` / `notify` | agent-comms-mcp | semver-major で互換維持、breaking change は agent-comms-mcp 側で `route:ceo-approval` PR、ADF Notifier adapter 同時更新 | agent-com-dev + lead-ama + ARC |
| `mcp__agent-memory__save_knowledge` / `get_knowledge` (将来 `delete`) | agent-memory | 同左 | agent-mem-dev + lead-tuk + ARC |
| GitHub Issues (gh CLI) | external (GitHub) | upstream 仕様に従う、adapter 内に shape 検証 | adf-dev (TaskTracker default 担当) |

[文献確認: CTO 警告 msg `fca4e7ee` 「agent-comms-mcp send API は OSS 公開時 ADF Notifier の public contract に昇格 → versioning 戦略要」]

cross-repo PR 起票時の協調 protocol:
- ADF core の adapter interface 変更時 → agent-comms-mcp / agent-memory 側 adapter 実装の同時 PR (paired PR)
- 約束違反 (silent breaking change) は L2 codex-auditor の axis 3 (hidden impact) で検出対象
- 本 SPEC merge 後、各 repo の README に "ADF adapter contract" badge 候補 [推測 unverified: 実装は Phase 4.1]

## §2 非目的

- ❌ Stage B (OSS 公開) の **公開タイミング判断** — CEO 戦略決定事項、本 SPEC は技術準備のみ扱う
- ❌ ADF 機能追加 — v1.2.0 doc4l 等の機能仕様は別 SPEC ([文献確認: Issue #102 description / Drive `gdrive:開発/ADF/v1.2.0_2026-04-20/`])
- ❌ ADF 利用 project 側の SSOT 内容変更 — 配布手段 (install / upgrade / config) のみ扱う
- ❌ License 文言確定 — CEO 確認待ち事項として §8 に記載
- ❌ Marketing / OSS community 戦略 — 商用化判断含めて経営判断、本 SPEC scope 外

## §3 ユーザーストーリー

### US-D1: 内部 bot プロジェクト lead として

```
内部 bot project の lead-bot として、
私は ADF を install して
governance flow / Gate 機構 / SSOT format の恩恵を受けたい。
internal infra (agent-comms-mcp / agent-memory) との連携は箱外で動いてほしい。
```

### US-D2: 内部 dev-bot として

```
dev-bot として、
私は CI で ADF Gate A/B/C/0/1 が走り、
SSOT 不備 / breaking change を merge 前に検知してほしい。
```

### US-D3: OSS 利用者 (将来) として

```
ADF を OSS として導入する外部開発者として、
私は agent-comms-mcp / agent-memory を install せずとも
ADF core (gate / spec validation / trace verify) が単体で動く状態を期待する。
notifications / state-store は自分の環境 (Slack / Linear / GitHub Issues etc.) に差し替えたい。
```

### US-D4: ADF 自身 (dogfooding) として

```
ADF リポジトリ自身が ADF governance 下で運用されている状態を期待する。
ADF の Gate B が ADF 自身の PR で PASS する dogfooding が成立している。
```

[検証済 observed: 現状 ADF は `.framework/project.json` 不在で自身の Gate B が FAILURE = dogfooding gap、PR #104 run 24700587063 で確認済]

## §4 機能要件

### FR-D1: Install path (Stage A 用)

**FR-D1.1 (MUST)** ADF は npm パッケージとして install 可能 (`npm install -g @watchout/adf` または同等の path)

**FR-D1.2 (MUST)** internal config layer (`@iyasaka/adf-internal-config` 仮称) を同時 install することで、agent-comms-mcp / agent-memory との連携が enable される

**FR-D1.3 (MUST)** ADF core 単独 install で、internal config layer なしでも基本機能 (init / gate / trace verify / spec validate) が動作する

**FR-D1.4 (SHOULD)** `framework retrofit` で既存プロジェクト (.framework/project.json なし) を初期化可能

### FR-D2: Adapter 抽象 (Stage B 見越し)

**FR-D2.1 (MUST)** ADF core は以下を **adapter interface** として分離する。実装の hardcode 禁止:

| Adapter | core interface | internal 実装 | OSS default 実装 |
|---|---|---|---|
| `Notifier` | `notify(channel, msg)` | agent-comms-mcp adapter | console / no-op |
| `StateStore` | `getState(key) / setState(key, val)` | agent-memory adapter | local file / no-op |
| `TaskTracker` | `getActiveTask() / updateTask()` | GitHub Issues adapter | GitHub Issues adapter (default) |
| `LLMProvider` | `complete(prompt) / stream(prompt)` | (既存維持) | (既存維持) |
| `TaskTracker` | `getActiveTask() / updateTask() / listTasks()` | github-issues adapter | **複数 default 候補**: github-issues (現状) / linear-adapter / jira-adapter / asana-adapter (Stage B 公開前に実装方針確定、CTO 警告 msg `fca4e7ee` 反映) |

**Note (TaskTracker)**: OSS user の lock-in 回避のため、TaskTracker default は GitHub Issues 単独でなく **複数 SaaS** (Linear / Jira / Asana) 互換を Stage B 公開前に実装。当面 Stage A 内部配布は github-issues 単独で OK、Stage B 移行前に linear-adapter 最低 1 件追加。 [文献確認: CTO Cross-repo bleed 警告 msg `fca4e7ee` 「GitHub Issues default: OSS user が GitHub 必須 lock-in、Jira/Linear/Asana 互換 path Stage B 公開前に決定要」]

[文献確認: `LLMProvider` は `src/cli/lib/llm-provider.ts` に PR #52 で実装済、改修 D 参照 / `adf-dev-state.md`]

**FR-D2.2 (MUST)** adapter 選択は `.framework/config.json` の `adapters` field で宣言、`env var switch で N 実装切替` は禁止

[文献確認: memory `project_adf_oss_aware_design.md` / 過去の multi-LLM 1 script 抽象失敗事例]

**FR-D2.3 (SHOULD)** internal config layer は core の adapter interface を実装する独立パッケージとして配布、core は internal layer の存在を知らない

**FR-D2.4 (MUST、CTO BLOCK Gap A 反映)** Notifier interface は **destination の discriminated union** で reply / channel / default を統一表現する:

```typescript
export type NotifyDestination =
  | { type: "reply"; reply_to: string }       // agent-comms-mcp send 互換
  | { type: "channel"; channel: string; thread_id?: string }  // agent-comms-mcp notify 互換
  | { type: "default" };                      // adapter 自身が判断 (許可しない adapter は throw)
```

各 adapter は対応する destination type のみ実装、未対応は **明確エラー throw** (silent fallback なし、SPEC §6.2 準拠)。

[文献確認: PoC 実装 `proposals/distribution-poc/src/types.ts` + `agent-comms-notifier.ts`、smoke test 7/7 PASS [検証済 observed: 04-27 PoC test run]]

**FR-D2.5 (MUST、CTO BLOCK Gap B 反映)** adapter loader は以下の規範に従う:
- builtins を **明示的 registry object** に集約 (`NOTIFIER_BUILTINS` / `STATE_STORE_BUILTINS` / `TASK_TRACKER_BUILTINS`)
- config 読込時に **schema validation** 必須 (unknown key / 型不一致は ConfigValidationError throw)
- builtin 不在の adapter ref は dynamic import を試行、失敗時は **AdapterLoadError throw** (silent fallback 禁止)
- 起動時 schema validator 実行 = 起動 fail-closed

[文献確認: PoC 実装 `proposals/distribution-poc/src/loader.ts`、smoke test 21/21 PASS [検証済 observed: 04-27 PoC test run]]

### FR-D3: Internal-agnostic core

**FR-D3.1 (MUST)** ADF core source / spec / template に以下の固有名詞 hardcode を含めない:
- `iyasaka` / `watchout` / `hotel-kanri` / `haishin-puls-hub` / `wbs` 等の project 名
- `agent-comms-mcp` / `agent-memory` 等の internal infra 名 (adapter import path のみ allowed)
- Discord channel ID / Bot token / 内部メンバー個人情報

**FR-D3.2 (MUST)** 上記固有名詞は internal config layer または各 project の `.framework/project.json` / `.framework/config.json` に閉じ込める

**FR-D3.3 (SHOULD)** OSS readiness checker (CI script) で FR-D3.1 違反を merge 前検知

### FR-D4: ADF self-hosting (dogfooding)

**FR-D4.1 (MUST)** ADF リポジトリ自身が `.framework/project.json` を持ち、自身の Gate A/B/C を PASS する [文献確認: Issue #105 で着手中]

**FR-D4.2 (SHOULD)** ADF v1.2.0 の SPEC/IMPL/VERIFY/OPS 4-layer doc が ADF 自身の Gate 0 で validate される

### FR-D5: Upgrade path

**FR-D5.1 (MUST)** ADF 利用 project は `npm update` で上位 version に追従可能、breaking change は `route:ceo-approval` PR でのみ発生

**FR-D5.2 (SHOULD)** `shirube migrate` コマンドで legacy schema (gates.json / plan.json 等) を新 schema に変換

## §5 インターフェース

### CLI

```bash
framework init [--profile=cli|app|api|library|hp|mcp-server|hotel] [--retrofit]
framework gate <a|b|c|spec|trace>
framework trace <verify|graph>
framework spec <validate>
shirube migrate <plan-state|gates>
framework retrofit
```

### Config files

```
.framework/
  project.json         # repo identity (FR-D1, FR-D4)
  config.json          # adapter selection (FR-D2)
  goals.json           # project-level goals (existing)
  active-skill.json    # skill state (existing)
```

### Adapter API (TypeScript types)

```typescript
// src/cli/adapters/types.ts
export interface Notifier {
  notify(channel: string, message: string): Promise<void>;
}

export interface StateStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface TaskTracker {
  getActiveTask(): Promise<Task | null>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
}

// 既存: LLMProvider は src/cli/lib/llm-provider.ts
```

`config.json` での選択:

```json
{
  "adapters": {
    "notifier": "@iyasaka/adf-internal-config/notifier",
    "stateStore": "@iyasaka/adf-internal-config/state-store",
    "taskTracker": "github-issues"
  }
}
```

## §6 非機能要件

### §6.1 性能

- `framework gate <X>` 実行時間 < 30s (typical project) [推測 unverified: 計測必要]
- `framework trace verify` < 60s (1000 docs まで) [推測 unverified: VERIFY で smoke 計測]

### §6.2 可用性

- adapter 不在 / 通信障害時の fallback は **「通信不可の報告のみ」**、通常通信を別経路で代替しない [文献確認: memory `feedback_no_silent_fallback.md`]

### §6.3 セキュリティ (STRIDE)

| 脅威 | 対策 |
|---|---|
| Spoofing | adapter 呼出時の caller identity は core で検証、adapter 実装に委ねない |
| Tampering | `.framework/*.json` の schema validation を init/gate 時に必須 |
| Repudiation | bypass / chain-skip は audit log に記録 [文献確認: Issue #65 framework-overhaul] |
| Information disclosure | secrets は config に書かない、env var or OS keychain 経由必須 |
| Denial of Service | gate 実行は CI timeout (10min) 内、adapter 呼出は timeout 5s 必須 |
| Elevation of privilege | hook 実行は project workspace 内に閉じる、`/etc` 等の system path 触らない |

### §6.4 OSS 公開時の追加要件 (Stage B)

- License: 未確定 (MIT / Apache 2.0 候補、CEO 確認待ち §8 参照)
- Code of Conduct (`CODE_OF_CONDUCT.md`) 必要
- Contributing guide (`CONTRIBUTING.md`) 必要
- Security policy (`SECURITY.md`) 必要
- 内部固有名詞の grep 検査が CI で 0 件 (FR-D3.3)

## §7 受入基準 (Gherkin)

### AC-D1: Stage A install 動作 (FR-D1.1, FR-D1.2)

```gherkin
Given internal bot project (e.g., iyasaka) に ADF が未 install
When `npm install @watchout/adf @iyasaka/adf-internal-config`
And `framework init --profile=hp`
Then `.framework/project.json` が作成され
And `.framework/config.json` の adapters が internal 実装を指す
And `framework gate b` が PASS する
```

### AC-D2: ADF core 単独動作 (FR-D1.3)

```gherkin
Given クリーンな fresh project (internal config layer 未 install)
When `npm install @watchout/adf`
And `framework init --profile=cli`
Then `framework gate a/b/c` が全 PASS
And notifier / stateStore は no-op default で動作 (エラーにならない)
```

### AC-D3: Adapter 切替 (FR-D2.1, FR-D2.2)

```gherkin
Given `.framework/config.json` で `notifier: "@iyasaka/adf-internal-config/notifier"` が指定
When `framework gate spec` が完了し通知が走る
Then agent-comms-mcp 経由で notify が発火する

Given `.framework/config.json` で `notifier: "console"` が指定
When 同条件
Then 標準出力に通知が出る (agent-comms-mcp は呼ばれない)
```

### AC-D4: Internal-agnostic core 検査 (FR-D3.1, FR-D3.3)

```gherkin
Given main branch の ADF core source (`src/`, `templates/`, `docs/specs/` core 部分)
When OSS readiness checker を CI で実行
Then `iyasaka|watchout|hotel-kanri|haishin-puls-hub|wbs|agent-comms-mcp|agent-memory` の grep 結果が 0 件
And 例外: example/ / docs/specs/distribution/ (本 SPEC 自身) は exclude
```

### AC-D5: ADF self-hosting (FR-D4.1)

```gherkin
Given ADF リポジトリ main branch
When 任意の PR を起票
Then Gate A / Gate B / Gate C が全 PASS する
```

### AC-D6: Upgrade path (FR-D5.1)

```gherkin
Given iyasaka project が ADF v1.X.0 を使用中
When ADF を v1.Y.0 に upgrade (route:fast-merge 範囲)
Then iyasaka project の既存 PR が breaking change なく動作継続
```

## §8 前提・依存

- **License 未確定**: CEO 確認待ち (MIT / Apache 2.0 候補)。OSS 公開前に確定必須、Stage A 内部配布は社内 license 準拠で可
- **internal config layer の package 名 / 配置**: `@iyasaka/adf-internal-config` は仮称、CTO + ARC で確定 (技術判断、IMPL.md で議論)
- **依存 SSOT**:
  - v1.2.0 doc4l [文献確認: Drive `gdrive:開発/ADF/v1.2.0_2026-04-20/`]
  - governance-flow.md [文献確認: `~/.claude/rules/governance-flow.md`]
  - auto memory: `feedback_no_silent_fallback.md` / `feedback_no_time_concept.md` / `project_adf_oss_aware_design.md`
- **依存 PR / Issue**:
  - PR #104 (doc4l step 3/5) [文献確認: https://github.com/watchout/ai-dev-framework/pull/104]
  - Issue #105 (bootstrap) [文献確認: https://github.com/watchout/ai-dev-framework/issues/105]
  - PR #91 (#64 sub-PR 2) [文献確認: on-hold label 付与中]
  - Phase 1 残 issue #65-#69 [文献確認: framework-overhaul label 全 OPEN]

## §9 用語

| 用語 | 定義 |
|---|---|
| ADF core | `watchout/ai-dev-framework` リポジトリの src/ + templates/ + docs/specs/ (distribution 除く) |
| Internal config layer | 仮称 `@iyasaka/adf-internal-config`、agent-comms-mcp / agent-memory との adapter 実装を含む独立 package |
| Stage A | 社内全 bot/プロジェクトへの ADF 配布 (本 SPEC のメインゴール) |
| Stage B | OSS 公開 (将来、CEO 戦略判断) |
| Adapter | core が依存する外部 system との接合層 (Notifier / StateStore / TaskTracker / LLMProvider) |
| Dogfooding | ADF 自身が ADF governance 下で運用される状態 |

---

## Evidence label legend

本 SPEC では以下のラベルを使用:
- `[検証済 observed]` — smoke / log / 既存実行で観測済み
- `[文献確認 referenced]` — 公式 doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、VERIFY/IMPL で smoke が必要
