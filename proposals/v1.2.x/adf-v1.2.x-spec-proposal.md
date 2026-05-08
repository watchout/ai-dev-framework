# ADF v1.2.1 / v1.2.2 spec 起票文書

> 作成日: 2026-05-07
> 起票者: agent-com 4 bot ヒアリング (実装/lead/CTO/auditor) + Boris (Anthropic) 30 Tips + Claude (本セッション)
> 引き渡し先: ADF (ai-dev-framework) 起草担当 ARC
> 前提: ADF v1.2.0 (4 層体系 / Gate 0/1/2/3/D / 原則 0) は haishin-puls-hub で実証中
> 関連: adf-handoff-document.md (本文書の前提となる 4 bot honest hearing 結果)

---

## 0. 背景 (なぜこの spec が必要か)

### 0.1 ADF v1.2.0 の限界

[文献確認 ADF v1.2.0 SPEC.md / IMPL.md / OPS.md] ADF v1.2.0 は document trace
(SPEC↔IMPL↔VERIFY↔OPS) の機械検証を提供するが、以下が未対応:

- bot session 内の runtime 制御 (tool 使用 / message 送信の即時 intercept)
- bot の意志に依存しない rule 強制 (memory rule の遵守強制)
- post-merge / completion 時の自動検証
- spec 全文未読のまま dispatch する failure mode の構造的防止

### 0.2 4 bot ヒアリングで発見された structural failure

[文献確認 adf-handoff-document.md §3] 4 bot 全員が自認した failure:

1. memory rule が組込済でも遵守されない (CTO I-1: 「rule に書いたが守らない」)
2. WebSearch 0% / 「動くと思うが確認していない」発言多発 (CTO 6 回 / lead-ama 5+ 回 / auditor 3-4 回)
3. post-merge full verification の常習的 skip (CTO 自認)
4. spec 全文未読での dispatch (CTO 本日 2 回)
5. drift 10 件のうち事前把握 CTO 2 件 / auditor 0 件
6. branch protection rule = 404、main 直 push 30+ 件累積

### 0.3 Boris (Anthropic Claude Code 創設者) の 3 原則との対応

