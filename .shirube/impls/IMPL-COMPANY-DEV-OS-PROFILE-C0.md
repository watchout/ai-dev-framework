# Cell Impl

- IMPL-ID: IMPL-COMPANY-DEV-OS-PROFILE-C0
- CELL-ID: CELL-COMPANY-DEV-OS-PROFILE-C0
- SPEC-ID: SPEC-COMPANY-DEV-OS-PROFILE-C0
- Risk Tier: R3

## Covered Requirements

- REQ-COMPANY-DEV-OS-C0-001
- REQ-COMPANY-DEV-OS-C0-002
- REQ-COMPANY-DEV-OS-C0-003
- REQ-COMPANY-DEV-OS-C0-004
- REQ-COMPANY-DEV-OS-C0-005
- SEC-COMPANY-DEV-OS-C0-001

## Planned File Changes

| Path | Change Type | Reason |
| --- | --- | --- |
| `.shirube/specs/SPEC-COMPANY-DEV-OS-PROFILE-C0.md` | add | Canonical C0 inventory and mapping artifact. |
| `.shirube/cells/CELL-COMPANY-DEV-OS-PROFILE-C0.yaml` | add | Cell boundary, allowed paths, required evidence, stop conditions, and execution contract. |
| `.shirube/impls/IMPL-COMPANY-DEV-OS-PROFILE-C0.md` | add | Implementation plan and validation scope. |
| `.shirube/audits/AUDIT-COMPANY-DEV-OS-PROFILE-C0-SPEC.yaml` | add | Structured spec-audit scaffold for C0 docs/spec work. |
| `.shirube/audits/AUDIT-COMPANY-DEV-OS-PROFILE-C0-IMPL.yaml` | add | Structured impl-audit scaffold for C0 docs/spec work. |

## Source Review Inputs

- `watchout/iyasaka-arc/company-dev-os/README.md`
- `watchout/iyasaka-arc/company-dev-os/PLACEMENT.md`
- `watchout/iyasaka-arc/company-dev-os/APPLY_GUIDE.md`
- `watchout/iyasaka-arc/company-dev-os/RUNTIME_ACTIVATION.md`
- `watchout/iyasaka-arc/company-dev-os/AGENT_ID_REGISTRY.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/AGENTS.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/role-matrix.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/review-gates.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/state-transition-standard.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/audit-verdict-template.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/evidence-pack-template.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/handoff-packet-template.md`
- `watchout/iyasaka-arc/company-dev-os/company-common/docs/agent-comms-mcp-apply-runbook.md`
- `watchout/iyasaka-arc/company-dev-os/repo-profiles/agent-comms-mcp/AGENTS.md`
- `watchout/iyasaka-arc/company-dev-os/repo-profiles/ai-dev-framework/AGENTS.md`
- local untracked dry-run overlay references under `.company-dev-os/` read only

## Non-goals

- No runtime behavior changes.
- No CLI behavior or schema validator changes.
- No active workflow changes.
- No required check activation.
- No branch protection or ruleset mutation.
- No AUN queue/control implementation, AUN DB/schema mutation, Discord, queue, LaunchAgent, or transport changes.
- No target repository mutation.
- No production or deploy behavior changes.
- No package or lockfile changes.
- No replacement or removal of existing Company Dev OS overlays.

## Test Plan

- `git diff --check origin/main...HEAD`
- `bash scripts/detect-breaking-changes.sh origin/main`
- YAML parse for `.shirube/**/*.yaml|yml`
- `npm run lint`
- `npm run type-check`
- `npm run build:cli`
- `npm run --silent shirube -- conveyor check https://github.com/watchout/ai-dev-framework/pull/<PR> --format json`
