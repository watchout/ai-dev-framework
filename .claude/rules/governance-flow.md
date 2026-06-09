# Governance Flow (PR Review & Merge)

> **Effective: 2026-04-09**
> **CEO directive**: msg `1491702879067701258` (#dev-arc, 2026-04-09 07:34 JST) +
> msg `1491704900370042940` (2026-04-09 07:42 JST、CEO 承認 + 実行指示)
> **Mechanically auto-loaded** by all Claude Code sessions via `~/.claude/rules/`

## Authority model (binding)

- **Runtime authority (primary)**: this file (`~/.claude/rules/governance-flow.md`) — auto-loaded at every Claude Code session start, source of truth for current behavior
- **Derived snapshot**: `<repo>/.claude/rules/governance-flow.md` (e.g. `ai-dev-framework/.claude/rules/governance-flow.md`) — distribution snapshot for repo readers and future auto-load migration target. **Not authoritative at runtime**
- **Sync direction**: home → repo (manual). Reverse sync requires CEO directive
- **Conflict resolution**: if home and repo disagree, home wins until auto-load switch (separate Sub-PR)

## 4-layer review chain (replaces previous CEO-bottlenecked flow)

```
dev bot (実装)
  → lead-bot (一次レビュー: sprint 視点 / 仕様準拠 / PR description)
  → codex-auditor (二次レビュー: 設計意図 / scope / 隠れた影響 / regression / SSOT / honesty)
  → CTO (三次レビュー: governance / framework / cross-cutting / 最終 sanity)
  → merge
```

**routine PR は CTO 承認時点で merge OK** (CEO 明示承認 skip)。

## Routine vs Critical (どちらの flow か lead-bot が PR 起票時に label で明示)

### `route:fast-merge` — 4 層 chain 完結 (CEO Gate skip)
- bug fix
- 既存 feature の修正 / refactor
- docs / test 追加
- spec-as-tests 追加
- 内部 API 変更 (公開 API でない)
- minor dependency upgrade

### `route:ceo-approval` — 5 層 (CEO 明示承認必須)
- **DB schema migration** (ALTER TABLE / DROP / 新規 table)
- **API 公開仕様変更** (route / response shape / auth flow)
- **新規外部 dependency 追加** (npm / brew / cargo / system service)
- **security policy 変更** (token / encryption / access control)
- **pricing / billing 変更**
- **大規模 architectural shift** (新規 ADR-level decision、ADR-040 等のような戦略決定)
- **org-build 系の組織変更** (CEO directive 2026-04-09 07:42 JST 明示)

判定に迷ったら **保守側で `route:ceo-approval`** を選ぶ。誤って fast-merge に分類してしまった場合のリスクが高い。

## 各層の責任 (明確化)

| 層 | 責任 | block 権限 |
|---|---|---|
| **ARC** | マスター設計 / interface 契約 / spec 凍結 / contract test 提示 | ✅ spec 差戻し可 |
| **dev bot** | 実装 + test 書き + PR 起票 + Test plan checkbox | (起票だけ、block 権限なし) |
| **lead-bot** | **Spec→PR 変換時の設計監査** + **IMPL doc authoring** (Step 3.4) + 5-section 指示書作成 + 一次レビュー / 仕様準拠 / PR description 確認 / route label 付与 | ✅ block 可 + ARC 差戻し可 |
| **codex-auditor** (`<@1485603913934835903>`) | **Pre-impl gate**: 5-section 指示書を 6 項目で監査 (指示書品質 / 抽象整合 / 実装可能性) + **Post-impl L2 review**: PR diff を 6-axis で監査 (設計意図 / scope bundle / 隠れた影響 / regression class / SSOT 整合 / commit message 正直さ) | ✅ block 可 (両 gate) |
| **CTO** | **Cross-cutting / strategic 設計監査** + 三次レビュー / governance gate / framework adoption check / 最終 sanity / merge ボタン | ✅ block 可 + merge 実行 |
| **CEO** | route:ceo-approval の最終判断 / 経営判断 / 戦略決定 | ✅ block 可 (critical PR のみ) |

---

# Design Audit & Instruction Format (2026-04-23 追加、CEO directive)

> **Effective: 2026-04-23**
> **CEO directive**: 「multi-LLM 1 script」抽象の失敗事例 (msg 本日 session) で露呈した design smell 検出不全を是正
> **Mechanically auto-loaded** by all Claude Code sessions via `~/.claude/rules/`

## Spec→PR 変換時の設計監査 (**lead-bot 責任**)

lead-bot は ARC spec (新規 or 重要更新) を受領し、PR 分解する **前** に以下 audit checklist を実行。1 項目でも NO なら **ARC に差戻し**、自己判断で PR 起票しない。

### Audit checklist

- [ ] **変動軸が明示的に抽象化されているか** — UI / LLM / DB / Auth / Platform / Model / Env 等の可変次元は、env var switch や文字列置換ではなく **interface (adapter / port)** で分離されているか
- [ ] **adapter 対称性** — 外部世界 X (例: UI=Discord) に adapter があるなら、同抽象レベルの外部世界 Y (例: LLM=Claude/Codex/Gemini) にも adapter が必須。非対称は design smell
- [ ] **failure mode 列挙** — spec が各 component の known failure modes (例: silent exit / timeout / rate limit / partial failure) を列挙し、各 mode の detection + recovery を明記しているか
- [ ] **contract test 付属** — spec に executable test fixtures (input → expected output) が付属、OR lead-bot が「first PR までに書く」と commitment 明示
- [ ] **open decisions 明示** — spec が「implementer 裁量範囲」と「凍結要件」を明確に分離しているか

### Abstraction leak の典型 smell (これを見たら上記 checklist を疑う)

- **"env var switch で N 個の実装を切替え"** (例: `LLM_CMD=claude|codex|gemini`) → 実際は N 個の adapter が必要、1 switch は thin
- **"文字列 config で multi-X 対応"** → X は adapter layer 必要
- **mechanical smoke は通るが behavioral test で gap** → 抽象が薄すぎ、各 variant 固有挙動が環境へ leak している
- **implementer が variant 毎に flag/argument 差に遭遇** → 各 variant 専用 config class 必要

### Escalation 基準

- **spec design gap** → ARC (lead-bot 第一次 escalation)
- **repo 横断 / 戦略的 abstraction 問題** → CTO (lead-bot 第二次 escalation、または明らか cross-repo 時は直接)
- **implementer-level 質問** → lead-bot が spec 範囲内で回答、escalate しない

## 5-Section Instruction Format (**lead-bot → dev-bot PR 指示書**)

全 lead-bot → dev-bot PR 指示は以下 5 section 固定フォーマット必須。dev-bot は 5 section 内の「凍結」部分を violation したら差戻し、「open decisions」以外で判断に迷ったら lead-bot にエスカレーション、自己判断禁止。

### 1. Interface contract (凍結)
- 関数 / API signature (TypeScript 型推奨)
- pre-condition / post-condition / invariants
- error types / taxonomy

### 2. Required behavior (凍結)
- bulleted 不変条件
- spec section 参照
- production semantic 要件 (例: "2s 以内応答" / "idempotent" / "DB error 時 fail-closed")

### 3. Forbidden behavior (凍結、anti-patterns)
- 過去 incident 参照付き anti-pattern
- scope exclusion ("X module は触らない")

### 4. Test fixtures (凍結、merge gate)
- executable test cases (input → expected output)
- behavioral smoke scenarios (unit test だけでなく)
- CI 要件: test pass が merge 承認条件

### 5. Open decisions (implementer 自由)
- implementer が自由に選択してよい項目の **明示列挙**
- 通常: 変数名 / 内部構造 / private helpers
- ここに列挙されていないものは **暗黙凍結**

implementer が (1)-(5) に含まれない判断に遭遇 → lead-bot に escalate、self-proceed 禁止。

## Spec→Impl auditor 監査 (Pre-impl gate、2026-05-02 追加)

> **Effective: 2026-05-02**
> **CEO directive**: msg `c4fb8e6c` (#dev-arc, 2026-05-02 05:50 JST)「impl=5-section 指示書、これを auditor が監査」
> **Rationale**: 5-section 指示書段階で abstraction leak / scope ambiguity / forbidden 漏れを検出し、dev-bot impl 開始前に差戻す。post-impl の auditor L2 では既にコード化されており修正コストが大きいため、pre-impl で意味判断を入れる。

### Flow 変更 (5-layer chain に拡張)

```
ARC spec 凍結
  → lead-bot (Spec→PR 変換時の設計監査 + 5-section 指示書作成)
  → 【NEW】codex-auditor (5-section 指示書の Pre-impl 監査)
  → dev-bot (5-section の凍結部分内で impl + test + PR 起票)
  → lead-bot (一次レビュー: sprint 視点 / 仕様準拠 / PR description)
  → codex-auditor (二次レビュー: 6-axis judgment)
  → CTO (三次レビュー: governance / framework / cross-cutting / 最終 sanity)
  → merge
```

auditor は同 PR sprint 内で **2 回登場** (Pre-impl gate + Post-impl L2 review)。両者の checklist は別物 (下記)。

### Pre-impl gate: auditor が 5-section 指示書を監査する 6 項目

lead-bot が 5-section 指示書を完成させ dev-bot に dispatch する **前** に、auditor が以下 6 項目を判定。1 項目でも FAIL なら **lead-bot に差戻し**、dev-bot に届かない。

```
指示書品質 (3):
  [ ] Interface contract の signature / pre / post / invariants が曖昧でないか
  [ ] Required behavior が spec section 参照で具体化され、production semantic が観測可能 (testable) か
  [ ] Forbidden behavior に過去 incident 参照付き anti-pattern が含まれているか

抽象整合 (2):
  [ ] 変動軸が adapter / port で分離されているか (env var switch / 文字列置換 で済ませていないか)
  [ ] adapter 対称性 — 同抽象レベルの外部世界に非対称な実装が混入していないか

実装可能性 (1):
  [ ] Test fixtures が executable で、merge gate として機能する具体性があるか
```

= 5 項目までは過去 (2026-04-23) の lead-bot audit checklist と同根。auditor 視点で **第三者として再審査** することで lead-bot 自身の盲点を補完。

### Pre-impl gate と Post-impl L2 review の違い

| gate | timing | 監査対象 | checklist |
|---|---|---|---|
| **Pre-impl gate** (NEW) | 5-section 完成 → dev-bot impl 開始 **前** | 5-section 指示書 (テキスト) | 上記 6 項目 (指示書品質 + 抽象整合 + 実装可能性) |
| **Post-impl L2 review** | dev-bot PR 起票 → lead LGTM 後 | PR diff (コード) | 6-axis (設計意図 / scope bundle / 隠れた影響 / regression / SSOT / honesty) |

### Pre-impl gate の差戻し先

- **指示書品質 / 抽象整合 FAIL** → **lead-bot 差戻し** (lead-bot が 5-section を改訂)
- **spec design gap が原因** → lead-bot 経由で **ARC 差戻し** (auditor は ARC に直接 escalate しない、lead-bot ハブ経由)
- **cross-repo / 戦略的問題** → lead-bot 経由で **CTO escalate**

### 適用対象

全 lead-bot → dev-bot 5-section 指示書に **必須適用**。例外なし。
typo / docs / 軽微 PR で 5-section 指示書を発行しない場合は本 gate も skip (元々 5-section 指示書が前提)。

## CTO 監査 scope

lead-bot 監査は per-project。CTO 監査は **cross-cutting** に限定:

- 複数 repo に波及する abstraction 問題 (例: 今回の multi-LLM は agent-comms + ADF + iyasaka-arc 横断)
- product 戦略整合 (例: Phase C redef §1 OSS publish 約束 vs 実装 drift)
- Layer 3 governance (merge gate)
- ARC 設計と CEO 戦略の final sanity

per-PR design audit は lead-bot に委譲、CTO は **per-PR は Layer 3 sanity のみ** で大勢介入しない (scaling 理由)。

## Role mapping (世界標準)

| bot | 相当 role | 主責任 |
|---|---|---|
| ARC | Principal Architect | マスター設計 |
| lead-bot (lead-ama / lead-tuk / lead-sus) | Tech Lead / Senior Engineer | spec→PR 変換時 design audit + **IMPL doc authoring** (Step 3.4) + 5-section 指示書 |
| dev-bot (各 dev) | Software Engineer | 5-section 指示書の「open decisions」範囲で実装 |
| CTO | VP Engineering | Cross-cutting design + Layer 3 governance |
| codex-auditor | Independent reviewer | **Pre-impl gate (5-section 指示書監査、6 項目)** + Post-impl L2 review (PR diff、6-axis judgment) |

各層が **independent に block** 可能。1 つでも reject なら merge しない。

## 旧フロー (廃止)

```
dev bot → lead-bot → CTO → CEO 全 PR 承認 → merge
```

旧フローは CEO bottleneck で routine PR が滞留する課題があった (2026-04-09 観測)。

## CTO の最終 sanity の責任範囲 (新フロー導入で重くなる)

CTO は最終 human reviewer として:
1. codex auditor の指摘がある場合、accept / reject 判断
2. governance gate 3 conditions (lead+CTO LGTM + CI green + CEO 承認 [critical 時のみ]) の検証
3. framework adoption (lead-playbook compliance / spec-as-tests 適用 / 1 PR 1 concern) の確認
4. cross-cutting impact の sanity (他 repo / 他 channel への波及)
5. merge 実行 (`gh pr merge --squash --delete-branch`)

## Post-merge 全方位検証 (CEO 2026-04-09 20:34 JST directive、追加)

**merge 後、target 環境での全方位検証が必須** です。「merge = 完了」ではありません。

### 検証環境の選択 (product 別)

| product type | 検証環境 |
|---|---|
| 本番 product (hotel-kanri / iyasaka / haishin-puls-hub 等) | **staging or production** |
| dev framework / infrastructure (agent-comms-mcp / agent-memory / ai-dev-framework) | **dev 環境 (本番運用を兼ねる)** |
| 未リリース MVP | **dev 環境** |

### 検証項目 (ARC と CTO で議論してフレームワークに組込予定)

暫定 baseline:
- unit / integration / e2e / regression / smoke tests が target 環境で pass
- 対象 bot の起動確認 (agents table status=online)
- 周辺 bot との通信確認 (send tool / channel push)
- SSOT と実装の drift なし
- エラーログに new error pattern なし

最終 list は **ARC + CTO の議論で framework (ADF Gate D) に組込** 予定 (ADR 起草候補、ADR-048 可能)。

### 検証承認の流れ (実装後承認と同じ 4-layer chain)

```
dev bot が target 環境で全方位テスト実行
  → lead-bot 一次検証レビュー (結果の sprint 視点)
  → codex-auditor 二次検証レビュー (6 axes)
  → CTO 三次検証レビュー (governance / framework 適用)
  → 完了判定 ✅
```

critical PR の場合は + CEO 明示承認で完了。

### 通達

- 初回通達: 2026-04-09 20:34 JST (CEO directive msg `1491899025107194017`)
- 本 rule file 追記: 同日
- 全 dev channel 周知: 同日

## 違反時の rollback

- merge 後に問題発見 → CTO が `git revert <merge-commit>` で revert PR を起票
- 重大度に応じて CEO に即報告
- post-mortem を ADR or memory に記録 (次回再発防止)

---

# Audit Depth Control (Layer 0 / 1 / 2)

> **Added: 2026-04-13** — per `ai-dev-framework/docs/tools/audit-depth-control-v3.md`
> **Mechanically auto-loaded** alongside the 4-layer review chain above.

## 4-layer chain と Layer 0/1/2 の関係 (重要)

**2 つは直交する概念**です。混同しないこと。

- **4-layer chain** = *誰が* レビューするか (dev → lead → auditor → CTO → CEO)
- **Layer 0/1/2** = *何を* チェックするか (自動 / LLM 意味判断 / approver 判断)

**Layer 0 で自動通過した項目は、4-layer chain のどの層でも重複チェックしない**。
lead / auditor / CTO は Layer 0 が拾った事実を再検証せず、Layer 1 の意味判断のみを担当する。

## Layer 0: 自動ゲート (CI / pre-commit / CLI が実行)

全 PR に適用、通過しなければレビュー対象にならない:

- `tsc --noEmit` 型チェック
- ESLint ルール違反 0 件
- 全テスト pass
- pre-commit checks (console.log / .skip / .only / secrets)
- framework check tests (偽テスト検出)
- **`scripts/detect-breaking-changes.sh`** (7 パターン検出)

Layer 0 通過 = 「このレベルの問題は存在しない」として以降の層が前提にできる。

## Layer 1: LLM 意味判断 (6 項目固定、LLM ベースの Gate が担当)

Layer 0 通過後のみ。自動化できない意味判断のみ扱う。
デフォルトでは Gate 2 (品質スイープ) / Gate 3 (敵対的レビュー) が担当。
本 org 構成では **codex-auditor** が担当層に相当。

```
スコープ判断 (2):
  [ ] PR description が変更の意図を正確に表現しているか
  [ ] 1 PR 1 concern に適合しているか

設計整合性 (2):
  [ ] 変更が SSOT の意図と一致しているか
  [ ] 既存アーキテクチャと一貫しているか

影響分析 (2):
  [ ] 他モジュール/サービスに予期しない影響が無いか
  [ ] エッジケースが適切に考慮されているか
```

**6 項目を PASS / FAIL / N/A で埋めたら完了**。7 項目目の追加は禁止 (「もっとチェックできないか」禁止)。

## Layer 2: approver 判断 (該当 PR のみ)

破壊的変更 / OSS 公開 / セキュリティ変更 / DB schema 変更 等、`route:ceo-approval` に該当する PR のみ発動。
approver は `.framework/config.json` の `approver` フィールドで設定可能、本 org デフォルトは CEO。

## PR タイプ別適用

| PR タイプ | Layer 0 | Layer 1 | Layer 2 |
|---|---|---|---|
| docs / test / lint / typo | ✅ のみ | skip | skip |
| 通常の機能追加 / バグ修正 | ✅ | ✅ (6 項目) | skip |
| 破壊的 / セキュリティ / 公開前 | ✅ | ✅ (6 項目) | ✅ (approver) |

## 破壊的変更の merge 前検証

`scripts/detect-breaking-changes.sh` が以下 7 パターンを検出:

1. fallback / default / catch / else の削除
2. 関数シグネチャ変更
3. `export` シンボル削除
4. `process.env.*` 削除
5. DB schema `DROP TABLE / COLUMN` / `ALTER TABLE ... DROP`
6. API エンドポイント削除 (`.get/.post/.put/.patch/.delete`)
7. shared / global / singleton リソース削除

**検出時**: PR に `breaking-change-verified` ラベル必須。ラベル無しは merge 不可。
ラベル付与の前に:
1. 影響を受ける全コンシューマーを特定
2. 各コンシューマーで動作確認
3. 検証結果を PR コメントに記録

## 修正ループ制御 (cycle 上限 3)

- cycle 1: 全レビュアーが確認。BLOCKER / CRITICAL のみ修正要求
- cycle 2: BLOCKER / CRITICAL を指摘したレビュアーが修正 diff のみ確認。
           新しい指摘は追加しない (スコープ固定)。
           **レビュアーチェーン再走は不要。** Layer 0 の CI green で自動検証は完了。
           合意済み修正の確認は指摘者 1 名で十分。
- cycle 3: 解決しなければ上位層 (CTO / CEO) に escalation

**WARNING 以下は follow-up issue に記録、PR 内での修正は不要**。

## 重大度定義

| 重大度 | 定義 | PR での扱い |
|---|---|---|
| BLOCKER | 本番障害 or セキュリティ脆弱性 | 修正必須、merge 不可 |
| CRITICAL | 機能が正しく動かない | 修正必須、merge 不可 |
| WARNING | 動作に影響しない | follow-up、merge 可 |
| INFO | 推奨 / スタイル | 記録のみ、merge 可 |

## Pre-impl gate skip 禁止 — framework hook で機械強制 (Sub-PR 2.7)

> **Effective: 2026-05-02**
> **CEO directive**: `bc79b603` 「framework に impl 作成時の auditor 監査をスクリプト的に導入、忘れる余地なく」
> **Sub-PR ref**: `lead-impl-workflow` Phase 2 Sub-PR 2.7

5-section 指示書を dev-bot に dispatch する前に **codex-auditor の Pre-impl gate LGTM** を取得する rule (governance-flow.md 上部 §Pre-impl gate section、2026-05-02 effective) は、本 sub-PR で **framework hook により機械強制** される。LLM 判断による skip は不可能になる。

### 強制機構 (Sub-PR 2.7 で land)

```
mcp__agent-comms__send / notify 呼出
  → ~/.claude/scripts/lead-pre-impl-gate-check/dispatch.sh (PreToolUse hook)
      ├─ Layer 1: hookInput parser (stdin JSON → tool_name / content / mentions)
      ├─ Layer 2: eventClassifier (5-section header AND dev-bot mention 両方真で gate 発動)
      ├─ Layer 3: preImplGateChecker (DATABASE_URL 経由で arc → auditor LGTM ≦ AGENT_COMMS_PRE_IMPL_WINDOW_SEC count)
      └─ Layer 4: dbAdapter (psql 実装、port 契約は §1 interface)
  → count > 0 → exit 0 (pass、silent)
  → count = 0 → exit 2 + JSON {"error_message", "blocked_for", "lgtm_search_window"} → 送信 block
```

### 適用範囲

- **対象 tool**: `mcp__agent-comms__send` / `mcp__agent-comms__notify`
- **対象 message**: `## 1. Interface contract` 〜 `## 5. Open decisions` 全 5 個 header AND `mentions` array に dev-bot agent_id (`adf-dev` / `hotel-dev` / `agent-com-dev` / `agent-mem-dev` / `nyusatsu-dev` / `wbs-dev` / `webb-dev` / `haishin-dev` / `xmarketing-dev` / `org-build-dev` / `upwork-dev` 等) 1 つ以上
- **検出 LGTM**: `agent_messages` table で `author_id='arc'` AND `'auditor' = ANY(input_mentions)` AND `created_at >= NOW() - WINDOW_SEC` AND `content ~ 'Pre-impl gate.*LGTM|Pre-impl gate.*PASS'`

### Window / fail-open / emergency bypass

- `AGENT_COMMS_PRE_IMPL_WINDOW_SEC` 環境変数 (default 3600 秒 = 1 時間)
- `DATABASE_URL` 不在 / DB 接続失敗 → fail-open + stderr WARN (production 中断回避)
- `AGENT_COMMS_PRE_IMPL_DISABLE=1` で gate 全 disable (emergency 専用、stderr に audit trail WARN)

### 過去 incident に対する mitigation

- msg `52c134fb` CEO 「日付の概念」「Pre-impl gate skip」reminder で発覚した skip pattern → 機械 hook で skip 不可化
- PR #110 cycle 1-3 overclaim BLOCK 連発 → Pre-impl gate 通過後の 5-section 凍結原則を hook で前置
- agent-comms-mcp PR #291 17 cycle (msg expansion stale LGTM 再利用) → window 1 hour で stale 再利用 block

### Repo / home の関係

- 本 file (`.claude/rules/governance-flow.md`) は repo derived snapshot。runtime authority は home `~/.claude/rules/governance-flow.md` (Sub-PR 2.7 (B) scope で ARC が同 section を home に sync)
- hook script 自体も Sub-PR 2.7 (B) で `~/.claude/scripts/lead-pre-impl-gate-check/dispatch.sh` に同 commit 内容で配置、`~/.claude/settings.json` PreToolUse matcher に登録される

### Test fixtures (本 repo 内、CI 強制)

- `tests/hooks/fixtures/*.json` (4 file): Claude Code PreToolUse payload shape、dev-bot mention 有無 / 5-section header 有無 の 4 組合せ
- `tests/hooks/seeds/*.sql` (3 file): clean / auditor-lgtm-recent / auditor-lgtm-stale (window 内外を分離)
- `tests/hooks/run.sh` + `npm run test:hooks`: T1-T9 を CI 上で実行、merge gate

詳細 lifecycle / failure mode は本 file 上部 §Pre-impl gate (2026-05-02 effective、CEO directive `c4fb8e6c`) と本 sub-PR PR description を参照。

---

## See also

- `~/Developer/tech-lead/docs/lead-playbook.md` §2 (詳細 & rationale)
- `~/Developer/tech-lead/.claude/memory/` (governance 関連 feedback memories)
- `~/.claude/rules/escalation-policy.md` (経営判断 vs 技術判断の境界)
- `ai-dev-framework/docs/tools/audit-depth-control-v3.md` (Layer 0/1/2 原典)
- `ai-dev-framework/docs/tools/breaking-change-detection.md` (検出スクリプト原典)
- `ai-dev-framework/docs/tools/preflight-check-design.md` (必読検証機構)
- `ai-dev-framework/.claude/scripts/lead-pre-impl-gate-check/dispatch.sh` (Sub-PR 2.7 enforcement hook)