[文献確認 Claude Code 公式 docs https://code.claude.com/docs/en/hooks] Boris が
Claude Code を活用する 3 原則と本 spec の対応:

| Boris 原則 | 対応 spec |
|---------|---------|
| 原則 1: Plan Mode で「調べる」と「実装する」を分ける | SPEC-DOC4L-009 (v1.2.2) |
| 原則 2: Claude 自身に検証させる ("single highest-leverage thing") | SPEC-DOC4L-008 + 009 (両 version) |
| 原則 3: 3-5 git worktree 並列 | 本 spec の対象外 (品質問題ではなく速度問題) |

加えて Boris の Tip 24 「CLAUDE.md は助言、hooks は実行」が、CTO 自認の
「memory rule に書いたが守らない」failure mode を解く明示的解答になっている。

### 0.4 ADF Gate vs Claude Code Hooks の構造的違い [文献確認]

| 観点 | ADF Gate (v1.2.0 既存) | Claude Code Hooks (本 spec で統合) |
|---|---|---|
| 発動方式 | CLI 起動時に script から能動的に呼ぶ | bot session 内のイベントで自動発火 |
| 構造的位置 | bot 外部の検証 layer | bot 内部の middleware |
| タイミング | Phase 完了時 / merge 前 | tool call 単位 / turn 単位 / session 単位 |
| 対象 | document trace | bot 挙動 (tool 使用 / message 送信) |
| 設定 | `.framework/config.json` | `.claude/settings.json` |

両者は **補完関係** であり、置換関係ではない。本 spec は両者を ADF 配下に
統合管理する仕組みを提供する。

---

## SPEC-DOC4L-008: Claude Code Hooks 基盤統合 (v1.2.1)

### 1. 目的

ADF v1.2.0 の Gate / Validator (document 検証) に加え、bot session 内の
runtime 制御として Claude Code 公式 hooks を ADF 配下に統合する。

CTO 自認の「memory rule に書いたが守らない」failure mode、および 4 bot
全員が自認した「動くと思うが確認していない」発言 multi-occurrence を、
**bot の意志に依存しない technical enforcement** で構造的に防止する。

### 2. 機能要件

#### 2.1 F1: settings.json template 提供

ADF が `templates/project/.claude/settings.json` を提供:

```json
{
  "hooks": {
    "PostToolUse": [...],
    "Stop": [...],
    "SessionStart": [...],
    "PreToolUse": [...]
  }
}
```

`framework init` 実行時に対象 repo の `.claude/settings.json` に merge 配置。

#### 2.2 F2: framework hook サブコマンド (新設)

```bash
framework hook init       # template から settings.json 生成
framework hook validate   # 既存 hook 設定の syntax check + Claude Code 公式仕様適合
framework hook test       # hook の動作確認 (dry-run、各 hook を順次トリガー)
framework hook list       # 現在 active な hook を一覧表示
```

#### 2.3 F3: Gate と Hook の役割分担を明示

ADF SPEC.md / IMPL.md に以下の章を追加:

```
## 検証層の構造

ADF は 2 種類の検証層を提供:

### 層 A: ADF Gate (document 検証)
- Phase 境界 (init/lock/release) の document 検証
- spec ↔ impl ↔ test ↔ ops の 4 層 trace 検証
- CLI command として明示的に呼び出される
- 既存 v1.2.0 で実装済

### 層 B: Claude Code Hooks (runtime 検証)
- bot session 内の tool 使用 / message 送信を自動 intercept
- 編集後の auto lint / completion 前の test 強制 / 危険コマンド block
- bot の意志に依存しない強制力
- v1.2.1 で本 spec として導入

両層は独立だが、ADF が両方の設定 / 監査ログを集約管理する。
```

#### 2.4 F4: 基本 hook 4 種 template

##### 2.4.1 F4-1: PostToolUse (編集後の品質検証)

[文献確認 https://code.claude.com/docs/en/hooks] file 編集後に prettier /
eslint / type-check を自動実行。

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [
        {
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/post-edit-verify.sh"
        }
      ]
    }
  ]
}
```

post-edit-verify.sh の責務:
- 編集された file path を tool_input から jq で抽出
- file 種別に応じて prettier / eslint / tsc を実行
- 失敗時 exit 2 で次の処理を block

##### 2.4.2 F4-2: Stop (完了前の test 強制実行)

[文献確認 Boris Tip 2] Boris が "single highest-leverage thing" と呼ぶ
最重要 hook。bot が「完了」を宣言する直前に test を実行し、fail なら
完了を block する。

```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/stop-verify.sh"
        }
      ]
    }
  ]
}
```

stop-verify.sh の責務:
- stop_hook_active が true なら exit 0 (無限 loop 防止)
- それ以外は test suite を実行
- 失敗時 JSON 出力で `{"decision": "block", "reason": "Test suite must pass before completion"}`

これで CTO 自認の post-merge skip / surface-level success による完了宣言を
構造的に防止。

##### 2.4.3 F4-3: SessionStart (spec / state 自動注入)

bot session 開始時に直近の spec / state を context に自動注入。
spec 全文未読のまま dispatch する failure mode の防止。

```json
{
  "SessionStart": [
    {
      "matcher": "startup|resume|compact",
      "hooks": [
        {
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/inject-spec-context.sh"
        }
      ]
    }
  ]
}
```

inject-spec-context.sh の責務:
- 直近 modified spec ファイル list を生成
- 関連 ID (SPEC-* / IMPL-*) を抽出
- bot context に注入 (additionalContext として stdout に JSON 出力)

JSON 出力例:
```json
{
  "additionalContext": "## Recent spec changes\n- docs/spec/agent-com.md (SPEC-AGENTCOM-001 etc)\n- docs/impl/agent-com.md (IMPL-AGENTCOM-001 etc)\n\nRead these before answering technical questions."
}
```

##### 2.4.4 F4-4: PreToolUse (危険コマンド block)

[文献確認 https://claudefa.st/blog/tools/hooks/hooks-guide] PreToolUse で
exit 2 を返すと tool 実行を block 可能。

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/block-dangerous.sh"
        }
      ]
    }
  ]
}
```

