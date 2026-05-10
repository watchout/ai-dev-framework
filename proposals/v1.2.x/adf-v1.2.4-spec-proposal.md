# ADF v1.2.4 spec 起票文書

> 作成日: 2026-05-07
> 起票者: CEO 提起 (本日 conversation: 「実装後 test しても漏れる、構造的に防ぐ規格は?」)
> 引き渡し先: ADF (ai-dev-framework) 起草担当 ARC
> 前提: ADF v1.2.0 / v1.2.1 / v1.2.2 / v1.2.3 が release 済または実装中
> 関連: adf-v1.2.x-spec-proposal.md (v1.2.1 / v1.2.2)、adf-v1.2.3-spec.md (個別 test 規格)

---

## 0. 背景 (なぜ v1.2.4 が必要か)

### 0.1 v1.2.3 だけでは agent-com 個別の解 [文献確認 v1.2.3 spec §0.4]

v1.2.3 (SPEC-DOC4L-010 + 011) は agent-com の今すぐの稼働に最低限必要な test 規格:
- Production-like E2E Test Layer (Layer 5)
- Verify 4-Evidence Discipline

これは「agent-com で発生した bug pattern」 への対処であり、**新規実装にも漏れない構造的 frame** ではない。

### 0.2 CEO 提起の核心

[文献確認 CEO message] CEO の問い:

> 「どのような実装に対しても漏れが出ないようなテストを組み立てるために、現状にプラスする規格や概念のようなものはある?」

これは **「個別問題を解く」 vs 「構造的に再発させない方法論を作る」** の違い。v1.2.3 が前者、v1.2.4 が後者。

### 0.3 業界標準の test design 規格を ADF 配下に取り込む

[文献確認 testRigor / TestFort / SeaLights / Mike Cohn / Kent C. Dodds] 業界で確立された test 設計規格:

| 規格 | 内容 | v1.2.4 SPEC |
|---|---|---|
| Coverage Gap Analysis (4 種) | Coverage / Environment / Tooling / Skill | SPEC-DOC4L-012 |
| Behavior-Driven Development | Given/When/Then で要件 ↔ test 1:1 | SPEC-DOC4L-013 |
| Property-Based Testing | invariant を 1000 通りで verify | SPEC-DOC4L-014 |
| Traceability Matrix | 要件 ↔ test ↔ code の 3 者 link | SPEC-DOC4L-015 |

これらは industry standard だが、IYASAKA で current 不在。ADF v1.2.4 で正式 spec 化する。

### 0.4 v1.2.4 完了の意義

v1.2.4 が完成すると:

- IYASAKA 全 project (agent-com / 配信プラスHub / hotel-kanri / wasurezu / 他) で同じ test 規格運用
- 新規実装に対する漏れが構造的に防止される
- 「agent org-in-a-box」仮説の方法論 layer に test 設計規格が加わる
- Anthropic / Google にも無い IYASAKA の moat になる

---

## SPEC-DOC4L-012: Test Coverage Gap Discipline

### 1. 目的

