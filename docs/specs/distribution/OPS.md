# ADF 配布 OPS

> doc4l 4-layer / OPS layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md (FR-D1〜FR-D5)
> 対応 IMPL: ./IMPL.md (Phase 0〜5)
> 対応 VERIFY: ./VERIFY.md (Layer A〜D)

本 OPS は SPEC + IMPL の rollout、運用、ロールバック、observability を定義する。

---

## §1 Rollout 戦略

### §1.1 Stage A → Stage B 段階展開

```
[Stage A.0] dogfooding 解消 (IMPL Phase 0)
   ↓ ADF 自身の Gate B PASS、Issue #105 merge
[Stage A.1] Adapter interface 抽出 (IMPL Phase 1)
   ↓ core 改変なし、新規コードのみ追加
[Stage A.2] core を adapter 経由に refactor (IMPL Phase 2)
   ↓ behavior 不変 refactor、existing test 全 PASS 必須
[Stage A.3] OSS readiness checker 投入 (IMPL Phase 3)
   ↓ 内部固有名詞 hardcode を grep 検出、CI で merge 前 block
[Stage A.4] Internal config layer 公開 (IMPL Phase 4)
   ↓ @iyasaka/adf-internal-config repo 立ち上げ + adapter 実装
[Stage A.5] 内部 project への wave 段階展開 (IMPL Phase 5)
   ↓ wave 1 (1 project pilot) → wave 2 (主系統 3) → wave 3 (残全)
[Stage A 完了] 内部全 bot/プロジェクトが ADF 配下で運用
   ↓ ←本 SPEC のメインゴール
[Stage B (将来)] OSS 公開
   ↓ CEO 戦略判断、license 確定 (§7)、Marketing 整備
```

### §1.2 各 stage の遷移条件

| stage | 遷移条件 | 確認者 |
|---|---|---|
| A.0 → A.1 | Issue #105 merge、ADF 自身の Gate A/B/C 全 PASS | lead (ARC interim) + CTO |
| A.1 → A.2 | Phase 1 sub-PR 全 merge、Layer A unit test 全 PASS | lead + CTO + auditor |
| A.2 → A.3 | Phase 2 refactor 後 既存 e2e / contract test 全 PASS、behavior 不変確認 | lead + auditor |
| A.3 → A.4 | OSS readiness CI が main で稼働、内部固有名詞 grep 0 件 | CTO |
| A.4 → A.5 | `@iyasaka/adf-internal-config` v0.1.0 公開、Layer B contract test 全 PASS | lead + CTO |
| A.5 wave 1 → wave 2 | wave 1 (1 project) で `framework gate b` PASS + 実 adapter 連携 観測 | lead + project lead |
| wave 2 → wave 3 | wave 2 (3 project) 全 PASS + 観測 | lead + 各 project lead |
| Stage A 完了 → B 着手 | CEO 明示判断 (license 確定 + 公開タイミング) | **CEO** |

[文献確認: SPEC §8 license 未確定 / governance-flow.md route:ceo-approval]

---

## §2 Stakeholder 責任

| 役割 | Stage A.0-A.2 | Stage A.3-A.4 | Stage A.5 (wave 展開) | Stage B 移行 |
|---|---|---|---|---|
| CEO | route:ceo-approval (governance change) 承認 | 同左 | wave 進行監督 | **license 確定 + 公開判断必須** |
| ARC (interim lead) | SPEC/IMPL/VERIFY/OPS author + maintain | 各 PR の design audit Layer 1 | 各 wave の readiness 判定 | OSS-aware 設計の最終 sanity |
| CTO | review chain Layer 3 + cross-cutting check | OSS readiness 設計 sanity | 全 project wave 監督 | OSS infra 設計 |
| auditor | 6-axis judgment Layer 2 | 同左、特に hidden impact | 同左 + 実運用 false positive 検出 | 同左 |
| adf-dev | sub-PR 実装 (Phase 0〜3) | Phase 4 internal config layer 実装 | Phase 5 各 project install 支援 | OSS doc 整備 |
| 各 project lead-bot | Stage A.5 まで観察、wave 自己 project に展開 | 同左 | 各自 project の `.framework/config.json` 設定 | OSS 利用方移行ガイド |
| 各 project dev-bot | 既存 PR で本 SPEC 影響なし (grandfather) | 同左 | wave 後の新 PR で本 SPEC 適用 | 同左 |

[文献確認: governance-flow.md Role mapping、本 SPEC merge 後に lead 行へ「IMPL doc authoring」追加 = lead-impl-workflow/SPEC FR-L3.1]

---

## §3 監視 / observability

### §3.1 計測指標