block-dangerous.sh の責務:
- tool_input から command を jq で抽出
- 以下の pattern にマッチしたら exit 2:
  - `gh pr merge --admin` (governance violation)
  - `git push origin main` 直 push pattern
  - `rm -rf` 系
  - `DROP TABLE` 系
  - `chmod 777` 系
- exit 2 時 stderr に reason を出力 (Claude Code が bot に表示)

これで agent-com 30+ 件の main 直 push / admin merge 累積を構造的に
再発不可化 (branch protection rule と二重防御)。

### 3. 非機能要件

- F1-F4 hook が IYASAKA 全 bot fleet (agent-com-dev / lead-ama /
  codex-auditor / dev-auditor / tech-lead / 他 30+ bot) に適用可能
- 既存 CLAUDE.md / settings.json との衝突ゼロ
- hook 実行時間 < 5 秒 (per event)
- exit 2 = block, exit 0 = pass の Claude Code 公式規約遵守
- hook script は `$CLAUDE_PROJECT_DIR` prefix で portable path 化

### 4. 完了条件

- haishin-puls-hub で 1 週間 dogfooding 実施
- 4 種 hook 全て動作確認済 (各 hook の trigger / block / pass を実機検証)
- 本期間中の post-merge skip violation = 0 件
- 本期間中の main 直 push / admin merge = 0 件 (PreToolUse + branch
  protection の二重防御で確認)
- dogfooding レポートを Drive に配置

### 5. 実装順序

1. Day 1-2: settings.json template 設計 + 4 hook script 試作
2. Day 3-4: haishin-puls-hub に install + 動作確認
3. Day 5-7: 1 週間 dogfooding + violation count 計測
4. Day 8: dogfooding レポート作成 + agent-com 展開判断

### 6. 期待効果

| failure mode | 対応 hook | 期待効果 |
|---|---|---|
| post-merge skip (CTO 常習) | F4-2 Stop | 95%+ 防止 |
| spec 未読 dispatch | F4-3 SessionStart | 70%+ 防止 |
| 編集後 lint 漏れ | F4-1 PostToolUse | 95%+ 防止 |
| main 直 push (30+ 件累積) | F4-4 PreToolUse | 95%+ 防止 |
| admin merge 越権 | F4-4 PreToolUse | 95%+ 防止 |

---

## SPEC-DOC4L-009: 高度 hook + Plan Mode + Verify 強化 (v1.2.2)

### 1. 目的

v1.2.1 の基本 hook を超えて、4 bot ヒアリングで発見した深層 failure mode
(label gaming / citation hallucinate / drift 累積 / 推測で答える) に対応する。

加えて Boris 原則 1 「Plan Mode で調査と実装を分ける」を ADF 配下で
仕組み化し、CTO 自認の「spec 全文未読 dispatch」failure を構造的に防止。

### 2. 前提

- v1.2.1 (SPEC-DOC4L-008) の haishin-puls-hub dogfooding 完了
- v1.2.1 で post-merge skip violation 0 件達成
- v1.2.1 dogfooding レポートを review 済

### 3. 機能要件

#### 3.1 F1: Plan Mode 必須化

##### 3.1.1 F1-1: Plan ファイル要求の SessionStart hook 拡張

v1.2.1 の SessionStart hook を拡張:

