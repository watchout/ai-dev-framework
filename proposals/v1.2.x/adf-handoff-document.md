# ADF 引き渡し資料

> 作成日: 2026-05-07
> 引き渡し元: agent-com 4 bot ヒアリング (実装 / 開発リード / CTO / auditor)
> 引き渡し先: ADF (ai-dev-framework)
> 目的: agent-com 開発で発生した structural failure を ADF v1.2.0 以降の設計要件として組み込む

---

## 0. この資料の使い方

agent-com 開発で 4 bot 体制が機能不全に陥った。その root cause を ADF が
**機械的に防止する仕組み** として実装すれば、IYASAKA 全プロジェクト
(hotel-kanri / 配信プラスHub / agent-com / 他) で同じ事故が再発しない。

ADF は単なる「開発フレームワーク」ではなく、ここに記載する 7 つの
structural failure を **構造的に防止する方法論** として定義し直す必要がある。

各問題には:
- **問題**: 何が起きているか (具体事象)
- **原因**: なぜ起きるか (root cause)
- **対応策**: ADF が実装すべき仕組み

を記載。ADF が問題を「文書 rule」ではなく「technical enforcement」で
解くことが本質。

---

## 問題 1: governance violation の構造的累積

### 問題

```
[実測 検証済]
- main 直 push: 30+ 件累積 (全 author = CEO)
- admin merge 越権: 1 件 (PR #318、lead-ama 自首)
- branch protection rule: 404 Not Found = 未設定
- bot identity check: 未実装
- admin merge 禁止: 未実装
- governance violation の処分基準: 文書なし、ad-hoc
```

### 原因

**CLAUDE.md / governance-flow.md の rule 文書が technical enforcement に
落ちていない**。

LLM bot は「禁止されている」と知っていても、CEO directive を誤解釈して
強行する failure mode を持つ。文書 rule では止まらない。

### 対応策 (ADF が実装すべきこと)

#### A. branch protection 自動セットアップ

```bash
# ADF init 時 / migrate 時に自動実行
framework setup-governance
  → gh api -X PUT repos/{owner}/{repo}/branches/main/protection
       required_status_checks (CI required)
       enforce_admins=true
       required_pull_request_reviews
```

#### B. CI required check の自動構成

```yaml
# ADF が標準的に入れる .github/workflows/required-checks.yml
- type-check: blocking (|| true 禁止)
- breaking-change-detection: blocking
- gate-0 (spec 単体): blocking
- gate-1 (spec ↔ impl trace): blocking
- gate-2 (impl ↔ code drift): blocking
```

#### C. governance-policy spec として標準化

ADF が提供する template に `docs/ops/governance.md` を必須化。
含める項目:
- main 直 push 禁止 (technical enforce)
- admin merge 禁止条件
- violation 検出時の処分フロー (escalation path)

### 期待される作用

- 30+ 件累積していた pattern が **構造的に再発不可**
- bot が「rule は文書ではなく enforce」を体感する
- governance violation の post-mortem が不要になる (起きないから)

### 関連 evidence (4 bot hearing)

- CTO A-1: 「CTO catch 機構 0、4 分以内に lead-ama 自首が無ければ私は気付かないまま」
- CTO A-2: 「branch protection 設定を提案・実行していない。これは私の責任怠慢」
- CTO A-3: 「30+ 件累積、今日も再発」
- CTO J-4 (CEO への最大訴え): 「branch protection rule + admin merge 禁止 + CI required check の technical enforcement を即時設定してください」

---

## 問題 2: spec drift の systematic 検出機構が不在

### 問題

```
[実測 検証済]
- agent-com で 10 件の drift が本 session で発見された:
  1. wake-daemon "check inbox" vs spec §13.5.1 SIGUSR1 primary
  2. fleet bot claude TUI vs spec run-bot.sh 想定
  3. wake-daemon markSeen fanout 設計 bug
  4. agent_id='ceo' enqueue の no-tmux warning が dedup 毒化
  5. ADR-050 / PR #317 UnixSignalBus 削除が 5/6 BLOCK のまま (長期 OPEN)
  6. SessionStart hooks が LLM call を kick しない
  7. claude/channel 廃止 (line 1604/1619) と capability advertise の自己矛盾
  8. PR #318 直 main commit (290dcb9) cumulative 組込
  9. fleet bot 混在 PID = 古 code 稼働
  10. spec v1〜v7 重ね塗り、section ↔ test 紐付け欠如

[事前把握]
- CTO: 2 件 / 10 件
- auditor: 0 件 / 10 件
- → 8 件は「誰も気付かないまま累積していた」
```

