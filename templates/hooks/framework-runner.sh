#!/bin/bash
# framework-runner.sh — Dev Bot自律タスク取得・実行エンジン
#
# autonomy.json v2.0.0 のルール定義に基づき、GitHub Issues から
# タスクを取得し、autonomy level に応じて行動を決定する。
#
# Usage:
#   framework-runner.sh              ← SessionStart / cron から呼ばれる
#   framework-runner.sh --heartbeat  ← cron ハートビート（アイドル時のみ実行）
#
# Output: [提案] / [報告] / タスク情報を stdout に出力
# Exit 0 = 正常, Exit 1 = エラー

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
AUTONOMY_FILE="$PROJECT_DIR/.framework/autonomy.json"
RUN_STATE_FILE="$PROJECT_DIR/.framework/run-state.json"
HEARTBEAT_MODE="${1:-}"

# ─── 前提チェック ───
if ! command -v gh &>/dev/null; then
  echo "[framework-runner] gh CLI not found. Skipping." >&2
  exit 0
fi

if ! gh auth status &>/dev/null 2>&1; then
  echo "[framework-runner] gh not authenticated. Skipping." >&2
  exit 0
fi

if [ ! -f "$AUTONOMY_FILE" ]; then
  echo "[framework-runner] autonomy.json not found. Skipping." >&2
  exit 0
fi

# ─── ハートビートモード: アイドルチェック ───
if [ "$HEARTBEAT_MODE" = "--heartbeat" ]; then
  if [ -f "$RUN_STATE_FILE" ]; then
    CURRENT_STATUS=$(node -e "
      try {
        const s = JSON.parse(require('fs').readFileSync('$RUN_STATE_FILE', 'utf8'));
        console.log(s.status || 'idle');
      } catch { console.log('idle'); }
    " 2>/dev/null)
    if [ "$CURRENT_STATUS" = "running" ]; then
      exit 0  # タスク実行中 → スキップ
    fi
  fi
fi

# ─── GitHub Issues 取得 ───
ISSUES_JSON=$(gh issue list --assignee @me --state open --json number,title,labels,body,url --limit 20 2>/dev/null)

if [ -z "$ISSUES_JSON" ] || [ "$ISSUES_JSON" = "[]" ]; then
  echo "[framework-runner] No open issues assigned. Idle."
  exit 0
fi

# ─── autonomy.json からラベルマッピングを読み込み ───
RESULT=$(node -e "
const fs = require('fs');

try {
  const autonomy = JSON.parse(fs.readFileSync('$AUTONOMY_FILE', 'utf8'));
  const issues = JSON.parse(\`$ISSUES_JSON\`);

  // Build label → level map
  const labelMap = {};
  for (const [level, def] of Object.entries(autonomy.levels || {})) {
    for (const label of (def.issueLabels || [])) {
      labelMap[label.toLowerCase()] = level;
    }
  }

  // Priority label order
  const priorityLabels = autonomy.taskSelection?.priorityLabels || { P0: 0, P1: 1, P2: 2 };

  // Classify each issue
  const classified = issues.map(issue => {
    const issueLabels = (issue.labels || []).map(l => (l.name || l).toLowerCase());

    // Determine autonomy level
    let level = 'approval_required'; // default: safest
    for (const label of issueLabels) {
      if (labelMap[label]) {
        const candidate = labelMap[label];
        // Pick least restrictive match
        if (candidate === 'autonomous') { level = 'autonomous'; break; }
        if (candidate === 'notify_then_proceed' && level !== 'autonomous') {
          level = 'notify_then_proceed';
        }
      }
    }

    // Override: if any approval-required label exists, force approval
    for (const label of issueLabels) {
      if (labelMap[label] === 'approval_required') {
        level = 'approval_required';
        break;
      }
    }

    // Priority score (lower = higher priority)
    let priority = 999;
    for (const label of issueLabels) {
      const upper = label.toUpperCase();
      if (priorityLabels[upper] !== undefined) {
        priority = Math.min(priority, priorityLabels[upper]);
      }
    }

    return {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      labels: issueLabels,
      level,
      priority
    };
  });

  // Sort by priority, then by issue number (oldest first)
  classified.sort((a, b) => a.priority - b.priority || a.number - b.number);

  // Output
  console.log(JSON.stringify({ tasks: classified, count: classified.length }));
} catch (e) {
  console.error('[framework-runner] Error: ' + e.message);
  process.exit(1);
}
" 2>/dev/null)

if [ -z "$RESULT" ]; then
  echo "[framework-runner] Failed to classify issues." >&2
  exit 1
fi

TASK_COUNT=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).count))")

if [ "$TASK_COUNT" = "0" ]; then
  echo "[framework-runner] No actionable issues found."
  exit 0
fi

# ─── 最優先タスクを取得 ───
NEXT_TASK=$(echo "$RESULT" | node -e "
let d='';
process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const r = JSON.parse(d);
  const t = r.tasks[0];
  console.log(JSON.stringify(t));
});
")

TASK_NUMBER=$(echo "$NEXT_TASK" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).number))")
TASK_TITLE=$(echo "$NEXT_TASK" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).title))")
TASK_LEVEL=$(echo "$NEXT_TASK" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).level))")
TASK_URL=$(echo "$NEXT_TASK" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).url))")
TASK_LABELS=$(echo "$NEXT_TASK" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).labels.join(', ')))")

# ─── 出力 ───
echo ""
echo "============================================"
echo "  Framework Runner: Task Found"
echo "============================================"
echo "  Issue:     #$TASK_NUMBER"
echo "  Title:     $TASK_TITLE"
echo "  Labels:    $TASK_LABELS"
echo "  Autonomy:  $TASK_LEVEL"
echo "  URL:       $TASK_URL"
echo "  Queue:     $TASK_COUNT total open issues"
echo ""

case "$TASK_LEVEL" in
  autonomous)
    echo "  → 自律実行可能。着手して完了後に報告します。"
    echo ""
    echo "[ACTION] autonomous"
    echo "[ISSUE] #$TASK_NUMBER"
    echo "[TITLE] $TASK_TITLE"
    ;;
  notify_then_proceed)
    echo "  → CTOに[提案]を送信。5分以内に[却下]がなければ着手します。"
    echo ""
    echo "[ACTION] notify_then_proceed"
    echo "[ISSUE] #$TASK_NUMBER"
    echo "[TITLE] $TASK_TITLE"
    ;;
  approval_required)
    echo "  → CTO承認が必要です。[承認依頼]を送信して待機します。"
    echo ""
    echo "[ACTION] approval_required"
    echo "[ISSUE] #$TASK_NUMBER"
    echo "[TITLE] $TASK_TITLE"
    ;;
esac

echo "============================================"
