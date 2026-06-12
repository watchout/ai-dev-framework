# ADF 配布 VERIFY

> doc4l 4-layer / VERIFY layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md (AC-D1〜AC-D6)
> 対応 IMPL: ./IMPL.md (Phase 0〜5)
> 関連: OPS.md (同 directory)

本 VERIFY は SPEC AC-D1〜AC-D6 を deterministic に検証する test plan、および IMPL.md の各 Phase 完了判定基準を定義する。

---

## §1 検証戦略

4 layer で検証する [文献確認: SPEC §7 / IMPL §3 Phase 構造]:

```
Layer A: unit test (vitest)        — adapter interface / loader / default 実装
Layer B: contract test             — adapter 切替の挙動 (各 adapter 実装が core interface 契約を満たす)
Layer C: integration test (CI)     — fresh project install path / fresh-clone smoke
Layer D: dogfooding observational   — 内部全 bot 配布の wave 段階展開で実運用挙動
```

---

## §2 必須テストケース (Layer A: unit test)

### §2.1 Adapter interface (`src/cli/adapters/types.test.ts` および各 adapter 実装 test)

| テスト | 対象 | 期待結果 | 対応 SPEC AC |
|---|---|---|---|
| T-A1-01 | `Notifier` interface 型定義 | `notify(channel, message, opts?)` のシグネチャを compiler が enforce | AC-D3 |
| T-A1-02 | `StateStore` interface | `get<T> / set<T> / delete` の async signature | AC-D3 |
| T-A1-03 | `TaskTracker` interface | `getActiveTask / updateTask / listTasks` の signature | AC-D3 |

### §2.2 Default 実装 (`src/cli/adapters/defaults.test.ts`)

| テスト | 入力 | 期待結果 |
|---|---|---|
| T-A2-01 | `notifier("console")` で `notify("test", "msg")` | stdout に `[test] msg` 出力 |
| T-A2-02 | `notifier("no-op")` で `notify(...)` | 副作用なし、resolve のみ |
| T-A2-03 | `stateStore("local-file")` で `set("key", val) → get("key")` | val が返る |
| T-A2-04 | `stateStore("local-file")` で `delete` 後の `get` | null が返る |
| T-A2-05 | `taskTracker("github-issues")` の `getActiveTask` | gh CLI 不在時は明確なエラー (silent fallback 禁止) [文献確認: memory `feedback_no_silent_fallback.md`] |

### §2.3 Adapter loader (`src/cli/adapters/loader.test.ts`)

| テスト | 入力 | 期待結果 |
|---|---|---|
| T-A3-01 | `config.json` に `adapters: {notifier: "console"}` | default の console notifier が返る |
| T-A3-02 | `config.json` に存在 package 名 (`@test/fake-notifier`) | dynamic import が走り、export default の Notifier が返る |
| T-A3-03 | `config.json` 不在 | 全 adapter が default に fallback (no-op / console / local-file / github-issues) |
| T-A3-04 | adapter 名が無効 (typo / 存在しない package) | 明確なエラー (silent fallback 禁止) |

### §2.4 既存テストの非干渉確認

