# Role Binding Examples

Shirube resolves workflow authority through abstract roles in
`.framework/config.json`. These examples use generic actor ids only. Do not put
secrets, bot tokens, API keys, platform credentials, or private webhook URLs in
role bindings.

## Required Roles

Current Shirube requires these bindings for strict starts:

| Role | Purpose |
| --- | --- |
| `architecture_owner` | Owns design direction and contract impact. |
| `l3_governance_owner` | Owns L3 technical governance and cross-cutting approval. |
| `implementation_lead` | Produces implementation changes and handoff evidence. |
| `reviewer` | Performs L1 review / lead review. |
| `auditor` | Performs independent audit review. |
| `release_owner` | Owns release readiness and rollback decision. |
| `human_approver` | Provides human approval for protected or release-sensitive actions. |
| `worker_pool` | Represents the producer worker group for implementation tasks. |

`implementation_lead` and `worker_pool` are producer roles. The other roles are
authority roles. Standard and strict workflows must keep producer targets
separate from gate, review, audit, L3, release, and human approval targets.

## Standard vs Strict

Use `standard` when the work is bounded and the domain is known. Concrete role
bindings are still expected for review/audit evidence, and producer roles should
not share the same target or actor label with authority roles.

Use `strict` for framework changes, public/enterprise readiness claims,
cross-cutting architecture, protected surfaces, release authority, or merge
authority. Strict starts require every role below to be concrete: no missing
role, no `placeholder: true`, and no producer/authority overlap.

Use `minimal` only for local or low-risk work where no strict/public claim is
being made. Minimal mode does not turn producer self-check into approval.

## Example: Codex Lead + External Auditor

```json
{
  "roles": {
    "bindings": {
      "architecture_owner": { "type": "github_team", "id": "platform-architecture" },
      "l3_governance_owner": { "type": "github_user", "id": "tech-governance-owner" },
      "implementation_lead": { "type": "local_agent", "id": "codex-lead" },
      "reviewer": { "type": "github_user", "id": "lead-reviewer" },
      "auditor": { "type": "external", "id": "external-audit-provider" },
      "release_owner": { "type": "github_user", "id": "release-owner" },
      "human_approver": { "type": "github_user", "id": "business-approver" },
      "worker_pool": { "type": "local_agent", "id": "codex-worker-pool" }
    }
  }
}
```

This is acceptable for `standard` and `strict` if `codex-lead` and
`codex-worker-pool` are not the same target or actor label as the reviewer,
auditor, L3 owner, release owner, or human approver.

## Example: Claude Code Lead + Codex Review

```json
{
  "roles": {
    "bindings": {
      "architecture_owner": { "type": "github_team", "id": "architecture-review" },
      "l3_governance_owner": { "type": "github_user", "id": "cto-reviewer" },
      "implementation_lead": { "type": "local_agent", "id": "claude-code-lead" },
      "reviewer": { "type": "local_agent", "id": "codex-reviewer" },
      "auditor": { "type": "local_agent", "id": "codex-auditor" },
      "release_owner": { "type": "github_user", "id": "release-manager" },
      "human_approver": { "type": "github_user", "id": "product-owner" },
      "worker_pool": { "type": "local_agent", "id": "claude-worker-pool" }
    }
  }
}
```

This setup is useful when Claude Code produces implementation diffs and Codex
handles review or audit. Keep the Codex reviewer and Codex auditor ids distinct
when your governance requires L1 and L2 to be independent actors.

## Example: External MCP Auditor

```json
{
  "roles": {
    "bindings": {
      "architecture_owner": { "type": "github_team", "id": "architecture-board" },
      "l3_governance_owner": { "type": "github_user", "id": "governance-owner" },
      "implementation_lead": { "type": "local_agent", "id": "implementation-lead" },
      "reviewer": { "type": "github_user", "id": "lead-reviewer" },
      "auditor": { "type": "mcp_agent", "id": "mcp-audit-service" },
      "release_owner": { "type": "github_user", "id": "release-owner" },
      "human_approver": { "type": "github_team", "id": "change-approval-board" },
      "worker_pool": { "type": "local_agent", "id": "implementation-worker-pool" }
    }
  }
}
```

Use an `mcp_agent` binding for an external auditor only when the repository
configuration also defines how that MCP service is invoked and where its audit
evidence is stored. The binding itself is identity metadata, not a credential.

## Example: Human Approver + Release Owner

```json
{
  "roles": {
    "bindings": {
      "architecture_owner": { "type": "github_team", "id": "architecture-board" },
      "l3_governance_owner": { "type": "github_user", "id": "l3-governance-owner" },
      "implementation_lead": { "type": "local_agent", "id": "implementation-lead" },
      "reviewer": { "type": "github_user", "id": "lead-reviewer" },
      "auditor": { "type": "external", "id": "audit-provider" },
      "release_owner": { "type": "github_user", "id": "release-owner" },
      "human_approver": { "type": "github_user", "id": "accountable-human-approver" },
      "worker_pool": { "type": "local_agent", "id": "worker-pool" }
    }
  },
  "workflow": {
    "publishPolicy": "approval_required",
    "outputs": ["local_files", "github"]
  }
}
```

Use this pattern when remote publication or release may proceed only after a
human approval record exists. `release_owner` and `human_approver` may be the
same person only if your project governance explicitly allows that. They must
still remain separate from producer roles.

## Example: Worker Pool Binding

```json
{
  "roles": {
    "bindings": {
      "architecture_owner": { "type": "github_team", "id": "architecture-board" },
      "l3_governance_owner": { "type": "github_user", "id": "technical-governance" },
      "implementation_lead": { "type": "local_agent", "id": "implementation-coordinator" },
      "reviewer": { "type": "github_user", "id": "lead-reviewer" },
      "auditor": { "type": "external", "id": "audit-provider" },
      "release_owner": { "type": "github_user", "id": "release-owner" },
      "human_approver": { "type": "github_team", "id": "approval-board" },
      "worker_pool": { "type": "channel", "id": "implementation-workers" }
    }
  }
}
```

Use a `channel` worker pool when multiple implementation agents consume work
from a shared coordination surface. The channel is not approval authority; it
only identifies where producer work is assigned or reported.

## Anti-Patterns

- Do not leave any role as `todo-*` or `placeholder: true` before a strict start.
- Do not bind `implementation_lead` and `auditor` to the same target.
- Do not bind `worker_pool` and `human_approver` to the same target.
- Do not store tokens, webhook secrets, API keys, or private URLs in role ids.
- Do not treat a channel notification, queue id, or ACK as approval evidence.