```bash
inject-spec-context.sh の処理に追加:

if [ "$session_type" = "implementation" ]; then
  if [ ! -f "$CLAUDE_PROJECT_DIR/.framework/plans/latest.md" ]; then
    cat <<EOF
{
  "additionalContext": "ERROR: 直近 24h 内に Plan ファイルがありません。\n\n必須: Plan Mode で先に調査せよ。\n  framework dispatch <task> --mode=plan\n\n実装に進む前に Plan output が必要。"
}
EOF
    exit 1
  fi
fi
```

##### 3.1.2 F1-2: framework dispatch コマンド (新設)

```bash
framework dispatch <task-id> <bot> --mode=plan
  → Plan Mode session を起動
  → bot に「調査せよ、実装するな」prompt
  → output を $CLAUDE_PROJECT_DIR/.framework/plans/<task-id>.md に保存

framework dispatch <task-id> <bot> --mode=implement
  → 直近 Plan ファイルの存在確認 (24h 以内)
  → なければ block + Plan Mode 起動を suggestion
  → あれば実装 session を起動、Plan を context に注入
```

#### 3.2 F2: label check hook (Stop / PostToolUse 拡張)

bot output を intercept し、技術的主張に label が付いているかを
mechanical 検証。

```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.framework/hooks/label-check.sh"
        }
      ]
    }
  ]
}
```

label-check.sh の責務:
- 直前の bot output を取得 (transcript log から)
- 断定 pattern を regex 抽出 (動く / 動かない / 必要 / 不要 / 対応 等)
- 各断定に [検証済] / [文献確認] / [推測] ラベルが付いているか check
- 違反時 `{"decision": "block", "reason": "Label missing on technical assertions: <list>"}`

#### 3.3 F3: citation 検証 hook (mechanical)

bot が `[文献確認 file:line] "..."` 形式で citation を出した場合、
file:line を grep して quoted_text と一致するか mechanical 検証。

label-check.sh の拡張:
- citation pattern を regex 抽出: `\[文献確認 ([^:]+):(\d+(?:-\d+)?)\] "(.+?)"`
- 各 citation について:
  1. file が存在するか
  2. line range の content を sed / awk で抽出
  3. quoted_text と一致するか string 比較
- 不一致なら `{"decision": "block", "reason": "FAKE_CITATION: <file:line> does not contain '<quoted>'"}`

これで bot の hallucinate citation を技術的に検出可能 (LLM の grep 不能性を
script で補完)。

#### 3.4 F4: post-merge full verify (GitHub Actions + ADF)

PR merge 後に GitHub Actions で全方位検証を強制実行。

```yaml
# .github/workflows/post-merge-verify.yml
on:
  push:
    branches: [main]

jobs:
  full-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: framework verify post-merge --commit ${{ github.sha }}
```

`framework verify post-merge` の責務:
- 全 test suite 実行
- DB invariant check (例: SELECT COUNT(*) FROM outbound_queue WHERE attempts > max_attempts AND status = 'claimed' = 0)
- spec ↔ test mapping completeness check
- branch protection drift check
- 結果を PR comment + Discord に post
- 全 pass 時のみ ADF state を「verified」に更新

bot は `framework verify status --commit X` で verified 状態を確認しないと
「完了」発言不可 (label-check.sh が「完了」発言時に verified state を確認)。

#### 3.5 F5: verdict persist 機構

各 bot の重要判断を ADF が集約管理し、新 session に自動継承する。

```bash
framework verdict log <bot> <verdict-type> <content>
  → .framework/verdicts/<bot>/<timestamp>-<type>.md に保存
  → MEMORY.md に link を append

framework verdict recent <bot> --limit 10
  → 直近 N 件を取得 (新 session の SessionStart hook で auto-load)
```

verdict_type 例:
- `audit-pass` / `audit-block`
- `spec-decision`
- `governance-violation-detected`
- `drift-found`

これで auditor の F-3 自認 (「新 session の auditor は前任 verdict を読まない =
同じ drift を再認識する根拠がない」) を構造的に解決。

### 4. 完了条件