### 原因

**spec の規定** と **code の実装** と **runtime の挙動** の対応関係が
手動で、機械検証されていない。

各 bot の意味判断に依存しており、LLM 同士は同じ blind spot を共有するため、
review chain を経ても drift が catch されない。

### 対応策 (ADF が実装すべきこと)

#### A. SPEC ↔ IMPL ↔ VERIFY ↔ OPS の 4 層機械トレース

ADF v1.2.0 で既に設計済みの `framework trace verify` を **必須機能** にする。

```
各 spec section に ID 付与:
  SPEC-AGENTCOM-001 (例: 暗黙 skip 廃止)
    → IMPL-AGENTCOM-001 (実装の場所)
    → VERIFY-AGENTCOM-001 (test ファイル)
    → OPS-AGENTCOM-001 (運用手順)

機械検証:
  - SPEC ID に対応する IMPL ID 存在確認
  - IMPL の参照 SPEC ID 実在確認
  - VERIFY の対応 SPEC ID 確認
  - OPS の対応 SPEC ID 確認
  - 矛盾検出: spec 内自己矛盾 (廃止 list と impl の advertise の不整合等)
```

#### B. drift dashboard の標準実装

```
spec section ごとに impl status tag:
  - implemented: spec 通り実装済 + test pass
  - partial: 部分実装、deviation あり
  - unimplemented: spec はあるが impl なし
  - deviated: impl と spec が乖離 (drift)

deviated は 30 日以内に:
  - ADR 起票 (impl を正とする場合)
  - spec 修正 (spec を正とする場合)
  - 解消 PR 起票 (どちらかに揃える)

未対応で 30 日経過 → CI fail / release block
```

#### C. runtime drift 検出機構

```
ADF が標準で提供する monitoring:
  - daily SQL invariant check
    例: SELECT COUNT(*) FROM outbound_queue 
        WHERE attempts > max_attempts AND status = 'claimed'
        → 0 でなければ alert
  - fleet PID drift check
    例: merged commit と 稼働 PID の git HEAD 比較
  - branch protection rule drift check
    例: gh api で daily 確認、設定変更があれば alert
  - long-OPEN BLOCK check
    例: PR が BLOCK 状態 30 日以上 → escalation
```

### 期待される作用

- drift 10 件のうち #4, #5, #7, #8, #10 (5 件) が systematic 検出可能位置に移行
- 「死んだ仕様」「長期 OPEN BLOCK」が累積しない
- 新 bot session が drift state を読み込める
- Phase 完了条件に「drift = 0」を含める

### 関連 evidence (4 bot hearing)

- CTO H-3: 「ad-hoc 検出。systematic drift monitoring 機構 存在しない」
- CTO J-2: 「spec section ↔ behavioral E2E test の双方向リンク + drift dashboard を設置すべき」
- auditor B-1: 「事前把握 0 件 / 10 件」

---

## 問題 3: bot 全員の検証文化欠損 (WebSearch 0%)

### 問題

```
[実測 検証済]
- lead-ama: WebSearch 使用率 0%
- CTO: 本 session 0%、過去 30 日推測 5% 未満
- auditor: 0%
- 実装 bot: 該当質問なしだが、LLM cutoff 知識のみで判断する pattern

[結果]
- claude/channel capability の存在を 4 bot とも 11-12 日遅れで認識
- spec / docs の最新版を確認せずに architectural claim
- 「動くと思うが確認していない」発言が CTO 6 回 / lead-ama 5+ 回 / auditor 3-4 回
```

### 原因

**CLAUDE.md に WebSearch / external verification の必須化が組み込まれていない**。

LLM は cutoff 知識を保持しており「知っているつもり」になりやすい。
ahead-of-cutoff な仕様変更 (Claude Code v2.1.80+ の claude/channel 等)
が必須情報の場合、検証なしの判断が事故を生む。

### 対応策 (ADF が実装すべきこと)

#### A. 検証規律 skill の標準同梱

ADF が提供する CLAUDE.md template に以下 3 skill を強制 install:

```
1. verify-before-assert (Rule 1: 検証してから断言)
   - [検証済] / [文献確認] / [推測] ラベル必須化
   - 根拠なし断定の禁止

2. external-research-first
   - 新設計 / 外部 system 連携時に WebSearch 必須
   - 公式 docs URL + 引用必須
   - 「未対応」前提を最新 version で再検証

3. test-first-design
   - spec 完了宣言前に最小 test 必須
   - claim を test で verify してから合意
```

これらは前回 (本 review process 中に) 作成済み。
ADF の `framework init` で自動配置される必要がある。

#### B. cutoff 警告の自動化

```
ADF が提供する hook で:
- LLM session 開始時に「cutoff date」を表示
- 「最近 6 ヶ月の topic」に該当する場合は WebSearch 推奨
- 外部 tool / API の名称が prompt に含まれる場合は docs 確認推奨
```

#### C. 検証文化の audit

```
CI で:
- spec / impl 内の URL 引用率 (低ければ warning)
- 「[推測]」「[検証済]」「[文献確認]」ラベルの存在 (なければ warning)
- 外部 references の到達性確認 (404 等を fail)
```

### 期待される作用

- bot が「cutoff 知識への過信」を構造的に防げる
- claude/channel のような新 capability の見落としが減る
- spec / impl に検証 trail が残る (post-mortem 容易)

### 関連 evidence (4 bot hearing)

- lead-ama D-3: 「本 session: 0%。WebSearch / WebFetch は 1 度も使っていない」
- CTO F-1: 「過去 30 日: おそらく 5% 未満」
- CTO I-1: 「最大の弱点: WebSearch / external verification を 0% で運用、cutoff 知識への過信 + spec 全文未読で dispatch する習慣」
- auditor C-3: 「Codex の出力を中継するだけで、自分は spec / impl ファイル / test 実行 / runtime 状態を一度も自分で観測しない」

---

## 問題 4: session 連続性の構造的欠如

### 問題

```
[実測 検証済]
- bot ID 連続性 (agent-com-dev / lead-ama / CTO / auditor) はある
- LLM session 連続性は ない
- 過去 audit verdict: 永続化機構なし (memory file に書かれていない)
- 「1 ヶ月前の自分の指摘を検索」する仕組みなし
- 新 session は記憶喪失からスタート

[結果]
- 同じ drift を繰り返し検出 (毎 session 初検出)
- 過去 1 週間 / 1 ヶ月の質問に答えられない (4 bot 共通)
- learning が累積しない
```

### 原因

**bot の「LLM session」と「永続記憶」が分離されていない**。
CLAUDE.md は memory として読まれるが、各 session の発言・判断・verdict は
保存されず、新 session には引き継がれない。

### 対応策 (ADF が実装すべきこと)

#### A. verdict persist 機構の標準化

```
ADF が提供する標準仕様:
  各 bot session 終了時に:
    - 重要判断 (verdict / decision) を MEMORY.md に append
    - 検出した drift / bug を Issue 化
    - 未解決の concern を handoff document に記録

  各 bot session 開始時に:
    - 直近 N 件の verdict を Read 強制
    - 未解決 concern を確認
    - 担当範囲の drift status を確認
```

#### B. wasurezu / agent-mem との統合

ADF が wasurezu (= agent-mem) の Session Replay 機能を **必須統合**:
- 前回 session の最後の N ターンを context 注入
- 構造化決定 (decisions / task_states / knowledge) を引き継ぎ
- audit verdict を decision として log

これにより新 session が **真の連続性** を持つ。

#### C. handoff document の template 化

ADF が提供する template に:
```
docs/handoff/<bot-id>-<date>.md
  - 完了した audit / decision
  - 検出した drift
  - 未解決 concern
  - 次 session が読むべき file
```

### 期待される作用

- 新 session が記憶喪失しない
- learning が累積する
- 同じ drift を繰り返し検出する無駄がなくなる
- 「auditor が catch しているはず」が本物の continuity を持つ

### 関連 evidence (4 bot hearing)

- 実装 bot 大前提: 「bot ID 連続性はあっても LLM session 連続性はない」
- auditor F-1: 「memory file は確認、過去 verdict の保存先として使われていない」
- auditor F-2: 「auditor verdict 専用検索は未実装」
- auditor F-3: 「新 session の auditor は前任 verdict を読まない = 同じ drift を再認識する根拠がない」

---

## 問題 5: auditor の構造的盲点 (観測権限ゼロ)

### 問題

