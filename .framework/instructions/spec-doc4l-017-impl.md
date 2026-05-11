# 6-Section Instruction: SPEC-DOC4L-017 impl PR (cycle 7、clean restart)

> **Revision history**:
> - cycle 1-6 (2026-05-12): iterative refinement, cycle 6 で spec dependency による Axis 3 regression、CEO directive `b6fbeb8c` で path (a) 採択 = wait-for-spec-patch
> - cycle 7 (2026-05-12): PR #137 merge 後 fresh restart、6/7 PASS、Item 7 (fixture concreteness) のみ FAIL
> - cycle 8 (2026-05-12): Fixture 3-6 literal 展開 + corpus literal、Item 7 残 3 sub-finding (Fixture 5/6 severity 欠落 / smoke count 算術不整合 / test count drift)
> - cycle 9 (2026-05-12): 3 sub-finding 局所 fix (Fixture 5/6 findings[0] + severity 凍結 / Smoke count 3 件に修正 / test count を 12+2+1=15 で SSOT 統一)

## 0. Dispatch context (凍結)

- **target_project**: `ai-dev-framework`
- **dispatch_origin**: `adf-lead`
- **dispatch_reason**: CTO directive `5d1a5316` (2026-05-11) per CEO `aca5a0be` GO; impl PR for SPEC-DOC4L-017 (案 ii deferred from PR #134、spec patch PR #137 merged 2026-05-12)
- **tracking issue**: https://github.com/watchout/ai-dev-framework/issues/136
- **spec source of truth**: `docs/spec/v1.2.6-spec-audit-gate.md` (PR #134 + PR #137 patch、main 上 confirmed)
- agent-memory tool 呼出時は `project="ai-dev-framework"` を **explicit per-call** で渡す

## 1. Interface contract (凍結)

### 1.1 4 Port (= 凍結 interface、外部世界の adapter 境界)

外部世界アクセスはすべて以下 4 port のいずれか経由。`node:fs` / `node:child_process` / `fetch` / `node:https` を `validateSpec()` 本体および 7 check sub-module から **直接呼ぶことは禁止** (§3 Forbidden 連動)。

```ts
// src/cli/commands/gate/ports.ts (新規)

export interface SpecRepositoryPort {
  list(): Promise<Array<{path: string; content: string}>>;
  parseFrontmatter(path: string): Promise<{
    id: string[];
    headings: string[];
    metaSpec: boolean;  // §0.1 + §4.2 per、`meta_spec: true` frontmatter flag の有無
  }>;
  sectionBody(path: string, heading: string): Promise<string | null>;
}

export interface GitHistoryPort {
  // §5.3.1 per、3 分岐:
  //   未追加 (PR diff 内新規) → false (= strict 対象)
  //   base_ref より古い追加 → true  (= bootstrap 対象、warn 降格)
  //   base_ref と同等以後の追加 (既 file の改訂) → false (= strict 対象)
  isPreExistingSpec(path: string, baseRef: string): Promise<boolean>;
}

export interface LinkProbePort {
  head(url: string, opts?: {timeoutMs?: number; retries?: number}): Promise<{ok: boolean; reason?: string}>;
}

export interface AuditLogPort {
  append(entry: object): Promise<string>;
}
```

### 1.2 CLI signature (凍結、cycle 7 axis 2 fix per)

```ts
export type CheckName =
  | 'id-uniqueness' | 'template-compliance' | 'one-id-per-file'
  | 'control-mechanism' | 'backward-compat' | 'notion-link'
  | 'completion-literal';

export type LinkProbeMode = 'real' | 'fake';

// 公開 signature は raw 入力を受ける (parser pass-through 整合、`as` cast 不要)
export interface ValidateSpecOptions {
  check?: string | string[];   // raw、validateSpec runtime が CheckName narrow + invalid → usage Finding
  strict?: boolean;
  bootstrap?: boolean;
  baseRef?: string;            // default: "main"
  linkProbe?: string;          // raw、runtime が 'real'|'fake' narrow + invalid → usage Finding
}

export interface Finding {
  check: CheckName | 'usage' | 'port-failure';
  severity: 'fail' | 'warn';
  files: string[];
  message: string;
  line?: number;
}

export interface ValidateSpecResult {
  passed: boolean;             // severity='fail' findings 0 件
  exit_code: 0 | 2;
  findings: Finding[];
  audit_log_path: string;
}

export async function validateSpec(
  opts: ValidateSpecOptions,
  ports: {
    spec: SpecRepositoryPort;
    git: GitHistoryPort;
    link: LinkProbePort;
    audit: AuditLogPort;
  }
): Promise<ValidateSpecResult>;
```

**Invariant 5 (cycle 7 axis 2 fix per)**: 公開 input 型は raw `string | string[]`。`validateSpec()` runtime が:
- `check` の各要素が `CheckName` か narrow、不在文字列 1+ → usage Finding
- `linkProbe` の値が `'real'|'fake'` か narrow、それ以外 → usage Finding
- `--strict --bootstrap` 同時 → usage Finding
test fixture は `as` cast 一切不要、raw `string` を渡せる。

### 1.3 CLI 起動形式

```
framework gate validate spec [--check=<name>[,<name>...]] [--strict] [--bootstrap] [--base-ref=<ref>] [--link-probe=real|fake]
```

CLI parser の責務は **syntactic split のみ**:
- `--check=foo,bar` → `{check: ['foo', 'bar']}` (CheckName 検証なし)
- `--link-probe=xyz` → `{linkProbe: 'xyz'}` (real|fake 検証なし)
- `--strict` / `--bootstrap` boolean flag
- `--base-ref=ref` → `{baseRef: 'ref'}`

すべての semantic 検証は `validateSpec()` runtime が実施 (Invariant 5 per)。CLI parser は型を絞らない。

### 1.4 Pre / Post / Invariants

- **Pre**: ports 全 4 つ injected。`SpecRepositoryPort.list()` が 0+ 件
- **Post**: 全 check 終了後 `AuditLogPort.append()` を 1 回呼ぶ、戻り値 path を `audit_log_path` に格納
- **Invariant 1 (severity table、PR #137 patch per、cycle 7 暫定削除)**:

| FR | check name | default severity | --strict で fail 昇格 | grandfathered (bootstrap mode、§5.3.1 per) |
|---|---|---|---|---|
| FR-001 | id-uniqueness | fail | — | warn 降格 |
| FR-002 | template-compliance | fail | — | warn 降格 |
| FR-003 | one-id-per-file | fail | — | warn 降格 |
| FR-004 | control-mechanism | fail | — | warn 降格 |
| FR-005 | backward-compat | fail (PR #137 §4.5 per、grandfather warn / strict block 確定) | — | warn 降格 |
| FR-006 | notion-link | warn | fail | (常に warn、URL rot 別 spec) |
| FR-007 | completion-literal | warn | fail | (常に warn) |

- **Invariant 2 (bootstrap 判定、§5.3.1 per、CLI option mapping 整合)**:
  - `--strict` 指定 → 全 file strict 強制
  - `--bootstrap` 指定 → 全 file bootstrap 強制
  - flag 無指定 (CI workflow default) → `GitHistoryPort.isPreExistingSpec(path, baseRef)` で per-file 自動選別
- **Invariant 3 (副作用)**: spec/git/link port は read-only、audit のみ append write
- **Invariant 4 (no-throw、§1.5 per)**: 例外 throw 禁止、すべて Finding 化

### 1.5 Usage error / Port failure / Error taxonomy (凍結)

| Error class (= `findings[].check`) | trigger | severity | files | passed | exit_code | 他 check 続行 | audit_log_path |
|---|---|---|---|---|---|---|---|
| `usage` | `--strict --bootstrap` 同時 | fail | `[]` | false | 2 | skip 即 return | `''` (sentinel) |
| `usage` | `check` に `CheckName` 不在の文字列 1+ | fail | `[]` | false | 2 | skip | `''` |
| `usage` | `linkProbe` が `'real'`/`'fake'` 以外 | fail | `[]` | false | 2 | skip | `''` |
| `id-uniqueness` … `completion-literal` | 各 FR fail 条件 | fail/warn | 該当 file | severity 依存 | 0/2 | 続行 | port 戻り値 |
| `port-failure` (spec port throw) | `SpecRepositoryPort` が throw | fail | `[]` | false | 2 | skip | `''` |
| `port-failure` (git port throw) | `GitHistoryPort` が throw | warn | 該当 path | bootstrap mode 時 fail 維持 / 通常時影響なし | 0/2 | 該当 file の bootstrap 降格 skip、他続行 | append 試行 |
| `port-failure` (link port throw / timeout) | `LinkProbePort` が throw | warn | URL 含む path | true | 0 (`--strict` 時 fail 昇格 → 2) | 続行 | append 試行 |
| `port-failure` (audit port throw) | `AuditLogPort.append` が throw | warn | `[]` | true (本体維持) | 0 (`--strict` 時も exit 2 にしない) | (本体終了後の最終 step) | `'unavailable'` |

## 2. Required behavior (凍結)

### 2.1 7 機械検証項目 (spec §4.1-4.7 literal 準拠)

各 check は 1 sub-module file (`src/cli/commands/gate/checks/<name>.ts`)、引数は ports、戻り値は `Finding[]`。

| FR | check name | spec ref | 主使用 port |
|---|---|---|---|
| FR-001 | id-uniqueness | §4.1 | spec.list + spec.parseFrontmatter |
| FR-002 | template-compliance | §4.2 (+ §0.1 meta_spec exception + §2.2 (α) 4 sub-rule) | spec.list + spec.parseFrontmatter + spec.sectionBody |
| FR-003 | one-id-per-file | §4.3 | spec.parseFrontmatter + spec.sectionBody |
| FR-004 | control-mechanism | §4.4 | spec.sectionBody (§10) |
| FR-005 | backward-compat | §4.5 (severity 確定: bootstrap warn / strict block) | spec.list + git.isPreExistingSpec |
| FR-006 | notion-link | §4.6 | spec.list + link.head |
| FR-007 | completion-literal | §4.7 | spec.sectionBody (§完了条件) |

### 2.2 F2 sub-rule (PR #137 §0.1 + §4.2 patch + (α) CEO `8eb714f7` per)

`template-compliance` (F2) の判定 logic:

1. **meta_spec exception 判定 (PR #137 §0.1 per、最優先)**: `parseFrontmatter(path).metaSpec === true` なら §11 のみで pass、§12-§14 欠如許容。下記 (α) sub-rule も meta_spec file には適用しない
2. **base section check**: §0-§11 (+ §Evidence) の必須 section 揃い、欠如 → fail
3. **(α) 4 sub-rule (meta_spec=false の通常 spec のみ適用)**:

| sub-rule | 条件 | 検出 port |
|---|---|---|
| F2-a | `## 7. ` 受入基準 section 存在 + body 空白のみ NG | spec.sectionBody |
| F2-b | F2-a 範囲内に Gherkin (Given/When/Then 各 1 行+) 1+ scenario | spec.sectionBody |
| F2-c | `## 11. ` 以降に title が "test" / "テスト" / "testing layer" を含む section 存在 | spec.parseFrontmatter (headings) |
| F2-d | F2-c 範囲内に `(unit\|integration\|e2e\|regression\|smoke)` 1+ match (case-insensitive) | spec.sectionBody |

### 2.3 性能要件 (spec §6.1)
- 全 7 check 実行 wall clock < 15s (spec 100 件想定、F6 fake mode)
- 各 check 個別 < 5s

### 2.4 監査ログ (spec §6.4)
`AuditLogPort.append()` を CLI run 末尾 1 回。production adapter は `.framework/audit/spec-audit-{YYYY-MM-DD}.jsonl` append。schema:
```json
{"ts":"...ISO...","opts":{...},"result_summary":{"passed":bool,"exit_code":0|2,"finding_count":N},"findings":[...]}
```

### 2.5 CI workflow (凍結、PR #137 §5.2/§5.3.1 per)

`.github/workflows/spec-audit.yml` 新規。**no-flag default、§5.3.1 per-file 自動選別を SSOT とする** (PR #137 §5.2 per)。

- **trigger paths (PR + push to main)**: `docs/spec/**`, `src/cli/commands/gate/**`, `src/cli/commands/gate/__fixtures__/**`, `package.json`, `package-lock.json`, `.github/workflows/spec-audit.yml`
- **steps (順序固定、CI runner network 不要を全 step で維持)**:
  1. `npm ci`
  2. `npm test -- validate-spec` (12 unit fixture + 2 integration smoke + 1 CLI e2e = 15、fake port wiring 済)
  3. `framework gate validate spec --base-ref=origin/main --link-probe=fake` — **no-flag default** (= §5.3.1 per-file 自動選別)、`--link-probe=fake` で network 排除
- **required status check**: PR で本 workflow を branch protection 必須登録 (別 ops、本 PR scope 内では workflow 設定までで OK)
- exit 2 → check fail → merge block

### 2.6 bootstrap mode (PR #137 §5.3.1 per)

`GitHistoryPort.isPreExistingSpec(path, baseRef)` の 3 分岐 (§5.3.1 literal):
- 戻り値 false (新規 spec or 既 file 改訂) → strict 対象
- 戻り値 true (base_ref より古い追加) → bootstrap 対象、fail を warn に降格

CLI option mapping は Invariant 2 per、CI default は no-flag (auto)。

## 3. Forbidden behavior (凍結、anti-patterns)

### 3.1 Past incident references

- ❌ **port バイパス禁止** (cycle 1 axis 5/6 per): `validateSpec()` 本体および 7 check sub-module で `node:fs` / `node:child_process` / `fetch` / `node:https` / `node:dns` 直 import / 呼出禁止。adapter 実装層 (`src/cli/commands/gate/adapters/`) のみ Node API 直呼び可
- ❌ **既 framework gate CLI 破壊** (PR #104 起点): `src/cli/commands/gate/index.ts` の既存 subcommand 削除 / signature 変更禁止
- ❌ **env var switch で 7 check 切替不可** (multi-LLM abstraction leak smell、CEO 2026-04-23): 各 check 独立 module、`--check=` flag dispatch、`process.env.SPEC_CHECK_MODE` 等禁止
- ❌ **spec file write 禁止**: read-only、auto-fix は別 PR
- ❌ **honest 違反 PR description**: stub は明示 (`// TODO: ...`)、L1/L2 chain skip claim 禁止 (PR #134 / PR #137 cycle 1 incident pattern)
- ❌ **bootstrap 判定の二重定義禁止** (PR #137 §5.3.1 SSOT per): `GitHistoryPort.isPreExistingSpec` のみ正経路、check sub-module 内で git 直呼び禁止
- ❌ **`as` cast で型回避禁止** (cycle 6 axis 2 per): 公開 signature が raw `string | string[]` を受けるよう設計済 (Invariant 5)、test fixture や normalize 層で `as CheckName[]` / `as LinkProbeMode` 禁止

### 3.2 Scope exclusion

本 PR で **触らない** module:
- `src/cli/commands/discover/` / `generate/` / `audit/` / `run/`
- `src/dashboard/`

既 spec (`docs/spec/v1.2.{0,1,2,3,4,5}-*.md`) の内容修正禁止 (bootstrap で warn のみ、retrofit は別 PR)。

## 4. Test fixtures (凍結、merge gate)

### 4.1 Unit test fixtures (12 件、`as` cast 不要)

`src/cli/commands/gate/validate-spec.test.ts`、fake port (in-memory) で実行、Node API 未経由。

#### Common test setup
```ts
function makeFakeSpec(files: Array<{path: string; content: string}>): SpecRepositoryPort
function makeFakeGit(preExistingPaths: string[]): GitHistoryPort
function makeFakeLink(probes: Record<string, {ok: boolean}>): LinkProbePort
function makeFakeAudit(): AuditLogPort
```

#### Fixture 1: F1 ID 重複 → fail
```gherkin
Given fakeSpec に dup-a.md / dup-b.md (id=SPEC-FOO-001 共通)
When validateSpec({check: 'id-uniqueness'}, ports)
Then exit_code === 2 / findings[0].check === 'id-uniqueness' / files == ['dup-a.md','dup-b.md'] / message includes 'Duplicate ID'
```

#### Fixture 2: F2 base section 欠如 → fail
```gherkin
Given fakeSpec の §1-§6 のみ (§7-§11 欠如)、metaSpec=false
When validateSpec({check: 'template-compliance'}, ports)
Then exit_code === 2 / message includes 'Missing sections'
```

#### Fixture 3: F2-a 受入基準 section 空白 → fail
```gherkin
Given fakeSpec に 1 file 'f2a.md' content:
"""
---
id: SPEC-FOO-003
status: Draft
---
## 0. メタ\n## 1. 目的\n## 2. 非目的\n## 3. ストーリー\n## 4. 要件\n## 5. 契約
## 6. 非機能\n## 7. 受入基準\n
\n
## 8. 前提\n## 9. リスク\n## 10. 制御機構\n## 11. testing layer\n- unit
"""
And fakeSpec.parseFrontmatter('f2a.md').metaSpec === false
When validateSpec({check: 'template-compliance'}, ports)
Then result.exit_code === 2
And findings.length === 1
And findings[0].check === 'template-compliance'
And findings[0].severity === 'fail'
And findings[0].files == ['f2a.md']
And findings[0].message includes 'F2-a' and '§7' and 'empty'
```

#### Fixture 4: F2-b Gherkin 不在 → fail
```gherkin
Given fakeSpec に 1 file 'f2b.md' content:
"""
---
id: SPEC-FOO-004
status: Draft
---
## 0. メタ\n## 1. 目的\n## 2. 非目的\n## 3. ストーリー\n## 4. 要件\n## 5. 契約
## 6. 非機能
## 7. 受入基準\n受入基準は run pass で達成される(prose only、Given/When/Then なし)
## 8. 前提\n## 9. リスク\n## 10. 制御機構\n## 11. testing layer\n- integration
"""
And metaSpec === false
When validateSpec({check: 'template-compliance'}, ports)
Then result.exit_code === 2
And findings.length === 1
And findings[0].check === 'template-compliance'
And findings[0].severity === 'fail'
And findings[0].files == ['f2b.md']
And findings[0].message includes 'F2-b' and 'Gherkin'
```

#### Fixture 5: F2-c §11 testing layer section 不在 → fail
```gherkin
Given fakeSpec に 1 file 'f2c.md' content:
"""
---
id: SPEC-FOO-005
status: Draft
---
## 0. メタ\n## 1. 目的\n## 2. 非目的\n## 3. ストーリー\n## 4. 要件\n## 5. 契約
## 6. 非機能\n## 7. 受入基準\nGiven X\nWhen Y\nThen Z
## 8. 前提\n## 9. リスク\n## 10. 制御機構
(§11 完全不在)
"""
And metaSpec === false
When validateSpec({check: 'template-compliance'}, ports)
Then result.exit_code === 2
And findings.length === 1
And findings[0].check === 'template-compliance'
And findings[0].severity === 'fail'
And findings[0].files == ['f2c.md']
And findings[0].message includes 'F2-c' and 'testing layer' and 'missing'
```

#### Fixture 6: F2-d layer 明示なし → fail
```gherkin
Given fakeSpec に 1 file 'f2d.md' content:
"""
---
id: SPEC-FOO-006
status: Draft
---
## 0. メタ\n## 1. 目的\n## 2. 非目的\n## 3. ストーリー\n## 4. 要件\n## 5. 契約
## 6. 非機能\n## 7. 受入基準\nGiven X\nWhen Y\nThen Z
## 8. 前提\n## 9. リスク\n## 10. 制御機構
## 11. testing notes\nテスト方針はあとで決める (unit/integration/e2e/regression/smoke いずれも不在)
"""
And metaSpec === false
When validateSpec({check: 'template-compliance'}, ports)
Then result.exit_code === 2
And findings.length === 1
And findings[0].check === 'template-compliance'
And findings[0].severity === 'fail'
And findings[0].files == ['f2d.md']
And findings[0].message includes 'F2-d' and 'no testing layer declared'
```

#### Fixture 7: F3 bundle 例外明示なし → fail
```gherkin
Given frontmatter id 複数 (SPEC-FOO-001, SPEC-FOO-002) + Bundle 例外 section 不在
When validateSpec({check: 'one-id-per-file'}, ports)
Then exit_code === 2 / message includes 'Multiple IDs without exception'
```

#### Fixture 8: bootstrap で fail → warn 降格
```gherkin
Given fakeSpec 1 file (legacy.md、§10 不在で F4 fail) + fakeGit isPreExistingSpec('legacy.md','main')→true
When validateSpec({check: 'control-mechanism', bootstrap: true}, ports)
Then exit_code === 0 / findings[0].severity === 'warn' / files == ['legacy.md']
```

#### Fixture 9: usage error (--strict + --bootstrap)
```gherkin
Given ports any
When validateSpec({strict: true, bootstrap: true}, ports)
Then exit_code === 2 / findings[0].check === 'usage' / message includes 'mutually exclusive' / fakeSpec.list 未呼出
```

#### Fixture 10: usage error (invalid CheckName) — `as` cast 不要 ✅
```gherkin
Given ports any
When validateSpec({check: ['id-uniqueness', 'bogus-check']}, ports)  // raw string、cast 不要
Then exit_code === 2 / findings[0].check === 'usage' / message includes 'unknown check name: bogus-check'
```

#### Fixture 11: usage error (invalid linkProbe) — `as` cast 不要 ✅
```gherkin
Given ports any
When validateSpec({linkProbe: 'invalid'}, ports)  // raw string
Then exit_code === 2 / findings[0].check === 'usage' / message includes 'invalid --link-probe value'
```

#### Fixture 12: meta_spec exception → §12-§14 欠如許容 (PR #137 patch 検証)
```gherkin
Given fakeSpec.parseFrontmatter('meta-spec.md').metaSpec === true
And fakeSpec の §0-§11 のみ (§12-§14 欠如)
When validateSpec({check: 'template-compliance'}, ports)
Then exit_code === 0 / findings.length === 0
```

### 4.2 Integration smoke (snapshot corpus、literal 固定、network 不要)

`src/cli/commands/gate/__fixtures__/corpus-v1/` に以下 5 spec file + `git-history.json` を commit:

| # | file | metaSpec | preExisting (in git-history.json) | 期待 finding profile |
|---|---|---|---|---|
| 1 | `corpus-v1/legacy-1.md` | false | true | F4 §10 不在で warn (bootstrap 降格) 1 件 |
| 2 | `corpus-v1/legacy-2.md` | false | true | F7 ambiguous DoD で warn 1 件 (bootstrap でも warn 維持、Invariant 1 per) |
| 3 | `corpus-v1/normal-new.md` | false | false | (新規 spec、§0-§11 完備、Gherkin 含、testing layer=unit) → finding 0 件 (pass) |
| 4 | `corpus-v1/meta-spec-new.md` | true | false | (新規 meta-spec、§0-§11 のみ、§12-§14 欠如) → F2 exception で finding 0 件 |
| 5 | `corpus-v1/duplicate.md` | false | false | (新規 spec、id="SPEC-FOO-005" を normal-new.md と共有) → F1 fail 1 件 |

**Smoke A (no-flag default、auto select)**:
```
framework gate validate spec --base-ref=corpus-base --link-probe=fake (CI default)
```
- 期待 exit_code: 2 (F1 duplicate.md fail が strict 対象)
- 期待 findings count: **3 件** (legacy-1 F4 warn × 1 + legacy-2 F7 warn × 1 + duplicate↔normal-new F1 fail × 1; F1 は 1 finding に `files: ['duplicate.md','normal-new.md']` を併記; meta-spec-new pass)
- 期待 audit_log_path: 非 sentinel (`.framework/audit/...`)

**Smoke B (`--bootstrap` 強制)**:
```
framework gate validate spec --base-ref=corpus-base --link-probe=fake --bootstrap
```
- 期待 exit_code: 0 (全 file warn 降格、F1 duplicate.md も warn 化)
- 期待 findings count: **3 件** (全 warn、内訳 Smoke A と同 3 件、severity のみ降格)

現 repo 状態 (`docs/spec/*.md`) 直依存禁止、snapshot corpus のみ。`git-history.json` schema:
```json
{"preExistingPaths": ["corpus-v1/legacy-1.md", "corpus-v1/legacy-2.md"], "baseRef": "corpus-base"}
```
fakeGit adapter は本 file を読んで `isPreExistingSpec()` 戻り値を決定。

### 4.3 CLI parser e2e fixture (cycle 7 axis 7 fix per、CI 経路 merge gate)

`src/cli/commands/gate/cli.test.ts` で **CLI parser を介した end-to-end** test 1 件:

```gherkin
Given CLI を `framework gate validate spec --check=id-uniqueness,bogus-check --link-probe=fake` で起動
When parser が syntactic split → validateSpec 呼出
Then process exit code === 2 / stderr includes 'unknown check name: bogus-check'
```

### 4.4 CI 要件
- `.github/workflows/spec-audit.yml` job が PR で green でなければ merge block
- `npm test -- validate-spec` で 12 unit fixture + 2 integration smoke (Smoke A/B) + 1 CLI e2e = 15 全 pass

## 5. Open decisions (implementer 自由)

以下のみ implementer 裁量、列挙外は暗黙凍結:

- 4 port の adapter 実装内部 (markdown parse: `unified`/`remark`/regex、git: `simple-git`/`execFile` 等)。port interface 自体は §1.1 凍結
- 依存追加は package.json diff で明示
- audit log JSON の `extra` field 追加可、core schema は維持
- error message 文言詳細 (fixture の `includes` 満たせば自由)
- 内部 cache (LinkProbe memoize 等) の有無
- test fake port helper 名 / module 構成

---

## Escalation 経路 (6-section discipline)

- §1-§4 凍結部分の解釈で迷う → adf-lead に escalate
- spec 自体に gap → adf-lead 経由 ARC 差戻し (PR #137 で解消済、再発時は同経路)
- 既 framework gate CLI への破壊 → adf-lead 経由 CTO escalate

## Pre-impl gate (auditor 7 項目監査)

cycle 7 (本 file)、auditor cycle 7 監査依頼予定。期待 7/7 PASS。

— adf-lead cycle 9 (2026-05-12 CTO `5d1a5316` per、CEO `b6fbeb8c` 線、auditor cycle 8 `5eda1b0c` 3 sub-finding 局所 fix per)