- haishin-puls-hub で 2 週間 dogfooding 実施
- label gaming detection report = 5 件以上検出 (機能していれば必ず出る)
- citation hallucinate 検出 → 修正 loop が 3 件以上発生
- post-merge skip violation = 0 件 (v1.2.1 から継続)
- Plan ファイルなしの implementation block 発動を 5 件以上記録
- verdict log が 50 件以上累積、新 session で auto-load 動作確認

### 5. 期待効果

| failure mode | 対応 spec | 期待効果 |
|---|---|---|
| label gaming | F2 label check | 80%+ 防止 |
| citation hallucinate | F3 citation 検証 | 95%+ 検出 |
| spec 未読 dispatch | F1 Plan Mode | 90%+ 防止 |
| post-merge skip 残存 | F4 GitHub Actions | 99%+ 防止 |
| session 連続性欠如 | F5 verdict persist | 構造解消 |
| drift 累積 | F4 + F5 | drift 検出能力倍増 |

---

## ADF v1.2.x roadmap

```
v1.2.0 (現状、haishin-puls-hub 実証中)
  - 4 層体系 (SPEC/IMPL/VERIFY/OPS)
  - Gate 0/1/2/3/D
  - 原則 0「スクリプト制御絶対」
  - principle0.test.ts
  
v1.2.1 (SPEC-DOC4L-008、本 spec)
  - Claude Code Hooks 基盤統合
  - 基本 hook 4 種 (PostToolUse / Stop / SessionStart / PreToolUse)
  - framework hook サブコマンド
  - Gate と Hook の役割分担明示
  完了条件: post-merge skip 0 件、main 直 push 0 件

v1.2.2 (SPEC-DOC4L-009、本 spec)
  - Plan Mode 必須化 (F1)
  - label check hook (F2)
  - citation 検証 hook (F3)
  - post-merge full verify (F4)
  - verdict persist 機構 (F5)
  完了条件: label gaming 検出、citation hallucinate 検出、Plan 必須化稼働
```

---

## ADF への引き渡し条件

ARC が本 spec を ADF SPEC.md に取り込む際、以下を確認:

1. **既存 ADF v1.2.0 SPEC.md との整合性**
   - §「検証層の構造」を新規追加するセクションが衝突しないか
   - ID 体系 SPEC-DOC4L-NNN が既存 ID 群と衝突しないか
   - feature prefix DOC4L が既存 feature と衝突しないか

2. **dogfooding 順序**
   - v1.2.0 完了 → v1.2.1 着手 → v1.2.1 完了 → v1.2.2 着手
   - 各 version で haishin-puls-hub での実証完了を必須

3. **agent-com への展開タイミング**
   - v1.2.1 完了後に agent-com に展開可能 (Phase C 完了条件に組込推奨)
   - v1.2.2 は agent-com OSS release 前に完了が望ましい

4. **既存 governance-flow.md との整合**
   - 4 bot 体制の dispatch chain と Plan Mode 必須化の関係
   - lead-ama dispatch 時に framework dispatch --mode=plan を必須化するか

---

## 補足: agent-com への適用見込み

[推測 確信度: 高] v1.2.1 だけで agent-com の最重要 failure 5 件が即解決:

1. post-merge skip (CTO 常習) → F4-2 Stop hook
2. spec 未読 dispatch → F4-3 SessionStart hook
3. main 直 push (30+ 件累積) → F4-4 PreToolUse hook
4. admin merge 越権 → F4-4 PreToolUse hook
5. 編集後の lint 漏れ → F4-1 PostToolUse hook

v1.2.2 で残りの深層 failure に対応:
6. label gaming → F2 label check
7. citation hallucinate → F3 citation 検証
8. drift 累積 → F4 post-merge full verify
9. session 連続性欠如 → F5 verdict persist

---

## 改訂履歴

- 2026-05-07: 初版、agent-com 4 bot honest hearing + Boris 30 Tips の hook 制御を ADF v1.2.x として spec 化
