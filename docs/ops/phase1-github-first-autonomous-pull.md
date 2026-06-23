---
id: OPS-GHFIRST-401
status: Draft
traces:
  spec: [SPEC-GHFIRST-401]
  impl: [IMPL-GHFIRST-401]
  verify: [VERIFY-GHFIRST-401]
---

# OPS: GitHub-First Autonomous Pull Contract

## 0. Corresponding SPEC
`docs/spec/phase1-github-first-autonomous-pull.md` /
SPEC-GHFIRST-401.

## 1. Operator Flow
1. Create or update a GitHub issue as the Work Order source.
2. Fill the governance Work Order template with goal, scope, non-scope,
   acceptance criteria, role flow, current owner, next action, evidence
   required, required review, and GitHub durable state URL.
3. Assign a `runner_policy`.
4. Define the bounded `phase_goal`.
5. Add labels or equivalent fields for needs, owner, route, blocked, ready, and
   done state.
6. Let the runner execute only while the phase goal remains in scope.
7. Write implementation, checks, review, QA, CTO, runtime, and residual-risk
   evidence back to the GitHub issue or PR.
8. Stop and hand off when a protected boundary, approval boundary, or missing
   evidence condition is encountered.

## 2. Minimal Work Order Addendum
```json
{
  "github_state_ref": {
    "issue_url": "https://github.com/watchout/ai-dev-framework/issues/401",
    "pr_url": "https://github.com/watchout/ai-dev-framework/pull/<number>",
    "durable_state": "github_issue_pr"
  },
  "phase_goal": {
    "phase_id": "shirube-401.contract.impl",
    "phase_type": "implementation",
    "goal": "Define the GitHub-first Work Order contract in a small PR.",
    "scope": ["Docs, templates, and warning-first contract fields."],
    "non_scope": ["AUN live puller.", "merge automation.", "production runtime mutation."],
    "acceptance_criteria": ["Draft PR opened with evidence handoff."],
    "target_files_or_modules": ["docs/**", "templates/**", "src/cli/lib/workflow-state.ts"],
    "allowed_implementation_actions": ["edit files", "run checks", "open draft PR"],
    "required_checks": ["focused tests", "type-check", "trace verify"],
    "stop_conditions": ["CTO approval boundary", "AUN rollout boundary", "merge boundary"],
    "evidence_writeback": ["PR body", "PR comment", "issue progress comment"],
    "next_phase_handoff": "L1/L2/L3 protected governance review"
  },
  "runner_policy": {
    "policy": "codex_native_fast_lane",
    "github_queue_ssot": true,
    "aun_usage": "optional_acceleration_only"
  },
  "evidence_contract": {
    "required_evidence": ["PR comment", "checks", "review links", "runtime evidence when applicable"],
    "not_sufficient_evidence": ["AUN ACK", "queue ID", "Discord projection", "green CI alone"],
    "merge_done_separation": true
  }
}
```

## 3. Pull Rules
Bots check GitHub work at these lifecycle points:

- startup or restart;
- after task completion;
- before idle;
- when an AUN notification includes a GitHub URL;
- supervised idle worker after the runtime puller is approved.

Do not make OS cron the normal scheduler.

## 4. Queue Labels
Minimum label set:

```text
needs:arc
needs:impl
needs:audit
needs:qa
needs:check
needs:cto
owner:<bot-or-role>
route:fast
route:protected
blocked:aun
ready:merge
done:runtime-evidence
```

Repos may use equivalent structured fields, but the bot query must be recorded
in the adoption profile.

## 5. Evidence Rules
Use GitHub comments, PR body, reviews, checks, and linked runtime evidence as
the durable evidence surface.

Do not mark completion from:

- AUN ACK;
- queue row exists;
- outbound queued;
- Discord projection;
- TUI/tmux text visible;
- green CI alone for runtime-impacting changes.

## 6. Fallback When AUN Is Degraded
Continue from GitHub if a valid next phase exists. Record `blocked:aun` only
when the work specifically requires AUN runtime behavior or AUN evidence that
cannot be replaced by GitHub evidence.

## 7. Stop Handling
Stop and hand off when:

- the phase goal is complete and the next role is audit, QA/check, CTO, or
  merge authority;
- protected governance, runtime, DB, auth, permission, queue, recovery, audit
  log, or external live smoke scope is reached;
- the Work Order requires an unapproved runner policy;
- runtime evidence is needed before done;
- the runner would need to self-approve.
