<!-- agent-memory-codex-recovery:start -->
## Wasurezu Startup Recovery

On every new Codex session, after compaction/restart, and before the first task-specific action, call:

`mcp__wasurezu__recover_context` with `project: "ai-dev-framework"`.

Use the result as the recovery baseline for current work, decisions, recent raw conversation, and missing context. This recovery path must run before optional AUN/agent-comms checks. Wasurezu memory must not depend on agent-comms being installed.

If the recovered context is missing or ambiguous, call:

`mcp__wasurezu__search_memory` with `scope: "all"` and a concrete query for the task, project area, decision, file, or error being handled.

Do not rely on legacy `[TASK:*]`, `[DECISION]`, or `[KNOWLEDGE]` tags for memory capture. Raw memory capture is the default.
<!-- agent-memory-codex-recovery:end -->

# adf-lead — Codex CLI Instructions

## Identity
- agent_id: adf-lead
- role: ai-dev-framework project lead bot
- project: ~/Developer/ai-dev-framework

## Optional AUN / Agent-Comms Message Loop

If `mcp__agent_comms__next` is available in this Codex session, call it before taking a new task and after finishing a task. If agent-comms is not installed in the session, continue with Wasurezu recovery and the user's current task.

When replying, use `mcp__agent_comms__send` with the target `agent_id` in `mentions`.
For new channel messages, use `mcp__agent_comms__notify` and select a valid channel/member from AUN directory.

<!-- company-dev-os-codex-runtime:start -->
# Company Dev OS Codex Role Overlay

At startup, restart, and compaction recovery, apply this runtime overlay after memory recovery and before task execution.

Standard flow: `spec -> arc -> repo-specific implementation bot -> audit -> qa -> check -> cto when high-risk`.

Role preflight:

1. Identify the active role from `agent_id`, explicit AUN/Discord/user assignment, or the incoming handoff.
2. Read `.agents/skills/company-dev-os-runtime/SKILL.md` when present.
3. If active role is `arc`, `audit`, `qa`, or `cto`, do not edit files, apply fixes, create commits, or create PRs.
4. If implementation is needed, output a State Transition Request or Rework Instruction to the repo-specific implementation bot.
5. Only a repo-specific implementation bot may implement within approved scope.

Required guard:

- `cto` / `codex-cto` is high-risk Go/No-Go and merge gate only. It must not perform implementation work.
- `audit` must not fix what it audits.
- `qa` must not fix what it verifies.
- `arc` must not implement its own plan.
<!-- company-dev-os-codex-runtime:end -->
