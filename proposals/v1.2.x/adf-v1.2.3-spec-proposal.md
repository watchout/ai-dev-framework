# ADF v1.2.3 spec 起票文書

> 作成日: 2026-05-07
> 起票者: agent-com 本日 3 bug 全数見逃し + CTO 自認の test 構造 gap (本日 hearing) + CEO 提起 (test 漏れ防止)
> 引き渡し先: ADF (ai-dev-framework) 起草担当 ARC
> 前提: ADF v1.2.0 / v1.2.1 / v1.2.2 が release 済または実装中
> 関連: adf-v1.2.x-spec-proposal.md (v1.2.1 / v1.2.2 の上位 file)、cto-directive-hook-planmode-verify.md (当面運用)

---

## 0. 背景 (なぜ v1.2.3 が必要か)

### 0.1 agent-com 本日事象 [文献確認 CTO honest hearing 2026-05-07]

agent-com で本日 3 bug を全数見逃し、post-merge で発覚:

- B1: tmux Enter not pressed (実環境のみ発生、fake では catch 不可)
- B2-B3: その他 launchd / wake daemon 関連環境特有 bug

CTO 自認の root cause:
> 「実 tmux / 実 launchd / 実 bot 反応の E2E test 不在」

### 0.2 CTO の現状 4 layer testing の gap

| Layer | 内容 | 漏れた範囲 |
|---|---|---|
| Layer 1 (Contract test) | DI fake で 40 test pass | 「呼び出し record」のみで実環境 verify せず |
| Layer 2 (CI gate) | tsc / lint / bun test | launchd (macOS) / 実 tmux 未実行、Ubuntu CI で検出不可 |
| Layer 3 (Manual smoke) | bun test 実行 | Layer 1 の再実行、production-like verify なし |
| Layer 4 (Phase 0 verify) | CTO 自由意志で実施 | metric `result='ok'` のみで PASS、「やったつもり」 verify |

**Layer 5 (E2E in production-like) が完全不在** = 本日 3 bug 見逃しの直接原因。

### 0.3 CTO 提案 5 項目を ADF spec として正式化

[文献確認 CTO msg `a0707a8d`] CTO は以下 5 項目を「新 test 規格」として提案:

1. launchd integration test
2. E2E wake verification
3. tmux send-keys submission test
4. CTO L3 routine = 3-evidence verify
5. Phase 0 verify mandatory

これらを SPEC-DOC4L-010 (Layer 5) と SPEC-DOC4L-011 (Verify 4-evidence) に統合し、ADF v1.2.3 として spec 化する。

### 0.4 v1.2.3 の役割 (v1.2.4 との対比)

| 軸 | v1.2.3 (本 spec) | v1.2.4 |
|---|---|---|
| 抽象度 | 個別 (agent-com 由来) | 普遍 (全 project 適用) |
| timing | 即実証 (1-2 週間) | 中期 (3-6 ヶ月) |
| 実装難度 | 低-中 | 高 |
| dogfooding 先 | agent-com | haishin-puls-hub / hotel-kanri / 全 project |

v1.2.3 は agent-com の即時火消し、v1.2.4 が IYASAKA 全 project の長期方法論。

---

## SPEC-DOC4L-010: Production-like E2E Test Layer

### 1. 目的

agent-com 本日 3 bug 全数見逃しの構造原因 = **chain 全体 (DB→wake→tmux→bot→reply) の E2E test 不在** を解決する。

CTO 自認の 4 layer (Contract / CI / Manual smoke / Phase 0) では検出不可能な **環境特有 bug** (launchd / 実 tmux / 実 wake daemon) を catch する Layer 5 を ADF 標準として spec 化。

### 2. 機能要件

#### 2.1 F1: self-hosted runner template

ADF が `templates/runner/macos/` に self-hosted runner setup を提供:

- mac mini ベースの GitHub Actions self-hosted runner
- launchd / tmux / 実 PostgreSQL access 可能
- secret management (DB 接続 / GitHub token) 標準化
- runner 自体の health check + auto-restart

理由: GitHub Actions Ubuntu runner では launchd / tmux が動かない。macOS 専用の self-hosted runner が必須。

#### 2.2 F2: framework verify e2e コマンド

```bash
framework verify e2e <test-id>
  → DB INSERT pending → 60s 内 status='replied' verify → tmux pane verify
  → 全 step pass で exit 0、1 件でも fail で exit 1
  → 実行 log を .framework/verify-logs/<test-id>-<timestamp>.log に保存
```

実装:
- DB INSERT (test fixture row)
- N 秒待機 (configurable)
- DB query で status verify
- tmux capture-pane で expected pattern verify
- 全 evidence を 4-axis format で literal 出力

#### 2.3 F3: tmux pane assert helper

```bash
framework tmux-assert <pane-id> <pattern> [--timeout 60]
  → tmux capture-pane を timeout 内に retry しながら実行
  → pattern 一致したら exit 0、timeout で exit 1
  → 実 tmux 環境必須 (CI Ubuntu では使えない)
```

#### 2.4 F4: launchd plist install + bootstrap automation

