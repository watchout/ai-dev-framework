# Lead IMPL Authoring Workflow VERIFY

> doc4l 4-layer / VERIFY layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md (AC-L1〜AC-L6)
> 対応 IMPL: ./IMPL.md (Phase 0〜4)
> 関連: OPS.md (同 directory)

本 VERIFY は SPEC.md AC-L1〜AC-L6 を deterministic に検証する test plan、および IMPL.md の各 Phase 完了判定基準を定義する。

---

## §1 検証戦略

3 layer で検証する:

```
Layer A: unit test (vitest)        — impl-validator.ts の logic
Layer B: contract test             — `framework gate impl` / `framework impl validate` CLI 挙動
Layer C: integration test (CI)     — gate-impl.yml が PR 上で動作
Layer D: dogfooding observational   — v1.2.0 substep 4/5 で実運用挙動
```

---

## §2 必須テストケース (Layer A: unit test)

### §2.1 `impl-validator.ts` (`src/cli/lib/impl-validator.test.ts`)

| テスト | 入力 | 期待結果 | 対応 SPEC AC |
|---|---|---|---|
| T-01 | 完全な IMPL.md (全 §1〜§10、evidence label 5+) | status=PASS, missingSections=[], evidenceLabelCount≥5 | AC-L2 |
| T-02 | §3 (実装順序) 欠落 | status=WARNING, missingSections=["§3 実装順序"] | AC-L2 |
| T-03 | evidence label 0 件 | status=BLOCK, errors=[{type: "no_evidence_label"}] | AC-L2, FR-L2.2 |
| T-04 | §8 のみ欠落 (bootstrap N/A 該当) | status=PASS (§8 は optional) | FR-L2.1 §8 注記 |
| T-05 | §1 + §3 + §4 + §6 + §9 + §10 のみ存在 (最小構成、evidence 5+) | status=WARNING (§2/§5/§7 欠落)、ただし `--strict` フラグ無しで PASS | FR-L4.3 |
| T-06 | 空ファイル | status=BLOCK, missing 全件 | AC-L2 |
| T-07 | 5MB 超の巨大 IMPL | size 制限超 → 警告のみ、parse 続行 | §6 NFR |
| T-08 | YAML front matter のみ、body 空 | status=BLOCK | AC-L2 |
| T-09 | 必須 § 名が一致 (regex マッチ) するが本文が空 (1行 only) | status=WARNING, type=empty_section | FR-L4.3 |
| T-10 | evidence label が `[observed]` 英語表記 | カウント対象 (regex で英語別表記も拾う) | FR-L2.2 |

### §2.2 `init-feature` 拡張 (`src/cli/commands/init-feature.test.ts` 拡張)

| テスト | 入力 | 期待結果 |
|---|---|---|
| IF-01 | `framework init-feature my-feat` | `docs/specs/my-feat/{SPEC,IMPL,VERIFY,OPS}.md` 4 ファイル作成 |
| IF-02 | `framework init-feature my-feat` 重複実行 | 既存ファイルは上書きしない、警告 |
| IF-03 | IMPL.md.template が `{{FEATURE_NAME}}` placeholder を `my-feat` に置換 | OK |

### §2.3 `gate.ts` 拡張 (`src/cli/commands/gate.test.ts` 拡張)

| テスト | 入力 | 期待結果 |
|---|---|---|
| G2-01 | `framework gate impl --feature=lead-impl-workflow` (本 dir 自身) | exit 0, "Gate 2: PASSED" |
| G2-02 | 存在しない feature 指定 | exit 1, error "feature directory not found" |
| G2-03 | IMPL.md 不在 feature 指定 | exit 1, "IMPL.md not found in <path>" |
| G2-04 | `--feature` 未指定 (PR mode) | linked issue 解決を試行 |

[推測 unverified: `--pr-number` mode は Layer C (CI) で smoke 確認、unit test では mock]

---

## §3 Contract test (Layer B: CLI 挙動)

### §3.1 `framework impl validate <path>` (FR-L4.1)

```bash
# T-CLI-01: 正常系
framework impl validate docs/specs/lead-impl-workflow/IMPL.md
# 期待: exit 0, output に "Status: PASS"

# T-CLI-02: 失敗系 (空ファイル)
echo "" > /tmp/empty-impl.md
framework impl validate /tmp/empty-impl.md
# 期待: exit 1, output に "Status: BLOCK", "no_evidence_label"

# T-CLI-03: format option
framework impl validate docs/specs/lead-impl-workflow/IMPL.md --format=json
# 期待: JSON 形式、status / missingSections / evidenceLabelCount fields
```

### §3.2 `framework gate impl` (FR-L4.1)

```bash
# T-G-01: feature 指定で local 動作
framework gate impl --feature=lead-impl-workflow
# 期待: 該当 dir の IMPL.md を validate、PASS で exit 0

# T-G-02: PR mode (CI 環境)
GITHUB_PR_NUMBER=999 framework gate impl
# 期待: gh CLI で linked issue 解決、IMPL reference 抽出、validate
```

---

## §4 Integration test (Layer C: CI)

### §4.1 `gate-impl.yml` smoke

| smoke | 手順 | 期待結果 |
|---|---|---|
| CI-01 | 任意の PR で gate-impl.yml が trigger される | workflow が start (実行履歴あり) |
| CI-02 | linked issue + IMPL reference 完備の PR | Gate 2 PASS |
| CI-03 | linked issue body に IMPL reference 不在 | Gate 2 FAILURE、CI status check に表示 |
| CI-04 | branch protection で Gate 2 が required check | merge ボタン無効化 (Gate 2 fail 時) |

