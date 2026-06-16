# Lead IMPL Authoring Workflow OPS

> doc4l 4-layer / OPS layer
> 作成: lead [interim] (ARC)
> Status: draft v0.1
> 対応 SPEC: ./SPEC.md (FR-L1〜FR-L5)
> 対応 IMPL: ./IMPL.md (Phase 0〜4)
> 対応 VERIFY: ./VERIFY.md (Layer A〜D)

本 OPS は SPEC + IMPL の rollout、運用、ロールバック、observability を定義する。

---

## §1 Rollout 戦略

### §1.1 段階展開

```
[Stage 1] 文書 merge (Phase 0 sub-PR 0.1〜0.4)
   ↓ lead は手動で IMPL 作成、強制機構なし
[Stage 2] validator + CLI 公開 (Phase 1 sub-PR 1.1〜1.4)
   ↓ lead が `framework gate impl --feature=<name>` で local 検証可
[Stage 3] CI 統合 — soft-fail mode (Phase 2 sub-PR 2.1〜2.2)
   ↓ Gate 2 が PR で警告のみ表示、merge は block しない
[Stage 4] CI 統合 — hard-fail mode (Phase 2 sub-PR 2.3)
   ↓ branch protection で required check、CEO 承認後
[Stage 5] dogfooding (Phase 4)
   ↓ v1.2.0 substep 4/5 + distribution Phase 1+ で適用
[Stage 6] 全 ADF PR 適用
   ↓ grandfather 対象を逐次 follow-up で IMPL 化
```

### §1.2 各 stage の遷移条件

| stage | 遷移条件 | 確認者 |
|---|---|---|
| 1 → 2 | Phase 0 sub-PR 全 merge、4-layer review chain PASS | lead (ARC interim) + CTO |
| 2 → 3 | Phase 1 sub-PR 全 merge、Layer A unit test 全 PASS | lead + CTO + auditor |
| 3 → 4 | Stage 3 で 5+ PR 観測、Layer C smoke PASS、CEO 承認 | CEO |
| 4 → 5 | Stage 4 動作後、Layer D dogfooding 1 件成功 | lead + CTO |
| 5 → 6 | grandfather 対象の follow-up issue 起票完了 | lead |

[文献確認: governance-flow.md route:ceo-approval は branch protection 変更等の governance change に該当]

---

## §2 Stakeholder 責任

| 役割 | Stage 1-2 | Stage 3-4 | Stage 5-6 |
|---|---|---|---|
| CEO | route:ceo-approval (Stage 4) 承認 | branch protection 変更承認 | rollout 監督、cancel 判断 |
| ARC (interim lead) | SPEC/IMPL/VERIFY/OPS author | 文書 maintain | 各 PR の IMPL review (Layer 1) |
| CTO | review chain Layer 3 | gate-impl.yml の cross-cutting check | observability 監督 |
| auditor | 6-axis judgment Layer 2 | Gate 2 false positive 報告 | 同左 |
| adf-dev | sub-PR 実装 (Phase 0〜3) | smoke 動作確認 | dogfooding 実装 |
| 各 project lead-bot | Stage 5 で本 workflow 学習 | 各自 project に適用 | IMPL 起票 (Stage 6) |

[文献確認: governance-flow.md の Role mapping、本 SPEC 後に lead 行へ「IMPL doc authoring」追加]

---

## §3 監視 / observability

### §3.1 計測指標 (本 SPEC 効果検証)

| 指標 | 計測方法 | baseline |
|---|---|---|
| IMPL.md 不在 PR の merge 率 | gate-impl.yml ログ集計 | 0% (Stage 4 後) |
| 5-section instruction の IMPL reference 含有率 | issue body grep (`IMPL.md §`) | 95%+ (推測 unverified) |
| sub-PR cycle 1 修正回数 (実装精度の代理指標) | PR cycle log | 本 SPEC 前 baseline と比較で減少 |
| dev-bot からの open decision 範囲外 escalation 件数 | discord/agent-comms 抽出 | 同上、減少傾向 |
| IMPL 作成 → 5-section instruction 起票までの elapsed (LLM 判断時間、外部時計に依存しない指標) | git log の commit interval | 観測のみ、目標値設定なし [文献確認: memory `feedback_no_time_concept.md` で時刻 cadence 化を避ける] |