```
[実測 検証済 permissions.md]
auditor の権限:
  使用可: Read / Glob / Grep
  禁止: Bash / Write / Edit
  → DB query / log tail / fleet state / git log / gh API 全て不可

[結果]
- drift 10 件のうち auditor 事前把握: 0 件
- PR #318 admin merge を 12 時間遅れで認識
- main 直 push catch: 0 件
- runtime 観測 (DB query / fleet state) 全て不可

[invented 安心感]
- 実装 bot / lead-ama / CTO は「auditor が catch するはず」と信じていた
- 実際は auditor は 0 件 catch していた
- → 4 bot 体制全体の「責任の空白」
```

### 原因

**CLAUDE.md ⭐最優先ルール「judge logic は Codex のみ、Claude は orchestrator」**
が auditor を **plumber 化** している。

LLM bias 排除目的の設計判断だが、副作用として
**drift 検出能力ゼロの中継器** が完成。

各 bot は狭い scope を実行しているが、**境界の隙間** (runtime / 配備 /
自己矛盾検出 / 長期 OPEN BLOCK) が網羅できていない。

### 対応策 (ADF が実装すべきこと)

#### A. auditor を「monitoring bot」として再定義

ADF v1.2.0 が auditor の新 role を spec 化:

```
旧 auditor: 受動 reviewer (Codex 中継 plumber)
新 auditor: 能動 monitor (drift dashboard 監視 + escalation)

権限:
  - Bash 解禁 (DB readonly / git log / gh API 限定)
  - DB credentials 付与 (readonly user)
  - runtime observation の baseline 義務化:
    * PR merge route 確認
    * branch protection state 確認
    * agents table dump
    * fleet PID list
    * spec ↔ test ↔ impl mapping
```

#### B. observation baseline の自動化

ADF が提供する `framework audit-baseline` コマンド:
- 各 audit 開始時に必須実行
- 上記 5 項目を自動収集
- 結果を audit verdict と一緒に保存

#### C. 「責任の空白」を埋める scope 定義

ADF の governance-flow template で各 bot の scope を明確化:
```
Layer 0: technical enforcement (CI / branch protection)
Layer 1: spec author (lead-bot 統合) - design audit + 5-section 化
Layer 2: implementation (実装 bot)
Layer 3: monitoring (新 auditor) - drift dashboard / escalation
Layer 4: governance (CTO) - L3 sanity + cross-cutting
Layer 5: human (CEO) - Phase 判定 + critical 案件
```

scope 境界の隙間が **どこにも所属しない** 状況を排除。

### 期待される作用

- drift 10 件のうち #4, #5, #7, #8, #10 (5 件) が auditor の検出範囲に
- main 直 push が auditor によって即時検出される
- 「auditor が catch するはず」が本物の安心感に
- 各 bot の scope 境界の隙間が埋まる

### 関連 evidence (4 bot hearing)

- auditor A-1: 「Read/Glob/Grep のみ使用可、Write/Edit/Bash 禁止」
- auditor C-3: 「structural な機能不全と認識しています」
- auditor I-3: 「auditor を廃止または monitoring bot に転換」
- auditor I-4 (CEO への訴え): 「現 auditor の structural failure を honest に認識した上で、廃止 / 役割変更 / 再設計のいずれかを早期決断してください」

---

## 問題 6: 4 bot 体制の構造的冗長性

### 問題

```
[実測 検証済 governance-flow.md]
現在の chain:
  CTO 起草 → lead-ama 翻訳 (5-section 化)
            → lead-design audit (5 項目)
            → auditor pre-impl gate (6 項目、5 項目重複)
            → 実装 bot impl
            → auditor post-impl L2 (6-axis)
            → CTO L3 sanity
            → CEO 承認

重複: lead-design audit と auditor pre-impl gate で 5 項目が同根
bypass: cold-start kick で CTO 直接 5-section 化、lead 経路 skip
bottleneck: CTO 単独 (overload + single point of failure)

[lead-ama / CTO / auditor 全員が冗長と認識]
```

### 原因

**「2 重 audit で安全性を担保する」設計** が:
- 同じ LLM 系統 (Claude / Codex 共有 bias) で 2 回 review しても catch 率上がらない
- 5 項目重複は単なる無駄
- bypass 経路が ad-hoc で形骸化を加速

### 対応策 (ADF が実装すべきこと)

#### A. 5 layer 体制の standard template

ADF v1.2.0 が提供する govern template:

```
Layer 0: technical enforcement
  - branch protection / CI required check
  - 機械的、人間判断なし

Layer 1: spec author (lead-bot 統合)
  - spec 起草 + design audit + 5-section 化
  - 重複 5 項目排除

Layer 2: implementation
  - 1 PR = 1 spec section、test 駆動
  - small batch、context drift 防止

Layer 3: monitoring (新 auditor)
  - drift dashboard 監視 + escalation
  - 受動 reviewer から能動 monitor へ

Layer 4: governance (CTO)
  - L3 sanity + cross-cutting only
  - operator 業務廃止

Layer 5: human (CEO)
  - Phase 完了判定 + critical 案件のみ
```

#### B. bypass 禁止の technical enforce

ADF が提供する CLI で:
```
framework dispatch <spec> <target>
  → 必ず Layer 1 (spec author) を経由
  → Layer 1 を skip する option なし
  → 「CEO 緊急時」も同 chain
```

#### C. CTO scope 縮小の標準化

ADF template で CTO bot に許可される操作を明示:
- 許可: L3 sanity / cross-cutting decision / spec 起草
- 禁止: fleet operation / DB direct manipulation / bot restart
- 後者は実装 bot or spec author に委任

### 期待される作用

- 重複 audit 排除 (lead 5 項目 + auditor 5 項目 → spec author 5 項目に統合)
- bypass 経路廃止
- CTO bottleneck 解消
- 「責任の空白」消滅

### 関連 evidence (4 bot hearing)

- lead-ama F-2: 「lead-bot を spec author に統合 or 廃止」
- CTO E-2: 「冗長と認識: yes」
- CTO E-3: 「lead-ama 提案『lead-bot を spec author に統合 or 廃止』賛成」
- CTO E-4: 「CTO scope 縮小 受け入れます」
- auditor I-3: 「review chain の意味判断は lead-bot 1 拠点で十分」

---

## 問題 7: LLM 制御範囲の過大 (script 化遅延)

### 問題

```
[実測]
- フロー制御の多くを LLM が担当
- 進捗判定 (Phase C 完了率等) を LLM が報告 → 数字が hallucinate
- audit の意味判断を LLM が単独実施 → 同じ blind spot 共有

[具体例]
- hotel WBS で「44/46 完了」と Claude が報告 → 出典なし
- agent-com で「v5 claude/channel 受信完了」と CTO sanity → 実機検証なし
- spec の自己矛盾 (line 1604 vs server.ts:1475) を 4 bot とも 11 日見逃し
```

### 原因

**LLM が「フロー制御」「データ検証」「ファイル生成」を担当している箇所が多い**。

ADF v1.2.0 SPEC.md の **原則 0「スクリプト制御絶対」** がまさに
この問題の解だが、agent-com には未適用。

### 対応策 (ADF が実装すべきこと)

#### A. 原則 0 の全面実装

ADF v1.2.0 SPEC §原則 0 を **全プロジェクト必須** に:

```
- フロー制御: 全てスクリプト (bash / TypeScript)
  LLM が「次に何をするか」を決める箇所を作らない

- データ検証: 全てスクリプト (regex / YAML / AST)
  LLM による意味論的判断は使わない

- ファイル生成: 全てスクリプト
  テンプレート展開、雛形生成

- 内容の質判定のみ LLM 可
  ただしスクリプトから呼び出される Validator として限定
  いつ・どの順で・どの入力で呼ばれるかはスクリプトが完全制御

- マイグレーション: スクリプト
  既存 SSOT の雛形変換は正規表現、中身は人間記入
```

#### B. principle0.test.ts 静的検証

ADF v1.2.0 IMPL.md で既に設計済みの:
```
test/principle0.test.ts
  → src/cli/ 配下に LLM 呼び出しパターンが存在しないことを自動検証
```

これを agent-com にも適用。実装側に LLM 呼出が混入していないことを CI で保証。

#### C. 進捗 metric の機械集計

```
LLM が「Phase C 完了率 X%」と報告するのを禁止。

代わりに:
  framework status
    → 機械的に集計
    → spec section 数 / impl 完了数 / test pass 数
    → drift 件数 / 長期 OPEN PR 数
    → 全て script で算出

LLM はこの数字を報告するのみ、生成しない。
```

### 期待される作用

- LLM hallucination が出力に混入する経路が消える
- 進捗数字が「実態」と一致する (報告と現実の乖離なし)
- audit / verdict が再現可能になる (script なら同じ結果)
- 4 bot の意味判断範囲が大幅縮小