```bash
framework launchd-test <plist-path>
  → launchctl bootstrap で daemon 起動
  → 30s 待って pgrep verify
  → log file の non-empty + ERROR 不在 verify
  → test 終了時に teardown (launchctl bootout)
```

#### 2.5 F5: CI integration

`.github/workflows/e2e-self-hosted.yml` template:

```yaml
on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: [self-hosted, macOS]
    steps:
      - uses: actions/checkout@v4
      - run: framework verify e2e <test-id>
      - if: failure()
        run: # PR comment + Discord notify
```

PR merge gate に required check として追加。

### 3. 非機能要件

- F1-F5 が agent-com / 配信プラスHub / hotel-kanri 等 mac mini で動く全 project に適用可能
- E2E test 実行時間 < 5 分 / 件
- self-hosted runner の uptime 95%+
- runner 障害時は CI に明示的 error 表示 (silent fail 禁止)

### 4. 完了条件

- agent-com で本日 3 bug の全てを Layer 5 test で再現可能
- agent-com で post-merge bug 0 件 (1 週間継続)
- self-hosted runner template が haishin-puls-hub でも動作確認

### 5. 実装順序

1. Day 1-3: self-hosted runner setup + framework verify e2e 試作
2. Day 4-7: agent-com で本日 3 bug の re-create test 実装
3. Day 8-14: 1 週間 dogfooding + violation count 計測
4. Day 15: dogfooding レポート作成 + v1.2.4 設計に move

---

## SPEC-DOC4L-011: Verify 4-Evidence Discipline

### 1. 目的

CTO 自認の「動いた」「PASS」「完了」 surface-level 判断 (本日 metric `result='ok'` のみで PASS 判断) を構造的に防止。

「成功」発言には 4 軸 (metric / DB invariant / tmux pane / spec compliance) の literal evidence を hook で強制。

### 2. 機能要件

#### 2.1 F1: 「成功発言」 intercept hook

Stop hook に「成功発言」 intercept logic:

```bash
.framework/hooks/verify-evidence-check.sh

bot output から「成功」 pattern を regex 抽出:
  - 「動いた」「PASS」「完了」「OK」「verify 完了」「pilot 成功」など

直前 N turn の transcript から 4 軸 literal evidence を抽出:
  - [検証済 metric output] ...
  - [検証済 DB invariant] ...
  - [検証済 tmux pane] ...
  - [検証済 spec compliance] ...

不足軸があれば exit 2 で block:
  {"decision": "block", "reason": "4-evidence missing: <list of missing axes>"}
```

#### 2.2 F2: 4-evidence の literal format 規定

```
[検証済 metric output]:
  cmd: <command>
  result: <literal output>

[検証済 DB invariant]:
  query: <SQL>
  result: <literal row data>

[検証済 tmux pane]:
  cmd: tmux capture-pane -p -t <pane>
  match: <grep pattern hit>

[検証済 spec compliance]:
  section: <spec file:line>
  requirement: <literal 引用>
```

#### 2.3 F3: Regression test merge gate

```bash
.github/workflows/regression-gate.yml

PR diff から bug fix を推定:
  - commit message に "fix:" があるか
  - PR title に "fix" / "bug" があるか

bug fix と判定された PR には:
  - tests/regression/test_<bug-id>.sh 形式の new file が含まれているか check
  - 不在なら merge block
```

#### 2.4 F4: Spec 完了条件 literal validator

```bash
framework verify spec-completion <spec-file>
  → 「## 完了条件」 section を抽出
  → 各項目が literal verify 手順を含むか check
    - 「test/...sh → exit 0」
    - 「psql query → 期待値」
    - 「tmux capture → pattern」
    - 「pgrep」「log grep」 等
  → ambiguous (「OK」「動く」のみ) は warning
```

### 3. 完了条件

- agent-com で「動いた」発言の 95%+ が 4-evidence 付き (1 ヶ月)
- bug regression test の追加率 90%+ (1 ヶ月)
- 既存 spec の「完了条件」 literal 化率 80%+ (1 ヶ月)

---

## ADF への引き渡し条件

ARC が本 spec を ADF SPEC.md に取り込む際、以下を確認:

1. **既存 ADF v1.2.0 / v1.2.1 / v1.2.2 SPEC.md との整合性**
   - SPEC-DOC4L-010 / 011 ID が既存 ID 群と衝突しないか
   - hooks (v1.2.1) と E2E (v1.2.3) の責務分担が明確か

2. **dogfooding 順序**
   - v1.2.0 → v1.2.1 → v1.2.2 → v1.2.3 を順次 release 推奨
   - v1.2.3 は agent-com で先行 dogfooding 可能 (即実証性あり)

3. **agent-com への展開タイミング**
   - v1.2.3 完了で agent-com Phase C 完了条件達成
   - v1.2.3 dogfooding 結果を v1.2.4 設計に反映

4. **CTO directive (cto-directive-hook-planmode-verify.md) との整合**
   - 当面運用 (重要事項 4: Test 漏れ防止) を v1.2.3 で正式化
   - dogfooding は CTO directive の 7 日 task と並行

---

## 改訂履歴

- 2026-05-07: 初版、agent-com 本日 3 bug 全数見逃し + CTO 5 項目提案を v1.2.3 として spec 化