### §3.2 alert / notification

- **Stage 4 直後**: 1 週間相当の PR (件数ベース、20 PR 想定) で Gate 2 の false positive / negative を CTO 集計
- **dogfooding**: v1.2.0 substep 4/5 着手 PR で IMPL 不在発生時、auditor から ARC + CTO に直接 ping
- **rollout 異常**: Gate 2 が main blocking で active development を停止させた場合、即時 CEO escalation

### §3.3 計測 dashboard

[推測 unverified: 既存 framework に dashboard 機構なし、まず GitHub Actions の workflow run history を一覧化する script で代替]

```bash
# 簡易計測 (本 SPEC merge 後に scripts/metrics/impl-workflow-stats.sh として配置候補)
gh run list --workflow=gate-impl.yml --limit 50 --json conclusion | jq '...'
```

---

## §4 Rollback

### §4.1 段階別 rollback

| 観測される問題 | rollback 範囲 | 手順 |
|---|---|---|
| Stage 4 後に Gate 2 が legitimate PR を多数 BLOCK | branch protection から Gate 2 required check 外す (Stage 4 → Stage 3 へ) | gh api で settings 変更、CEO 承認 |
| Stage 3 で Gate 2 が誤発火頻発 | gate-impl.yml を `workflow_dispatch` のみに変更 (Stage 3 → Stage 2 へ) | PR で workflow file 改訂 |
| Stage 2 で validator に致命 bug | impl-validator.ts の `gate impl` サブコマンドを disable (Stage 2 → Stage 1 へ) | PR で commands 内 `.action()` 内に early return + warning |
| Stage 1 で文書追記が混乱招く | 該当 section に "DRAFT — not yet enforced" banner を追記 (Stage 1 内で部分 rollback) | PR で文言追加 |

### §4.2 rollback 判断権限

- Stage 1〜3 rollback: CTO + ARC 連名で実行可、CEO 事後通知
- Stage 4 rollback (branch protection): **CEO 明示承認必須**
- 緊急時 (本番 active development 全停止級): CTO 単独で hot-rollback 可、即時 CEO 報告

[文献確認: `~/.claude/rules/governance-flow.md` 違反時の rollback 章、ADF distribution OPS.md と整合]

---

## §5 Migration plan (既存 PR / Issue の grandfathering)

### §5.1 grandfather 対象

[文献確認: SPEC FR-L5.3 + IMPL §5.2]

| artifact | grandfather | follow-up |
|---|---|---|
| OPEN PR #104 (substep 3/5) | ✅ Gate 2 適用なし | Issue #105 merge 後の Gate B 解消で進行、本 SPEC merge 後の cycle 1 fix で IMPL post-hoc 起票 candidate |
| OPEN PR #91 (#64 sub-PR 2) | ✅ on-hold 解除可否 CEO 確認、解除時に IMPL 起票 | follow-up issue で trace |
| Issue #105 (bootstrap) | ✅ 本 SPEC IMPL §8 に inline 施工図あり | 不要 |
| 既存 closed PR | ✅ 適用なし | 不要 |
| Phase 1 残 #65-#69 | ❌ 本 SPEC merge 後に着手、IMPL workflow 適用 | 各 issue 起票時に SPEC + IMPL 同時生成 |

### §5.2 doc4l v1.2.0 残 substep の整合