| 指標 | 計測方法 | 目標 (推測) |
|---|---|---|
| 内部 project の ADF install 完了率 | 各 project の `.framework/project.json` 存在 grep | wave 3 完了時点で 100% |
| adapter 連携実観測 (mock でなく実 send / 実 set) | Layer C C-03a / C-03b 結果 + agent-comms-mcp DB 検索 | 100% 全 project |
| OSS readiness checker 検出件数 (内部固有名詞 hardcode) | CI workflow `oss-readiness.yml` ログ集計 | 検出 = 即修正、0 件 stable |
| 各 project の `framework gate b` PASS 率 | CI workflow ログ集計 | 95%+ |
| dev-bot からの open decision 範囲外 escalation 件数 (本 SPEC 適用後) | discord/agent-comms 抽出 | baseline 比減少傾向 |

[文献確認: lead-impl-workflow/OPS.md §3.1 + memory `feedback_no_time_concept.md`]

### §3.2 alert / notification

- **Phase 5 wave 1 直後**: 1 wave 相当 (件数ベース) の PR で adapter loader fail / OSS readiness false positive を CTO 集計
- **dogfooding**: 各 wave で adapter 通信失敗 → 「明確エラー」観測、silent fallback 検出時は即 escalation [文献確認: memory `feedback_no_silent_fallback.md`]
- **rollout 異常**: Phase 5 で main 開発が停止する級の問題発生時、即 CEO escalation

### §3.3 計測 dashboard

[推測 unverified: 既存 framework に dashboard なし、まず GitHub Actions の workflow run history を一覧化する script で代替]

```bash
# 簡易計測 candidate (Phase 5 で必要性が出た時点で実装)
gh run list --workflow=oss-readiness.yml --limit 100 --json conclusion | jq '...'
gh run list --workflow=gate-b.yml --repo=watchout/iyasaka --limit 50 ...
```

---

## §4 Rollback

### §4.1 段階別 rollback

| 観測される問題 | rollback 範囲 | 手順 |
|---|---|---|
| Stage A.0 (bootstrap) で `.framework/project.json` 形式不備 | Issue #105 PR を git revert、Gate B 再 FAILURE 戻り (一時的) | 通常 PR revert、CTO + ARC 連名 |
| Stage A.1〜A.2 で adapter loader が dynamic import fail (npm install path 解決不能) | 該当 PR 個別 revert、core は adapter 不在の default 動作で運用 | PR 個別 revert |
| Stage A.3 で OSS readiness checker 誤検出多発 | `oss-readiness.yml` を `workflow_dispatch` のみに変更、required check 外す | PR で workflow file 改訂、CEO 承認 |
| Stage A.4 で `@iyasaka/adf-internal-config` 重大 bug | npm version pin で安定 version に固定、内部 project 全 install を pin 指示 | npm dist-tag、各 project の package.json で `"@iyasaka/adf-internal-config": "X.Y.Z"` 固定 |
| Stage A.5 wave 2 で 1 project が壊れる | 該当 project の `.framework/config.json` から `adapters` field 削除で default 動作復元、wave 2 → wave 1.5 後退 | project 個別 fix |

### §4.2 rollback 判断権限

- Stage A.0〜A.4 rollback: CTO + ARC 連名で実行可、CEO 事後通知
- Stage A.5 (wave 展開) rollback: 該当 project lead と協議、CTO 監督
- Stage A → B 移行 rollback (license 後悔等): **CEO 明示判断**
- 緊急時 (本番 active development 全停止級): CTO 単独で hot-rollback 可、即時 CEO 報告

[文献確認: governance-flow.md 違反時の rollback 章、lead-impl-workflow/OPS.md §4 と整合]

---

## §5 Migration plan (既存 project / artifact)

### §5.1 既存 OPEN PR / Issue の grandfathering

[文献確認: SPEC §8 / IMPL §5.2]

| artifact | grandfather | follow-up |
|---|---|---|
| Issue #105 (bootstrap) | ✅ 本 SPEC IMPL §8 で施工図あり | 不要 |
| OPEN PR #104 (substep 3/5) | ✅ Gate B FAILURE は #105 解消で進行 | merge 後 distribution の adapter 設計に整合性確認 |
| OPEN PR #91 (#64 sub-PR 2、on-hold) | ✅ on-hold 解除可否 CEO 確認 | 解除時に adapter 経由通信に refactor candidate |
| Phase 1 残 #65-#69 | ❌ 本 SPEC merge 後着手、IMPL workflow + adapter 適用 | 各 issue 起票時に SPEC + IMPL 同時生成 |

### §5.2 既存 project の Stage A 移行

| project | 現状 | 移行 |
|---|---|---|
| iyasaka | `.framework/project.json` 存在 (`profileType=hp`) | adapter 経由通信に config 切替、wave 1 候補 |
| hotel-kanri | unknown | wave 2 候補、移行前に project 状態 audit |
| haishin-puls-hub | unknown | 同上 |
| wbs | unknown | 同上 |
| agent-comms-mcp | self (本 SPEC の adapter target) | adapter 連携先、自身が ADF 利用するかは別判断 |
| agent-memory | self (同上) | 同上 |

