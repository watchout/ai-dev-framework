---
id: SPEC-ACTIONPROFILE-254
status: Draft
traces:
  impl: [IMPL-ACTIONPROFILE-254]
  verify: [VERIFY-ACTIONPROFILE-254]
  ops: [OPS-ACTIONPROFILE-254]
---

# SPEC: Governed Action Surface Profile

## 0. Meta
- Origin Issue: #254
- Parent context: #238 Enterprise Delivery Graph
- Related governance bone: #249
- Related Aun Gate profile: #252

## 1. Purpose
Define a common governed action surface profile for MCP tools, SaaS APIs,
admin UI actions, CLI commands, jobs, webhooks, and agent actions.

The profile makes product surfaces Aun Gate-ready without requiring AUN live
enforcement to exist first. Shirube can validate the metadata now, and future
Aun Gate policy evaluation can consume the same fields later.

## 2. Capability Classes
Each action surface declares one or more capability classes:

- `read`;
- `reveal`;
- `write`;
- `delete`;
- `action`;
- `external_send`;
- `admin`;
- `execute_code`.

Unknown capability classes are findings. `write`, `delete`, `action`,
`external_send`, `admin`, and `execute_code` are risky capabilities.

## 3. Risk Levels
Each action surface declares a risk level:

- `low`;
- `medium`;
- `high`;
- `critical`.

Unknown risk must not pass silently for risky capabilities. In warning mode it
is a visible warning; in strict mode it blocks.

## 4. Stages
Stage 0 inventory requires:

- `surface_id`;
- `surface_type`;
- `capability_classes`;
- `risk_level`;
- `owner_repo`.

Stage 1 profile additionally requires:

- `product`;
- `display_name`;
- `description`;
- `resource_scope`;
- `identity_requirements`;
- `context_requirements`;
- `memory_requirements`;
- `approval_policy`;
- `audit_policy`;
- `rollback_policy`;
- `execution_policy`.

## 5. Risk Policy
High/critical surfaces and approval-by-default capabilities must declare
approval policy evidence or an explicit allowlist.

Risky capabilities must declare audit coverage. The validator checks the
coverage that applies to the capability:

- mutation summary for write/delete/action/admin/execute-code surfaces;
- egress summary for external-send surfaces;
- redaction for reveal surfaces.

Risky capabilities must also declare rollback, replay, compensating action,
manual reconcile, or explicit non-reversibility policy.

`execute_code` surfaces must declare execution-policy evidence such as dry-run,
idempotency, sandbox, egress, or timeout controls.

## 6. CLI Contract
Shirube exposes:

```bash
shirube check action-profile <files...>
```

Options:

- `--stage inventory|profile`;
- `--mode warning|strict`;
- `--strict`;
- `--require`;
- `--json`.

Default mode is warning and default stage is profile. This keeps first-phase
adoption warning-first while allowing strict product audits for high/critical
surfaces.

## 7. Input Formats
The first slice supports:

- JSON object with one surface;
- JSON object with `surfaces`, `action_surfaces`, `profiles`, or `items`;
- JSON array of surfaces;
- Markdown field blocks;
- Markdown inventory tables with `Surface ID`, `Type`, `Capability`, `Risk`,
  and `Owner repo` columns.

YAML and product-specific manifest discovery are future extensions.

Inventory scenario:

```gherkin
Given a product has a Markdown action surface inventory table
And each row declares Surface ID, Type, Capability, Risk, and Owner repo
When `shirube check action-profile --stage inventory --strict` runs
Then the inventory rows pass without requiring full Stage 1 policy fields
```

Profile scenario:

```gherkin
Given a product has a high-risk external-send action surface
And the profile omits approval, audit, rollback, or execution policy evidence
When `shirube check action-profile --strict` runs
Then the check blocks with structured findings for the missing profile fields
```

## 8. Acceptance Criteria
- MCP products can classify tool surfaces.
- SaaS products can classify API/UI/job/webhook/action surfaces.
- Stage 0 inventory rows pass when the minimal fields are present.
- Stage 1 profiles warn or block on missing policy fields according to mode.
- High/critical or approval-by-default surfaces identify approval and audit
  requirements.
- Mutating or externally sending surfaces cannot pass silently with unknown
  risk.
- The validator is read-only and does not call AUN, MCP tools, GitHub mutation,
  or product APIs.

## 9. Non-Goals
- Do not implement Aun Gate live enforcement.
- Do not dispatch or approve action-tool execution.
- Do not own merge authority, phase transition authority, or goal completion.
- Do not require product repos to have complete profile coverage before warning
  mode can be adopted.
- Do not claim public, OSS, or enterprise readiness from profile validation
  alone.

## 10. 制御機構選定原則
script 選定根拠: `shirube check action-profile` is deterministic,
replayable, local/CI-safe, and returns structured findings without relying on
LLM judgment.

Hook 選定根拠: Hook 不採用 in this slice. A hook may call the same script in a
future local-interception path, but it must not independently decide profile
validity.

GitHub 選定根拠: GitHub PR checks may project the same script result for product
repositories, but GitHub issue/PR text is evidence only and not authority.

LLM boundary: LLM output may draft profile entries. It cannot approve an action
surface, pass a gate, dispatch a tool, grant merge authority, or claim Aun Gate
readiness.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Action surface field validation | script (`check action-profile`) | - | deterministic field and enum validation |
| Inventory/profile stage selection | script option | - | adoption stage must be explicit and replayable |
| Strict mode for risky audits | script option | - | strict blocking must not depend on LLM text |
| AUN live enforcement | not implemented in this slice | - | AUN internal stability is an external prerequisite |

## 11. Testing Layer
Unit tests cover JSON and Markdown profile extraction, Stage 0 inventory,
Stage 1 profile warnings, unknown risk on risky capabilities, strict approval
and audit failures, and CLI option validation.

CLI tests cover warning-mode exit behavior, strict-mode failure behavior,
inventory-stage pass behavior, and invalid stage handling.