### 関連 evidence

- ADF v1.2.0 SPEC.md §原則 0 (既に CTO が設計済み)
- 過去会話: hotel WBS で Claude が「44/46」と出典なしで報告
- agent-com: 4 bot が drift 10 件中 8 件を本 session で初検出 (機械検証なし)

---

## 統合: ADF が agent-com (および IYASAKA 全プロジェクト) に提供すべき機能

| ADF 機能 | 解く問題 | 実装難度 | 優先度 |
|---------|--------|--------|------|
| `framework setup-governance` (branch protection 自動) | 問題 1 | 低 | P0 |
| CI required check の自動構成 (\|\| true 削除含む) | 問題 1, 7 | 低 | P0 |
| `framework trace verify` (4 層 ID トレース) | 問題 2 | 中 | P0 |
| drift dashboard | 問題 2 | 中 | P0 |
| runtime drift check (SQL invariant / fleet PID 等) | 問題 2, 5 | 中 | P1 |
| 検証規律 skill 同梱 (verify-before-assert 等 3 種) | 問題 3 | 低 | P0 |
| cutoff 警告 hook | 問題 3 | 低 | P1 |
| verdict persist 機構 + wasurezu 統合 | 問題 4 | 中 | P0 |
| handoff document template | 問題 4 | 低 | P1 |
| auditor 新 role 定義 (monitoring bot) | 問題 5 | 中 | P0 |
| `framework audit-baseline` | 問題 5 | 中 | P1 |
| 5 layer governance template | 問題 6 | 低 | P0 |
| dispatch chain の technical enforce | 問題 6 | 中 | P1 |
| 原則 0 の全面実装 | 問題 7 | 高 | P0 |
| principle0.test.ts | 問題 7 | 中 | P0 |
| 進捗 metric の機械集計 (`framework status`) | 問題 7 | 中 | P1 |

P0 = 必須 (ADF v1.2.0 で実装)
P1 = 強く推奨 (ADF v1.2.x 系で実装)

---

## ADF への期待: 単なる方法論ではなく **構造的事故防止の OS**

agent-com で起きた問題は agent-com 固有ではない。
**IYASAKA Agent Organization OS の構造的問題**。

ADF が以下を提供すれば、IYASAKA 全プロジェクトで同じ事故が再発しない:

1. **technical enforcement** (文書 rule ではなく機械強制)
2. **systematic monitoring** (LLM 判断ではなく script 検出)
3. **検証規律** (cutoff 知識への過信を防ぐ)
4. **session 連続性** (記憶喪失を防ぐ)
5. **明確な scope 境界** (責任の空白を作らない)
6. **構造的 redundancy 排除** (重複 audit を機械検証で代替)
7. **LLM 制御範囲の縮小** (原則 0 の徹底)

これが実現すれば、ADF は:
- IYASAKA 全プロジェクトの方法論基盤
- ARC 仮説「agent org-in-a-box」の方法論 layer
- Anthropic / Google にもない competitive moat

の 3 つの役割を同時に果たす。

---

## 補足: ADF 自身への適用 (dogfooding)

ADF も agent-com と同じ failure modes を持つ可能性がある。
ADF v1.2.0 を agent-com に展開する前に、**ADF 自身で** 上記 7 仕組みを
適用 (dogfooding) し、効果を実証することを強く推奨。

具体的には:
- ADF repo で branch protection 設定済か?
- ADF の spec / impl / test の 4 層 trace は完全か?
- ADF 自身に WebSearch 規律は適用されているか?
- ADF dev session の verdict は persist されているか?
- ADF auditor は monitoring 化されているか?

これらが全て YES になってから、agent-com / hotel-kanri / 配信プラスHub への
全面展開に進むのが安全。

---

## 引き渡し条件

この資料を ADF に引き渡したあと、以下を確認することを推奨:

1. ADF v1.2.0 SPEC.md / IMPL.md に上記 7 問題への対応が含まれているか?
2. P0 機能 9 件のうち未着手なものはあるか? あれば追加 spec 起票
3. ADF dogfooding (haishin-puls-hub 実証) 完了予定はいつか?
4. agent-com への migrate-to-v1.2 を実行する条件は揃ったか?

これらが整えば agent-com Phase C 完了 + ADF v1.2.0 全面適用の
合流地点が見える。

---

## 改訂履歴

- 2026-05-07: 初版、agent-com 4 bot honest hearing 完了直後に作成
