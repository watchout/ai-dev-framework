# Sub-PR 2.7.1: IMPL-presence hook — 6-section dispatch spec

> **Status**: ARC 起草 6-section、adf-lead authoring 待ち
> **Created**: 2026-05-07 (ARC、PR #123 Finding 3a 解決後続)
> **Parent**: `docs/specs/lead-impl-workflow/IMPL.md` Sub-PR 2.7.1
> **Sibling**: Sub-PR 2.7.2 (PR #123、Pre-impl gate LGTM hook)
> **Honesty labels**: 全 claim に [検証済] / [文献確認] / [推測] を付ける（CEO directive 2026-05-07）

---

## 0. Dispatch context (凍結、新規 2026-05-07 6-section format)

- `target_project`: `ai-dev-framework`
- `dispatch_origin`: `arc` (本 spec)、後段 dispatch は `adf-lead` → `dev-001`
- `dispatch_reason`: parent IMPL.md Sub-PR 2.7 split (ARC verdict msg `0021f2e2`、PR #123 Finding 3a 解決) + memory `feedback_self_enforcement_via_hook` 趣旨実装

agent-memory MCP tool 呼出時は `project="ai-dev-framework"` を必ず明示（env default 不可）。

## 1. Interface contract (凍結)

### hook script

- **配置**: `~/.claude/hooks/lead-impl-presence-check.sh`
- **trigger**: Claude Code PreToolUse hook（`mcp__skill-runner__invoke` or 同等の skill 発火 tool）
- **対象 skill**: `lead-pr-instruction`（他 skill は no-op pass-through）

### signature

```bash
# Input: hook context (環境変数 + stdin JSON)
#   - SKILL_NAME: 発火しようとしている skill 名
#   - FEATURE_DIR: 対象 feature directory (例: docs/specs/<feature>/)
#   - 入力 JSON は Claude Code PreToolUse 仕様に従う
#
# Output:
#   - exit 0: 通過 (skill 発火継続)
#   - exit 2: block (skill 発火停止 + stderr に明確エラーメッセージ)
#
# 副作用: なし（read-only check のみ）
```

### invariants

- skill 名が `lead-pr-instruction` 以外のとき、exit 0 で即終了（fast path）
- `FEATURE_DIR` が空 / 不正のとき、exit 2 で block + メッセージ「FEATURE_DIR 不指定」
- `${FEATURE_DIR}/IMPL.md` が存在し、かつ Step 3.45 evidence (定義は §2 参照) が存在するとき exit 0
- 上記いずれか不在のとき exit 2 + 明確エラー

## 2. Required behavior (凍結)

### 2.1 検出 logic

[文献確認] parent IMPL.md L149-L154、`feedback_self_enforcement_via_hook`:

1. skill 名 != `lead-pr-instruction` → exit 0（pass-through）
2. `FEATURE_DIR/IMPL.md` 存在 check → 不在なら **block**（reason="IMPL.md 不在"）
3. Step 3.45 evidence check → 不在なら **block**（reason="Step 3.45 evidence 不在"）
4. 両方在存 → exit 0（pass）

### 2.2 Step 3.45 evidence の定義 [adf-lead 確定 2026-05-07]

**確定: 候補 A** (`${FEATURE_DIR}/IMPL.md` 内に `## Step 3.45` heading + non-empty content (>= 10 chars excluding heading))

- 検出 regex: `^##\s+Step\s+3\.45\b` で heading match、続く 1 行以上に non-blank content (heading だけは fail)
- 理由: 追加 file 不要 / IMPL.md 内自己完結 / Step 3.4 doc authoring と意味的整合 / git log 依存より deterministic / ARC 推奨と一致
- 候補 B (marker file) / C (git log) は本 sub-PR で **不採用**、再評価は将来 sub-PR で別途

### 2.3 production semantic

- 1 回の hook 起動で 50ms 以下（IO は IMPL.md 1 read のみ）
- idempotent（再実行で副作用なし、状態を持たない）
- グローバルに有効（lead-ama / lead-tuk / lead-sus / adf-lead 全 lead bot）

### 2.4 error message

block 時 stderr に以下:
```
[lead-impl-presence-check] BLOCK: skill `lead-pr-instruction` requires IMPL.md + Step 3.45 evidence in $FEATURE_DIR
  reason: <IMPL.md 不在 | Step 3.45 evidence 不在>
  fix: docs/specs/lead-impl-workflow/IMPL.md Step 3.4 に従い IMPL doc を authoring してから再実行
```

## 3. Forbidden behavior (凍結、anti-patterns)

[文献確認] 過去 incident 参照:

- **silent skip**: skill 名 mismatch 以外で exit 0 を返さない（block 条件を曖昧にしない）
- **auto-fix**: IMPL.md 不在を勝手に作成しない（memory `feedback_no_auto_fix.md`）
- **soft warn**: stderr に warning だけ出して exit 0 する fallback を作らない（block onlyで明確エラー、memory 同上）
- **mutate filesystem**: hook が IMPL.md 内容を変更しない、check のみ
- **環境変数依存以外で識別**: `SKILL_NAME` env / stdin JSON 以外で対象 skill を identify しない（fragile）
- **scope creep**: 本 sub-PR で Sub-PR 2.7.2 (LGTM hook) や issue #68 (pre-tool-call gateway) の責務を取り込まない

## 4. Test fixtures (凍結、merge gate)

[推測] 以下 contract test を実装、CI で pass 必須:

```bash
# tests/hooks/lead-impl-presence-check.test.sh

# Case 1: 別 skill → pass
SKILL_NAME=other-skill FEATURE_DIR=/tmp/dummy bash ~/.claude/hooks/lead-impl-presence-check.sh
assert_exit 0

# Case 2: lead-pr-instruction + IMPL.md 在存 + Step 3.45 在存 → pass
mkdir -p /tmp/feat-ok && echo -e "## Step 3.45\nDone" > /tmp/feat-ok/IMPL.md
SKILL_NAME=lead-pr-instruction FEATURE_DIR=/tmp/feat-ok bash ~/.claude/hooks/lead-impl-presence-check.sh
assert_exit 0

# Case 3: lead-pr-instruction + IMPL.md 不在 → block
SKILL_NAME=lead-pr-instruction FEATURE_DIR=/tmp/feat-no-impl bash ~/.claude/hooks/lead-impl-presence-check.sh
assert_exit 2
assert_stderr_contains "IMPL.md 不在"

# Case 4: lead-pr-instruction + IMPL.md 在存 + Step 3.45 不在 → block
mkdir -p /tmp/feat-no-step && echo "Just heading" > /tmp/feat-no-step/IMPL.md
SKILL_NAME=lead-pr-instruction FEATURE_DIR=/tmp/feat-no-step bash ~/.claude/hooks/lead-impl-presence-check.sh
assert_exit 2
assert_stderr_contains "Step 3.45 evidence 不在"

# Case 5: FEATURE_DIR 不指定 → block
SKILL_NAME=lead-pr-instruction FEATURE_DIR= bash ~/.claude/hooks/lead-impl-presence-check.sh
assert_exit 2
assert_stderr_contains "FEATURE_DIR 不指定"
```

CI 要件: 全 5 case pass、PR merge 条件。

## 5. Open decisions (implementer 自由)

dev-001 が以下を自由に決定可:

- shell script の internal 変数名（FEATURE_DIR を $f, $dir 等にしてよい）
- shell script の comment 量
- error message の wording 詳細（§2.4 の構造は守る）
- test framework の選択（bats / pure shell どちらでも可）
- Step 3.45 evidence の検出正規表現（`^##\s*Step 3\.45` を必須とするか、より緩く `Step 3.45` 文字列存在で OK とするか） — adf-lead が authoring 時に確定後、本 §2.2 候補 A で固定。

§0-§4 に列挙されないものは **暗黙凍結**。implementer は判断に迷ったら adf-lead に escalate。

---

## 後続 chain

1. ARC が本 spec を adf-lead に dispatch (本通達と一緒)
2. adf-lead が本 spec を確認 → §2.2 Step 3.45 evidence 定義を確定 → 6-section instruction を成形
3. auditor が Pre-impl gate (7 項目) で監査
4. dev-001 が impl + test + PR 起票 (`route:fast-merge` 想定、本人内部 hook なので外部 API 影響なし)
5. adf-lead L1 → auditor L2 → CTO L3 → merge