| substep | 状態 | 措置 |
|---|---|---|
| 1/5 | merged (PR #96) | grandfather、retrofit 不要 |
| 2/5 | active | grandfather (本 SPEC 着手時点で進行中) |
| 3/5 | OPEN PR #104 | grandfather |
| **4/5** | 未着手 | **本 workflow 第 1 適用対象**、SPEC + IMPL + VERIFY + OPS 同時生成 |
| **5/5** | 未着手 | 同上 |

---

## §6 Documentation maintenance

### §6.1 SPEC / IMPL / VERIFY / OPS の co-evolution

本 4 ファイルは **同一 PR で更新する** のが原則 (1 ファイルだけの drift を防ぐ):
- SPEC 変更 → IMPL / VERIFY / OPS の影響範囲確認、同 PR で coupled 更新
- IMPL 変更 (新 sub-PR 追加等) → SPEC FR への影響確認、必要なら SPEC 更新
- VERIFY 変更 → SPEC AC との整合確認

例外: typo 修正 / 文言 polish のみは個別 PR 可

### §6.2 update PR の review chain

本 SPEC + IMPL + VERIFY + OPS の更新 PR は:
- L1: lead-bot (本 SPEC merge 後は ARC interim lead 継続、専任 lead-adf 配置で移管)
- L2: codex-auditor (6-axis、特に axis 3 SSOT 整合)
- L3: ARC + CTO 連名 (本 4 ファイルの cross-cutting 性ため)
- merge: CTO

[文献確認: distribution/IMPL.md §10 で同様の連名 review pattern]

---

## §7 OSS 公開 (Stage B、distribution との整合)

[文献確認: distribution/SPEC.md §1 Stage B]

本 SPEC が定義する Step 3.4 / Gate 2 / IMPL.md format は OSS 公開時 (将来) も互換性を保つ:
- 内部固有名詞を hardcode しない (ADF core 原則 FR-D3.1 に準拠) [文献確認: distribution/SPEC FR-D3.1]
- IMPL.md template は generic、project 名 / bot 名等を含まない
- Gate 2 の判定 logic は agent-comms-mcp / agent-memory に依存しない

OSS 公開時の追加対応:
- `templates/specs/IMPL.md.template` を OSS-friendly な example に sanitize (内部 PR 番号等を除去)
- `04b_IMPL_FORMAT.md` を CONTRIBUTING.md から link

---

## §8 Open operational decisions

[文献確認: SPEC §10 で部分列挙、本 OPS で operational 視点を補足]

| 判断項目 | candidate | 確定タイミング |
|---|---|---|
| Stage 4 (CI hard-fail mode) 投入の CEO 判断基準 | (a) Stage 3 観測 20+ PR 経過 / (b) false positive 5% 以下 / (c) lead 全員が IMPL workflow 1 回以上経験 | Stage 3 完了時 CEO confirm |
| dashboard 実装 | (a) 既存 framework 拡張 / (b) GitHub Actions native / (c) 外部 (Grafana 等) | observability 必要性が出た時点で判断 |
| skill `lead-impl-authoring` の責任 owner | (a) ARC interim lead / (b) ARC + CTO 共同 / (c) 専任 lead-adf 配置後に移管 | 暫定 (a)、移管時に再判断 |
| 4 ファイル (SPEC/IMPL/VERIFY/OPS) の同一 PR 強制を framework gate にするか | (a) Yes (新 Gate) / (b) lead-pr-instruction skill 内 guideline のみ / (c) 強制せず観測のみ | dogfooding 観測後に判断 |

---

## §9 退役 / sunset

本 SPEC は framework 永続機能として設計、sunset 計画なし。ただし以下のケースで再設計余地あり:

- ADF が完全に異なる workflow 体系に移行 (例: post-doc4l v2.0)
- IMPL.md format が LLM tooling の進化で別表現 (例: 構造化 YAML / OpenAPI 風) に移行
- 4-layer chain 自体の体系変更 (governance-flow.md 改訂級)

これらは別途 ADR or proposal で議論。

---

## Evidence label legend

- `[検証済 observed]` — smoke / log / file 内容で観測済み
- `[文献確認 referenced]` — doc / SDK / SSOT / git artifact 等の引用
- `[推測 unverified]` — 未検証の hypothesis、smoke が必要
