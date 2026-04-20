#!/bin/bash
# post-task.sh — タスク完了後に次タスクを提案
#
# GitHub Issues (SSOT) から次のタスクを取得し、autonomy判定結果を出力する。
# framework-runner.sh を再実行して次タスクを提案する形。
#
# Usage: post-task.sh [completed_task_id]
# Output: 次タスク提案（stdout → Claude Code コンテキスト）

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
COMPLETED_TASK="${1:-}"
RUNNER="$PROJECT_DIR/.claude/hooks/framework-runner.sh"

if [ -n "$COMPLETED_TASK" ]; then
  echo ""
  echo "[完了] タスク: $COMPLETED_TASK"
  echo ""
fi

# Delegate to framework-runner.sh (GitHub Issues SSOT, #61)
if [ -x "$RUNNER" ]; then
  exec bash "$RUNNER"
fi

echo "[post-task] framework-runner.sh not found. No next task."
exit 0
