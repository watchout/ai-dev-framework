---
id: OPS-WORKORDER-244
status: Draft
traces:
  spec: [SPEC-WORKORDER-244]
  impl: [IMPL-WORKORDER-244]
  verify: [VERIFY-WORKORDER-244]
---

# OPS: Work Order Contract and Warning Gate

## 0. Corresponding SPEC
`docs/spec/phase1-work-order-contract.md` / SPEC-WORKORDER-244.

## 1. Operator Flow
1. Identify the issue, task, PR, or work package being dispatched.
2. Create `.framework/work-order.json` using `work-order/v1`.
3. Include the AUN handoff target, structured invocation requirements, Shirube
   report/gate sink, runtime adapter needs, expected output schema, write
   scope, required gates, authority boundary, and non-claims.
4. Cite context-pack evidence by `pack_id` and source/citation metadata, or
   record explicit non-applicability.
5. Run `shirube workflow check --action work_order --profile strict --json`.
6. During migration, use `--fail-on warn` for audits that should fail
   warning-only Work Order gaps.
7. Dispatch through AUN, Codex, Claude, or Shirube report surfaces only after
   the Work Order contract is complete for the target migration policy.

## 2. Minimal Work Order
```json
{
  "schema_version": "work-order/v1",
  "work_order_id": "WO-244",
  "issue": 244,
  "repo": "watchout/ai-dev-framework",
  "product": "shirube",
  "github_state_ref": {
    "issue_url": "https://github.com/watchout/ai-dev-framework/issues/244",
    "pr_url": "https://github.com/watchout/ai-dev-framework/pull/<number>",
    "durable_state": "github_issue_pr"
  },
  "work_package_id": "phase1-work-order-contract",
  "objective": "Implement warning-first Work Order contract validation.",
  "phase_goal": {
    "phase_id": "phase1-work-order-contract.impl",
    "phase_type": "implementation",
    "goal": "Implement warning-first Work Order contract validation.",
    "scope": ["workflow check and Work Order docs"],
    "non_scope": ["live AUN dispatch", "merge automation"],
    "acceptance_criteria": ["strict work_order fixture passes"],
    "allowed_implementation_actions": ["edit files", "run checks", "open PR"],
    "required_checks": ["workflow tests", "type-check"],
    "stop_conditions": ["protected approval boundary"],
    "evidence_writeback": ["GitHub PR comment"],
    "next_phase_handoff": "L1 implementation audit"
  },
  "runner_policy": {
    "policy": "codex_native_fast_lane",
    "github_queue_ssot": true,
    "aun_usage": "optional_acceleration_only"
  },
  "evidence_contract": {
    "required_evidence": ["PR comment", "checks", "review links"],
    "not_sufficient_evidence": ["AUN ACK", "queue row", "Discord projection"],
    "merge_done_separation": true
  },
  "handoff_target": "codex",
  "dispatch_surfaces": ["aun", "codex", "claude", "shirube_report"],
  "risk_class": "R2",
  "work_unit": "PR",
  "architecture_owner": "IYASAKA ARC",
  "implementation_owner": "Shirube repo maintainer",
  "review_owner": "Shirube reviewer",
  "audit_owner": "Shirube audit owner",
  "merge_authority": "Shirube repo maintainer",
  "scope": ["Implement warning-first Work Order contract validation."],
  "non_goals": ["Do not enable live AUN dispatch.", "Do not merge automatically."],
  "acceptance_criteria": ["Complete Work Order fixture passes strict migration audit."],
  "role_flow": ["arc", "repo-specific implementation bot", "audit", "qa/check", "cto-if-required"],
  "current_owner": "repo-specific implementation bot",
  "next_action": "Open implementation PR with evidence handoff.",
  "evidence_required": ["PR comment", "checks", "review links"],
  "required_review": ["L1 implementation audit"],
  "inputs": [
    {
      "type": "aun_message",
      "ref": "3602251b-ce84-46aa-9e9c-f17b83ea3d99"
    }
  ],
  "evidence_refs": ["github:watchout/ai-dev-framework#244"],
  "context_pack_refs": [
    {
      "pack_id": "kodama-pack-issue-242",
      "citation": "github:watchout/kodama#7"
    }
  ],
  "context_pack_policy": {
    "data_not_instruction": true,
    "delivery": "data-only"
  },
  "runtime_adapter": "codex-jsonl-readonly-v1",
  "structured_invocation": {
    "runtime": "codex",
    "output_mode": "jsonl",
    "output_schema": "work-order-result-v1"
  },
  "expected_output_schema": "work-order-result-v1",
  "write_scope": "workspace-write",
  "required_gates": ["work_order", "runtime_step", "context_pack"],
  "report_sink": "shirube-gate-report",
  "authority_boundary": {
    "forbidden": ["merge approval", "phase transition", "goal completion"],
    "merge_authority": "not_granted",
    "phase_transition_authority": "not_granted"
  },
  "non_claims": [
    "No merge authority.",
    "No phase transition authority.",
    "No public or enterprise readiness claim."
  ],
  "enforcement_mode": "warning",
  "promotion_criteria": [
    "AUN, Codex, Claude, and Shirube report consumers accept work-order/v1.",
    "Downstream migration has no warning-only violations."
  ]
}
```

## 3. What WARN Means
A G21 WARN means the Work Order is incomplete or unsafe for strict migration,
but the first slice is not yet a hard block.

Allowed while warning:

- continue current development when the action threshold is `block`;
- fix missing contract fields;
- run audits with `--fail-on warn`;
- document migration exceptions.

Not allowed while warning:

- claim that Work Order validation is hard enforcement;
- dispatch as if Work Order text is trusted instruction;
- generate shell commands from Work Order text;
- grant merge, phase transition, or goal authority from a Work Order;
- claim public or enterprise readiness from the warning gate.

## 4. Compatibility Guidance
| Surface | Guidance |
|---------|----------|
| AUN dispatch | Work Order names the recipient and evidence refs; AUN queue internals remain outside Shirube. |
| Codex/Claude structured invocation | Work Order names runtime adapter needs and expected output schema; #240 owns command adapter validation. |
| Shirube gate/report | `workflow check --action work_order` emits stable JSON decisions for report surfaces. |
| Kodama context-pack | Work Order cites packs by `pack_id`/citation and keeps item text data-only or citation-only. |
| Wasurezu recovery | Memory may summarize Work Orders, but the Work Order artifact remains the source evidence. |

## 5. Promotion to Hard Block
The promotion path must be a later reviewed slice. At minimum it needs:

- L1/L2/L3 evidence on real Work Order usage;
- AUN, Codex, Claude, and Shirube report compatibility;
- downstream docs updated to use `work-order/v1`;
- no open warning-only migration blockers;
- explicit L3 approval to change WARN decisions to BLOCK for strict profiles.

## 6. Rollback
Because this first slice is warning-only, rollback is normally a docs/code
revert. If a report consumer treats WARN as hard failure accidentally, lower
the consumer threshold to `block` until the Work Order contract is complete.