| テスト | 期待結果 |
|---|---|
| 既存 `gate-spec-validator.test.ts` (PR #104) 全 PASS | adapter 導入前後で挙動不変 |
| 既存 `llm-provider.test.ts` 全 PASS | LLMProvider は本 SPEC の adapter pattern に既に整合 [文献確認: PR #52 改修 D / `adf-dev-state.md`] |
| 既存 `profile-model.test.ts` 全 PASS | profile 機構は adapter と独立 |

---

## §3 Contract test (Layer B: 各 adapter 実装が interface 契約を満たす)

### §3.1 internal config layer の adapter (`@iyasaka/adf-internal-config`)

[文献確認: SPEC FR-D2.1 / IMPL §2.2]

| テスト | 入力 | 期待結果 |
|---|---|---|
| T-B1-01 | `agent-comms-adapter` で `notify("dev-arc", "test")` | agent-comms-mcp の send tool 経由で投稿される (test 環境では mock で確認) |
| T-B1-02 | `agent-memory-adapter` で `set("k", v) → get("k")` | agent-memory の save_knowledge / get_knowledge 経由で永続 |
| T-B1-03 | timeout 5s 超過 | 明確なエラー throw、retry なし [文献確認: SPEC FR-D2.1 + memory `feedback_no_silent_fallback.md`] |
| T-B1-04 | mention agent_id (`["cto"]`) で notify | Discord push 通知届く (smoke、Layer C で検証) |
| T-B1-05 | snowflake ID を mentions に渡す | エラー or 警告 [文献確認: memory `feedback_agent_id_mentions.md`] |

### §3.2 Default github-issues adapter

| テスト | 入力 | 期待結果 |
|---|---|---|
| T-B2-01 | `getActiveTask()` で `status:in-progress` label 付き issue が 1 件存在 | その issue が Task object で返る |
| T-B2-02 | 該当 issue 0 件 | null が返る |
| T-B2-03 | `gh` CLI 不在 | 明確なエラー (silent fallback 禁止) |

---

## §4 Integration test (Layer C: CI / fresh project)

### §4.1 Fresh project install path (AC-D1)

```bash
# C-01: Stage A install (internal config layer 同時)
mkdir /tmp/iyasaka-fresh && cd /tmp/iyasaka-fresh
npm init -y
npm install @watchout/adf @iyasaka/adf-internal-config
npx framework init --profile=hp
test -f .framework/project.json
test -f .framework/config.json
grep -q '"notifier": "@iyasaka' .framework/config.json
npx framework gate b
# 期待: exit 0
```

### §4.2 ADF core 単独動作 (AC-D2)

```bash
# C-02: Stage B 単独 install (internal config layer 不在)
mkdir /tmp/oss-fresh && cd /tmp/oss-fresh
npm init -y
npm install @watchout/adf
npx framework init --profile=cli
npx framework gate a
npx framework gate b
npx framework gate c
# 期待: 全 exit 0
# 期待: notifier / stateStore は no-op default、エラーにならない
```

### §4.3 Adapter 切替 (AC-D3)

```bash
# C-03a: internal adapter 設定
echo '{"adapters":{"notifier":"@iyasaka/adf-internal-config/notifier"}}' > .framework/config.json
npx framework gate spec
# 期待: agent-comms-mcp 経由で notify (test 環境で mock 観測)

# C-03b: console adapter 設定
echo '{"adapters":{"notifier":"console"}}' > .framework/config.json
npx framework gate spec
# 期待: stdout 出力 (agent-comms-mcp 呼出 0)
```

### §4.4 Internal-agnostic core 検査 (AC-D4)

```bash
# C-04: OSS readiness checker (CI で自動)
bash scripts/check-oss-readiness.sh
# 期待: 内部固有名詞 (iyasaka|watchout|hotel-kanri|haishin-puls-hub|wbs|agent-comms-mcp|agent-memory) の grep 結果が src/ + templates/ 配下で 0 件
# 例外: docs/specs/distribution/* は exclude (本 SPEC 自身が言及するため)
```

### §4.5 ADF self-hosting (AC-D5)

```bash
# C-05: ADF 自身の Gate
cd ~/Developer/ai-dev-framework
npx tsx src/cli/index.ts gate a
npx tsx src/cli/index.ts gate b
npx tsx src/cli/index.ts gate c
# 期待: 全 PASS (Issue #105 merge 後に成立)
```

[検証済 observed: 現状 Gate B FAILURE = `.framework/project.json not found`、Issue #105 で解消予定]

### §4.6 Upgrade path (AC-D6)

```bash
# C-06: Stage A upgrade smoke (内部 project)
cd ~/Developer/iyasaka  # 既存 project
git status  # clean 確認
npm update @watchout/adf @iyasaka/adf-internal-config
npx framework gate b
# 期待: PASS、既存 PR の挙動不変
```

[推測 unverified: route:fast-merge 範囲の version bump で smoke、route:ceo-approval 級の breaking change は別途検証]

---

## §5 Dogfooding 観測 (Layer D)

### §5.1 wave 段階展開 (IMPL Phase 5)

[文献確認: distribution/IMPL.md Phase 5]

```gherkin
Given Phase 4.4 (各 project install + smoke) が wave 1 (1 project) で PASS
When wave 2 (主系統 3 project) に展開
Then 全 project で `framework gate b` PASS
And agent-comms / agent-memory 連携が機能 (実 send / 実 set 観測)
And notifier 失敗時の挙動が「明確エラー」(silent fallback なし)
```

### §5.2 OSS 公開 dry-run (Stage B 準備、merge 前提なし)

```gherkin
Given core 部分のみ抽出した tarball を fresh clone した想定環境
When `npm install ./adf-core.tgz` で install
And `framework init` で初期化
Then internal config layer 不在で初期化成功
And 内部固有名詞 grep が 0 件 (AC-D4)
```

[推測 unverified: OSS 公開タイミング決定後に Stage B verification 詳細化]

### §5.3 観測指標 (本 SPEC 効果検証)

| 指標 | 計測方法 | 目標 (推測) |
|---|---|---|
| Stage A install 成功率 (各 project) | CI smoke ログ集計 | 95%+ |
| adapter 切替 false negative (internal 設定で console 動作等) | smoke ログ + adapter loader log | 0% |
| OSS readiness checker 違反 (CI fail 件数) | gh run list `--workflow=oss-readiness.yml` | 検出された違反は merge 前に修正 |
| 内部 project の SSOT drift (本 SPEC 適用後) | `framework spec validate` 結果集計 | baseline と同等以下 |

[文献確認: memory `feedback_no_time_concept.md` で時刻 cadence 表現を避ける、計測は件数 / 比率ベース]

---

## §6 受入チェックリスト (Phase ごと)

### Phase 0 完了 (`.framework/project.json` bootstrap)

- [ ] `.framework/project.json` 作成、`profileType=cli`
- [ ] ADF 自身の Gate B が PASS
- [ ] Issue #105 merge

### Phase 1 完了 (Adapter interface 抽出)

- [ ] T-A1-01〜03 / T-A2-01〜05 / T-A3-01〜04 全 PASS
- [ ] tsc --noEmit clean
- [ ] 既存テスト全 PASS (§2.4)

### Phase 2 完了 (既存 core を adapter 経由に refactor)

- [ ] gate.ts 内の通知が Notifier 経由
- [ ] state 永続化箇所が StateStore 経由
- [ ] GitHub Issue 操作が TaskTracker 経由
- [ ] behavior 不変確認 (既存 e2e / contract test 全 PASS)

### Phase 3 完了 (OSS readiness)

- [ ] `scripts/check-oss-readiness.sh` 動作 (Layer C C-04 PASS)
- [ ] CI workflow `oss-readiness.yml` が PR で trigger
- [ ] 内部固有名詞 hardcode が 0 件

### Phase 4 完了 (internal config layer)

- [ ] `iyasaka-adf-internal-config` repo 公開
- [ ] T-B1-01〜05 contract test PASS
- [ ] 各 adapter 実装が core interface 契約を満たす

### Phase 5 完了 (Stage A 全 bot 展開)

- [ ] wave 1 / 2 / 3 で各 project の `framework gate b` PASS
- [ ] adapter 連携の実観測 (mock でなく実 send / set)
- [ ] §5.3 観測指標が目標達成

---

## §7 失敗時の対応

| 観測される失敗 | 想定原因 | 対応 |
|---|---|---|
| Layer C C-02 (OSS 単独 install) で Gate fail | core が internal infra に hardcode 依存 | check-oss-readiness で grep 漏れ修正 |
| T-B1-01 で agent-comms-adapter が timeout 連発 | network / DB 問題 | adapter level で fail-fast、retry なし [文献確認: SPEC FR-D2.1] |
| Phase 5 wave 2 で 1 project で `framework gate b` fail | project 固有の `.framework/config.json` 設定 / migration 漏れ | wave 2 → wave 1.5 に rollback、project 個別 fix |
| OSS readiness checker false positive (legitimate な内部 reference を BLOCK) | regex 過敏 | exclude pattern 追加 (`docs/specs/distribution/` 等)、test fixture 追加 |
| adapter loader が dynamic import で fail (npm 公開後の install path 解決) | bundler / monorepo / hoisting 問題 | adapter 配置を package 名指定に統一、相対パス禁止 |

[文献確認: distribution/IMPL §1.2 [推測 unverified: adapter loader の dynamic require は npm 公開後に install path 解決を smoke で確認必要]]

---

## §8 ロールバック判断

[文献確認: distribution/SPEC §6.4 OSS 公開要件 / OPS.md ロールバック (本 directory)]

Phase 別 rollback:
- Phase 0 (bootstrap): `.framework/project.json` を git revert、Gate B 再 FAILURE 戻り (一時的)
- Phase 1 (adapter interface): 新規ファイル削除、既存 core 影響なし
- Phase 2 (refactor): 各 PR の revert で behavior 復元 (1 PR 1 concern なので局所)
- Phase 3 (OSS readiness): `oss-readiness.yml` を required check 外す、CEO 承認
- Phase 4 (internal layer): `@iyasaka/adf-internal-config` の version pin、ADF core は影響なし
- Phase 5 (展開): 該当 project の `.framework/config.json` から `adapters` field 削除で default 動作に戻る

---

## Evidence label legend

- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