[推測 unverified: branch protection は Phase 2.3 で別 PR、route:ceo-approval 必要]

### §4.2 既存 Gate との非干渉

| 確認 | 期待結果 |
|---|---|
| Gate A / B / C / 0 / 1 の挙動が本 SPEC merge 後も不変 | ✅ |
| 既存 PR (#104 / #91) で Gate 2 が誤発火しない | ✅ (grandfather により skip) |

---

## §5 Dogfooding 観測 (Layer D)

### §5.1 v1.2.0 substep 4/5 (migrate-to-v1.2) で本 workflow を適用

```gherkin
Given 本 SPEC + IMPL が main に merge 済
And v1.2.0 substep 4/5 の SSOT が Drive に存在
When lead-bot (lead-ama / lead-tuk / lead-sus いずれか) が substep 4/5 着手
Then `docs/specs/v1.2.0_substep-4/IMPL.md` を SPEC 起票時に同時生成
And IMPL.md を ARC + CTO で連名 review
And 5-section instruction が IMPL.md §X を reference
And Gate 2 が CI で PASS
```

### §5.2 ADF distribution Phase 1+ で本 workflow 適用確認

```gherkin
Given distribution/SPEC.md と distribution/IMPL.md (本セッション作成済) が main に merge
When distribution Phase 1.1〜4.4 のサブPR が起票
Then 各 PR の Issue 本文が distribution/IMPL.md §3 (実装順序) の特定 sub-PR を reference
And Gate 2 が PASS
```

### §5.3 観測指標

| 指標 | 目標 (推測) | 計測方法 |
|---|---|---|
| IMPL.md 不在 PR の検出率 | 100% | gate-impl.yml ログ |
| 5-section instruction の IMPL reference 含有率 | 95%+ | 起票後の grep |
| sub-PR cycle 1 修正率 (IMPL fidelity が高ければ低下する想定) | 既存 baseline と比較で減少 | PR cycle log |

[推測 unverified: 計測 baseline は本 SPEC merge 前の last 30 PR、merge 後 30 PR で比較。CTO が観測担当]

---

## §6 受入チェックリスト (PR review 用)

本 SPEC merge 前、各 Phase 完了時に以下を確認:

### Phase 0 完了 (文書化)

- [ ] `04b_IMPL_FORMAT.md` 新規、必須セクション一覧 + evidence label 規約 + template への参照あり
- [ ] `02_GENERATION_CHAIN.md` Step 3.4 追記、Gate Conditions 表更新
- [ ] `04_FEATURE_SPEC.md` 末尾に IMPL.md output 言及
- [ ] `05_IMPLEMENTATION.md` "Lead-side IMPL drafting" section
- [ ] `09_ENFORCEMENT.md` "Gate 2: IMPL Presence" section
- [ ] `~/.claude/rules/governance-flow.md` Role mapping table 更新 (lead 行に IMPL doc authoring)
- [ ] `templates/specs/IMPL.md.template` 新規、§1〜§10 placeholder

### Phase 1 完了 (validator code)

- [ ] T-01〜T-10 unit test 全 PASS
- [ ] IF-01〜IF-03 init-feature test PASS
- [ ] G2-01〜G2-04 gate test PASS
- [ ] T-CLI-01〜T-CLI-03 CLI smoke PASS
- [ ] tsc --noEmit clean

### Phase 2 完了 (CI 強制)

- [ ] CI-01〜CI-04 smoke PASS
- [ ] 既存 Gate (§4.2) 非干渉確認
- [ ] branch protection rules 更新 (Phase 2.3、route:ceo-approval、CEO 承認後)

### Phase 3 完了 (skill)

- [ ] `lead-impl-authoring/SKILL.md` skill-authoring 15-item validation PASS
- [ ] `lead-pr-instruction/SKILL.md` 改訂版で 15-item validation PASS
- [ ] 本 IMPL §3 を skill 内で reference

### Phase 4 完了 (dogfooding)

- [ ] v1.2.0 substep 4/5 で本 workflow 適用、Gate 2 PASS
- [ ] distribution Phase 1+ で本 workflow 整合確認

---

## §7 失敗時の対応

| 観測される失敗 | 想定原因 | 対応 |
|---|---|---|
| Gate 2 が誤発火 (legitimate な PR を BLOCK) | regex 過敏 / linked issue 解決失敗 | impl-validator regex 修正 PR、または `breaking-change-verified` 同様の `impl-grandfathered` label 導入 |
| Phase 0 文書化のみで適用 → dev-bot が IMPL を作らない | 強制機構 (Phase 2 CI) 未投入 | Phase 2 を最優先で投入、それまで lead が手動 verify |
| dogfooding (Phase 4) で実運用負荷高 | IMPL 作成 cost が想定より高 | template の充実、よくある pattern を 04b_IMPL_FORMAT に蓄積 |
| skill validator hook が IMPL.md を二重 validate | hook と impl-validator の責任分担曖昧 | hook = evidence label のみ、impl-validator = section structure に分離 |

[文献確認: skill-validator hook は既存 (memory `project_skill_validator_hook.md`)、本 SPEC で責任分担明確化]

---

## §8 ロールバック判断

本 SPEC は機能追加 (新 Gate 2 / 新 step / 新 file format) のみで既存挙動を変更しない。問題発生時のロールバックは:

1. branch protection から Gate 2 を required check 外す (即座、CEO 承認)
2. `gate-impl.yml` を disable (workflow_dispatch のみに変更、または delete)
3. Phase 4 (dogfooding) を一時停止、Phase 0〜3 は repo に残置

[推測 unverified: 段階 rollback で混乱なく停止可能、検証は OPS.md §rollback で詳細]

---

## Evidence label legend

- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