### §5.3 既存 closed PR への遡及

不要。merge 済 PR は audit log で trace 可、retrofit 不要。

---

## §6 Documentation maintenance

### §6.1 SPEC / IMPL / VERIFY / OPS の co-evolution

本 4 ファイルは **同一 PR で更新する** のが原則 [文献確認: lead-impl-workflow/OPS.md §6.1 と同 pattern]:
- SPEC 変更 → IMPL / VERIFY / OPS の影響範囲確認、同 PR で coupled 更新
- IMPL 変更 (新 Phase / sub-PR 追加等) → SPEC FR への影響確認
- VERIFY 変更 → SPEC AC との整合確認
- OPS 変更 → IMPL Phase 完了条件との整合

例外: typo / 文言 polish のみは個別 PR 可

### §6.2 update PR の review chain

本 SPEC + IMPL + VERIFY + OPS の更新 PR:
- L1: lead-bot (本 SPEC merge 後は ARC interim lead 継続、専任 lead-adf 配置で移管)
- L2: codex-auditor (6-axis、特に axis 3 SSOT 整合 + axis 5 hidden impact)
- L3: ARC + CTO 連名 (cross-cutting 性ため)
- merge: CTO

---

## §7 OSS 公開 (Stage B、license 確定後)

### §7.1 公開前必須対応

[文献確認: SPEC §6.4 OSS 公開時の追加要件]

- [ ] License 確定 (CEO 判断、MIT / Apache 2.0 候補)
- [ ] `LICENSE` ファイル配置
- [ ] `CODE_OF_CONDUCT.md` 配置 (Contributor Covenant 標準推奨)
- [ ] `CONTRIBUTING.md` 配置 (PR flow / 4-layer review chain の OSS 向け説明)
- [ ] `SECURITY.md` 配置 (脆弱性報告 contact)
- [ ] OSS readiness checker が main で安定稼働 (内部固有名詞 0 件)
- [ ] `templates/specs/IMPL.md.template` 等の internal example を OSS-friendly に sanitize
- [ ] README.md に OSS 利用方向けセクション追加
- [ ] `package.json` の `repository` / `author` / `homepage` 確認

### §7.2 公開タイミング判断

CEO 判断事項。本 OPS は技術準備のみ扱う [文献確認: SPEC §2 非目的]。

判断材料 candidate:
- Stage A 完了 (内部全 bot 配下) からの安定稼働観測
- agent-comms-mcp / agent-memory の状況 (これらの OSS 公開戦略との整合)
- 競合 OSS framework の動向 (CEO 戦略判断)

### §7.3 公開後運用

- GitHub Discussions or Discord 運用 (CEO 判断)
- semver 運用 (`route:ceo-approval` で major bump)
- 外部 contributor PR の 4-layer chain 適用 (内部 lead が L1、auditor L2、CTO L3)

[推測 unverified: OSS 公開後の外部 contributor 受入は SaaS Vision (memory `project_agentcomms_saas_vision.md`) と連動、別 SPEC で詳細化]

---

## §8 Open operational decisions

[文献確認: SPEC §8 + 本 OPS の operational 視点]

| 判断項目 | candidate | 確定タイミング |
|---|---|---|
| Stage A.5 wave 展開の cadence (件数ベース) | wave 1 = 1 project / wave 2 = 3 project / wave 3 = 残全 | wave 1 完了観測後、wave 2 拡大可否を lead 判断 |
| `@iyasaka/adf-internal-config` 配置 (a/b/c) | (a) 単独 monorepo / (b) agent-comms 内 sub-package / (c) iyasaka project 内 | Phase 4 着手前、CTO + ARC 確定 |
| OSS readiness checker の exclude pattern | `docs/specs/distribution/*` / `docs/specs/lead-impl-workflow/*` / `examples/*` 等 | Phase 3 着手時、各 PR で追加 |
| dashboard 実装 | (a) framework 内蔵 / (b) GitHub Actions native / (c) 外部 | observability 必要性が出た時点 |
| Stage B 公開タイミング | Stage A 完了 + license 確定 | **CEO 戦略判断、技術側は準備のみ** |

---

## §9 退役 / sunset

本 SPEC は ADF 配布の永続戦略として設計、sunset 計画なし。ただし以下のケースで再設計余地あり:

- ADF が完全に異なる configuration 体系に移行 (例: post-doc4l v2.0)
- adapter pattern が LLM tooling 進化で別表現に移行 (例: native MCP integration 標準化)
- OSS 戦略の根本変更 (CEO 戦略判断)

これらは別途 ADR or proposal で議論 [文献確認: memory `project_repo_artifacts_github.md` で ADR 廃止、現在は GitHub Issue / proposal で扱う]。

---

## Evidence label legend

- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