[文献確認 testRigor https://testrigor.com/blog/gap-analysis-in-qa/] 実装ごとに同じ漏れを繰り返さない構造的 frame として、4 ギャップ分析 (Coverage / Environment / Tooling / Skill) を全実装に必須化。

industry standard の Test Gap Analysis を ADF 配下に取り込む。

### 2. 機能要件

#### 2.1 F1: framework verify-coverage コマンド

```bash
framework verify-coverage <feature> --gap [coverage|env|tool|skill|all]

評価軸:
  coverage: 業務 flow 全体が test されているか
    - spec の各 AC ID に対応する test ID 存在 check
    - 不在なら fail
  env: test 環境 ≒ 本番か
    - CI と本番の OS / DB / tool の diff 検出
    - DI fake と実環境の diff を FAKE_LIMITATION comment から抽出
  tool: CI / DB / 本番 tool 連携が機能するか
    - test fixture が runtime 統合 verify 含むか
    - self-hosted runner / 実 DB access 確認
  skill: 必要な test 技法を team が持つか
    - E2E / property test / mutation test の存在 check
    - 各 test 種別の coverage 比率
```

#### 2.2 F2: Test pyramid 構成比 monitoring

[文献確認 Mike Cohn 2009 / Kent C. Dodds 2018]

```bash
framework metrics test-pyramid

出力 (例):
  Static:        125 tests
  Unit:          340 tests (60%)
  Integration:    45 tests (8%)
  E2E:             5 tests (1%) ← warning
  Property:        0 tests       ← warning
  Mutation:        0 tests       ← warning
  
  偏り検出:
    Unit > 80% かつ E2E < 5% → warning「pyramid 不均衡」
    Property test 不在 → warning「invariant 未 verify」
    Mutation test 不在 → warning「test robustness 未確認」
```

#### 2.3 F3: PR merge gate に 4 ギャップ評価レポート添付化

PR template (`.github/pull_request_template.md`) に「4 ギャップ評価」 section を強制:

```markdown
## 4 ギャップ評価

- [ ] Coverage gap: 業務 flow 全体 test 済 (該当 AC ID + test ID)
  AC-XXX-NNN ↔ test_xxx_nnn.sh
- [ ] Environment gap: 本番環境 ≒ test 環境 (差分明記)
  本変更が environment-dependent な要素 (launchd / tmux / 実 DB / 等) を含む?
- [ ] Tooling gap: tool 連携 verify 済
  CI で全 tool が動く? self-hosted runner 必要?
- [ ] Skill gap: 必要技法を team が持つ
  property test / mutation test / E2E が必要なら追加した?
```

不在なら CI で merge block (`framework pr-template-check` script で grep)。

### 3. 完了条件

- IYASAKA 全 project で 4 ギャップ評価 PR template 適用
- pyramid 不均衡 warning が出ても 1 month 以内に解消
- E2E 比率が 5%+ に到達 (全 project)

---

## SPEC-DOC4L-013: Behavior-Driven Specification

### 1. 目的

[文献確認 BDD industry standard、Cucumber / SpecFlow / pytest-bdd] spec の AC を Given/When/Then 形式で記述強制。要件 1 つに対し test が必ず存在する structure を mechanical 強制。

### 2. 機能要件

#### 2.1 F1: spec template に G/W/T 必須

ADF が `templates/spec/feature.md` に Acceptance Criteria section を必須化:

```markdown
## Acceptance Criteria

### AC-AGENTCOM-001
**Given**: state-daemon が launchd 経由で起動している
**When**: outbound_queue に新規 message が INSERT される
**Then**: 60 秒以内に bot が tmux 経由で reply を返し、status='replied' になる

**corresponding test**: tests/e2e/test_ac_agentcom_001.sh

### AC-AGENTCOM-002
...
```

各 AC は exactly 1 つの test ID と 1:1 対応。

#### 2.2 F2: 各 G/W/T に test ID 必須付与

ID 規約:
```
spec ID: AC-{FEATURE}-{NNN}
test file: tests/<level>/test_ac_{feature}_{nnn}.{sh|test.ts}
test 内 comment 必須: // AC: AC-{FEATURE}-{NNN}
```

#### 2.3 F3: framework trace verify で AC ↔ test ↔ code mechanical link

```bash
framework trace verify --include-ac

出力:
  AC-AGENTCOM-001: ✅ test exists, code path linked
    test: tests/e2e/test_ac_agentcom_001.sh
    code: src/wake-daemon.ts:42
  AC-AGENTCOM-002: ❌ test missing
  AC-AGENTCOM-003: ⚠️ test exists, code path unclear
    test: tests/integration/test_ac_agentcom_003.sh
    code: (no AC reference comment found)
```

#### 2.4 F4: 要件 1 つ対し test 不在を CI で block

orphan AC (test 不在) を含む PR は merge block:

```bash
framework verify ac-test-link
  exit 1 if any orphan AC
  → CI required check
```

### 3. 完了条件

- IYASAKA 全 project で AC ↔ test の 1:1 対応率 95%+
- orphan AC 件数 0 (1 ヶ月継続)

---

## SPEC-DOC4L-014: Property-Based Invariant Testing

### 1. 目的

[文献確認 fast-check / hypothesis / QuickCheck 等 property-based testing 標準] 個別ケース test では catch できない「組み合わせ穴」を 1000 通り random input で検出。

### 2. 機能要件

#### 2.1 F1: spec の「invariant」 section 必須化

ADF spec template に Invariants section:

```markdown
## Invariants

### INV-AGENTCOM-001
**性質**: 任意の outbound_queue row r について
**条件**: r.attempts > r.max_attempts
**結果**: r.status = 'failed'

### INV-AGENTCOM-002
**性質**: 任意の状態遷移 (s1 → s2)
**条件**: s1 = 'claimed'
**結果**: s2 ∈ {'replied', 'failed'}

### INV-AGENTCOM-003
**性質**: 任意の reply
**条件**: reply は parent message に対する応答
**結果**: reply の channel = parent の channel
```

各 invariant は exactly 1 つの property test ID と 1:1 対応。

#### 2.2 F2: invariant を property test として実装

```typescript
// tests/property/inv_agentcom_001.test.ts
// INV: INV-AGENTCOM-001
import * as fc from 'fast-check';

test('INV-AGENTCOM-001: attempts > max_attempts ⇒ status=failed', () => {
  fc.assert(
    fc.property(
      fc.record({
        attempts: fc.integer({ min: 0, max: 100 }),
        max_attempts: fc.integer({ min: 1, max: 10 }),
        status: fc.oneof(
          fc.constant('claimed'),
          fc.constant('replied'),
          fc.constant('failed')
        )
      }),
      (row) => {
        if (row.attempts > row.max_attempts) {
          return row.status === 'failed';
        }
        return true;
      }
    ),
    { numRuns: 1000 }
  );
});
```

#### 2.3 F3: random input N=1000 で run

CI で property test 必須実行:
```bash
framework verify property
  → 全 INV ID に対応する property test を 1000 通り run
  → counter-example 検出時:
    - counter-example を log に literal で出力
    - 該当 invariant ID を fail
    - regression test に counter-example を auto-add
```

#### 2.4 F4: CI で property test 必須実行

PR merge gate に required check として追加。

### 3. 完了条件

- IYASAKA 全 project の重要 invariant が property test 化
- counter-example 検出時の regression test 自動追加が機能

---

## SPEC-DOC4L-015: Traceability Matrix Enforcement

### 1. 目的

[文献確認 SeaLights / Tricentis 等 industry standard] 要件 ↔ test ↔ code の 3 者を mechanical link で強制。orphan を構造的に検出。

### 2. 機能要件

#### 2.1 F1: framework trace matrix で 3 者 link 状況可視化

```bash
framework trace matrix [--format markdown|json]

出力 (markdown):
| AC ID            | Test ID            | Code path             | Status |
|------------------|--------------------|-----------------------|--------|
| AC-AGENTCOM-001  | test_ac_001.sh     | src/wake-daemon.ts:42 | ✅     |
| AC-AGENTCOM-002  | (missing)          | src/tmux-sender.ts:12 | ❌     |
| AC-AGENTCOM-003  | test_ac_003.sh     | (orphan)              | ⚠️     |

Total: 3 AC, 2 with tests (67%), 1 orphan code

orphan code (どの要件にも対応しない):
  src/legacy/utils.ts:120-145

orphan test (どの要件にも対応しない):
  tests/old/test_legacy.sh
```

#### 2.2 F2: 不一致を CI で block

- 要件あり / test なし → merge block
- test あり / code 関連付けなし → warning
- code あり / 要件なし (orphan code) → warning

```bash
framework verify trace-matrix
  exit 1 if AC without test
  exit 0 with warning if orphan code or orphan test
```

#### 2.3 F3: orphan code / orphan test を warning / block

```bash
framework trace orphans

出力:
  Orphan code (どの要件にも対応しない):
    src/legacy/utils.ts:120-145
    src/deprecated/old-handler.ts:1-200
  
  Orphan test (どの要件にも対応しない):
    tests/old/test_legacy.sh
```

policy:
- orphan code 30 日超: ADR 起票 or 削除
- orphan test 30 日超: 削除 or AC ID 付与

#### 2.4 F4: 双方向 link を mechanical 強制

各 AC の corresponding test 記載 + 各 test ファイルに AC ID 引用 comment 必須:

```typescript
// AC: AC-AGENTCOM-001
// SPEC: docs/agent-com.md:42
// VERIFY: テスト方針は SPEC-DOC4L-014 (property) + SPEC-DOC4L-013 (BDD)
test('Given launchd active, When INSERT, Then replied within 60s', () => {
  // ...
});
```

各 source code (関連 file) も AC ID コメントを付与:

```typescript
// IMPL of AC-AGENTCOM-001
// SPEC: docs/agent-com.md:42
export function handleWake(...) {
  // ...
}
```

### 3. 完了条件

- IYASAKA 全 project の AC ↔ test ↔ code 3 者 link 率 90%+
- orphan code / orphan test 件数を 30 日以内に半減

---

## ADF v1.2.4 全体 roadmap

```
Phase 1 (1 ヶ月、SPEC-DOC4L-012):
  4 ギャップ評価 PR template を全 project に展開
  test pyramid monitoring を CI に組込

Phase 2 (1-2 ヶ月、SPEC-DOC4L-013):
  既存 spec を BDD (G/W/T) 形式に改訂
  AC ↔ test の 1:1 対応を確立

Phase 3 (2-3 ヶ月、SPEC-DOC4L-014):
  各 feature の重要 invariant を property test 化
  CI で property test 必須化

Phase 4 (3 ヶ月以降、SPEC-DOC4L-015):
  全 project で traceability matrix 確立
  orphan code / orphan test の累積防止
```

---

## v1.2.3 と v1.2.4 の役割分担

| 軸 | v1.2.3 | v1.2.4 (本 spec) |
|---|---|---|
| 抽象度 | 個別 (agent-com 由来) | 普遍 (全 project 適用) |
| timing | 即実証 (1-2 週間) | 中期 (3-6 ヶ月) |
| 実装難度 | 低-中 | 高 |
| dogfooding 先 | agent-com | haishin-puls-hub / hotel-kanri / 全 project |
| 完成依存 | v1.2.1 + v1.2.2 | v1.2.3 + 各 project の test 文化形成 |
| 効果範囲 | 個別 bug pattern 防止 | 新規実装の構造的漏れ防止 |

両 version は **補完関係**。v1.2.3 が agent-com の即時火消し、v1.2.4 が IYASAKA 全 project の長期方法論。

---

## ADF への引き渡し条件

ARC が本 spec を ADF SPEC.md に取り込む際、以下を確認:

1. **既存 ADF v1.2.3 SPEC.md との整合性**
   - SPEC-DOC4L-012-015 ID が既存 ID 群と衝突しないか
   - v1.2.3 の Layer 5 と v1.2.4 の Test Pyramid 6 階層の関係

2. **dogfooding 順序**
   - v1.2.0 → v1.2.1 → v1.2.2 → v1.2.3 → v1.2.4 を順次 release
   - v1.2.4 は v1.2.3 完了 + 各 project の test 文化形成 後に着手

3. **全 project への展開タイミング**
   - agent-com が v1.2.3 で先行
   - haishin-puls-hub / hotel-kanri / 配信プラスHub に v1.2.4 段階展開
   - 1 project ずつ dogfooding して effective なら次へ

4. **ARC の方法論 layer への組込**
   - 「agent org-in-a-box」仮説の方法論 layer に test 設計規格が追加される
   - これは Anthropic / Google にも無い IYASAKA の moat

---

## 改訂履歴

- 2026-05-07: 初版、CEO 提起の「漏れない test 規格」を v1.2.4 として spec 化
