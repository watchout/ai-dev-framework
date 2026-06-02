# IYASAKA Internal 4MCP PR Conveyor First Work Order Batch

Status: draft
Profile: `iyasaka-internal.pr-conveyor`
Source issue: `watchout/ai-dev-framework#273`

## Batch Rules
- R0-R2 use `pr_conveyor`: PR first, audit before merge.
- R3 uses governed phase/reference handling: draft/reference PR until
  before-merge or repo-owner adoption audit.
- R4 uses `serial_gate`: approval/audit before execution.
- Merge is never automatic.
- Live AUN autonomous dispatch is not enabled by this batch.

## Wave Summary
- Wave 1: Shirube, AUN internal stabilization, Wasurezu recovery/memory safety.
- Wave 2: Kodama context-pack/get_context, Totonoe dogfood preparation.
- Kodama and Totonoe do not block Wave 1.

## Work Orders

### SHIRUBE-CONVEYOR-001
- Repo: `watchout/ai-dev-framework`
- Issue: `watchout/ai-dev-framework#269`
- Objective: Add delivery profile schema and validator.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: Shirube repo maintainer or delegated implementer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Scope: delivery profile type/schema, deterministic validator, CLI check,
  JSON output, tests, docs.
- Non-goals: AUN dispatch, automatic queue assignment, automatic merge.
- Allowed files: `src/cli/lib/*delivery-profile*`,
  `src/cli/commands/check.ts`, `src/cli/**/*delivery-profile*.test.ts`,
  `docs/**/*delivery-profile*`, `templates/delivery-profiles/**/*`.
- Allowed actions: edit allowed files, run verification, open/update draft PR,
  request audit.
- Forbidden actions: merge, production deploy, secret changes, broad unrelated
  dependency updates.
- Verification commands: `npm test -- delivery-profile`, `npm run type-check`,
  `npm run build:cli`, `npm run lint`.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: CI workflow mutation, dependency update outside scope,
  missing implementation authority.
- Fallback next work policy: record blocker and move to next ready Work Order.

### SHIRUBE-CONVEYOR-002
- Repo: `watchout/ai-dev-framework`
- Issue: `watchout/ai-dev-framework#270`
- Objective: Add Work Order template and strategy default resolver.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: Shirube repo maintainer or delegated implementer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Scope: Work Order delivery fields, owner separation, action envelope, risk
  default resolver, tests, docs.
- Non-goals: runner dispatch, queue automation, merge automation.
- Allowed files: `templates/**/*work-order*`, `src/cli/lib/*work-order*`,
  `src/cli/lib/*delivery*`, `src/cli/**/*work-order*.test.ts`, `docs/**/*`.
- Allowed actions: edit templates/validator/tests/docs, run verification,
  open/update draft PR.
- Forbidden actions: merge, production deploy, secret changes.
- Verification commands: `npm test -- work-order delivery`, `npm run type-check`,
  `npm run build:cli`, `npm run lint`.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: owner fields collapse, R4 defaults allow execution,
  incompatible template contract.
- Fallback next work policy: record blocker and move to next ready Work Order.

### SHIRUBE-CONVEYOR-003
- Repo: `watchout/ai-dev-framework`
- Issue: `watchout/ai-dev-framework#267`
- Objective: Add PR evidence template and audit timing check.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: Shirube repo maintainer or delegated implementer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Scope: PR evidence template, audit timing fields, deterministic check, tests,
  docs.
- Non-goals: automatic PR creation, automatic audit approval, merge automation.
- Allowed files: `.github/PULL_REQUEST_TEMPLATE.md`,
  `templates/**/*PULL_REQUEST_TEMPLATE*`, `templates/pr-evidence/**/*`,
  `src/cli/lib/*evidence*`, `src/cli/**/*evidence*.test.ts`, `docs/**/*`.
- Allowed actions: edit templates/checks/tests/docs, run verification,
  open/update draft PR.
- Forbidden actions: merge, production deploy, secret changes.
- Verification commands: `npm test -- pr-evidence`, `npm run type-check`,
  `npm run build:cli`, `npm run lint`.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: PR template compatibility break, CI gate behavior needs
  maintainer approval.
- Fallback next work policy: record blocker and move to next ready Work Order.

### SHIRUBE-CONVEYOR-004
- Repo: `watchout/ai-dev-framework`
- Issue: `watchout/ai-dev-framework#268`
- Objective: Add GitHub-native queue labels and WIP projection.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: Shirube repo maintainer or delegated implementer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Scope: queue labels, projection template, WIP validator, tests, docs.
- Non-goals: live GitHub label mutation, GitHub Projects automation, AUN bridge.
- Allowed files: `templates/github/pr-conveyor-*`, `src/cli/lib/*queue*`,
  `src/cli/**/*queue*.test.ts`, `docs/**/*queue*`.
- Allowed actions: edit templates/checks/tests/docs, run verification,
  open/update draft PR.
- Forbidden actions: merge, live label mutation, production deploy, secret
  changes.
- Verification commands: `npm test -- github-queue`, `npm run type-check`,
  `npm run build:cli`, `npm run lint`.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: live queue mutation requested, stop-lane approval ambiguity.
- Fallback next work policy: record blocker and move to next ready Work Order.

### SHIRUBE-CONVEYOR-005
- Repo: `watchout/ai-dev-framework`
- Issue: `watchout/ai-dev-framework#271`
- Objective: Add runner instruction packs.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: Shirube repo maintainer or delegated implementer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Scope: runner-agnostic instruction pack template, deterministic check, tests,
  docs.
- Non-goals: Work Order execution, live runner dispatch, AUN live dispatch,
  automatic merge.
- Allowed files: `templates/runner-instructions/**/*`,
  `src/cli/lib/*runner*`, `src/cli/**/*runner*.test.ts`, `docs/**/*runner*`.
- Allowed actions: edit templates/checks/tests/docs, run verification,
  open/update draft PR.
- Forbidden actions: merge, runner dispatch, AUN live dispatch, production
  deploy, secret changes.
- Verification commands: `npm test -- runner-instruction runner-packs`,
  `npm run type-check`, `npm run build:cli`, `npm run lint`.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: Codex-only requirement, live AUN dispatch requirement,
  protected operation requested.
- Fallback next work policy: record blocker and move to next ready Work Order.

### AUN-STABILIZE-PRCONV-001
- Repo: `watchout/agent-comms-mcp`
- Issue: `watchout/agent-comms-mcp#665`
- Objective: Apply PR Conveyor to AUN internal stabilization work.
- Delivery strategy: `pr_conveyor`
- Runner policy: `codex_native_fast_lane`
- Work unit: PR
- Lane: Fast
- Risk class: R2
- Architecture owner: IYASAKA ARC
- Implementation owner: AUN repo maintainer or delegated implementer
- Review owner: AUN reviewer
- Audit owner: AUN audit owner
- Merge authority: AUN repo maintainer
- Scope: reversible queue/recovery/Discord delivery stabilization, diagnostics,
  and tests.
- Non-goals: live autonomous runner dispatch, protected action-tool execution,
  destructive queue migration.
- Allowed files: repo-owned source/tests/docs for current stabilization issues.
- Allowed actions: edit code/tests/docs, run repo verification, open/update PR,
  request audit.
- Forbidden actions: enable live AUN-to-runner dispatch, destructive DB/storage
  operations, production/customer sends, merge.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `normal`
- Audit timing: `after_pr`
- Stop conditions: live dispatch enablement, queue-state-loss migration,
  credential/secret handling.
- Fallback next work policy: record blocker and move to next AUN stabilization
  Work Order.

### AUN-SAFETY-PRCONV-002
- Repo: `watchout/agent-comms-mcp`
- Issue: `watchout/agent-comms-mcp#673`
- Objective: Prepare safety-stack evidence for future AUN dispatched runners.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: AUN repo maintainer or delegated implementer
- Review owner: AUN reviewer
- Audit owner: AUN audit owner
- Merge authority: AUN repo maintainer
- Scope: document or test hard-stop enforcement, runner identity, audit ledger,
  and no-run sentinel prerequisites.
- Non-goals: enabling autonomous dispatch or execution authority.
- Allowed files: repo-owned safety docs/tests/source for #673.
- Allowed actions: edit code/tests/docs, run repo verification, open/update
  draft/reference PR, request audit.
- Forbidden actions: enable live dispatch, approve execution, merge.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: runtime dispatch path becomes active, hard-stop remains
  unenforced, approval authority ambiguity.
- Fallback next work policy: record blocker and leave #272 blocked.

### WASUREZU-RECOVERY-PRCONV-001
- Repo: `watchout/agent-memory`
- Issue: `watchout/agent-memory#101`
- Objective: Improve restart pack and context continuity safety.
- Delivery strategy: `pr_conveyor`
- Runner policy: `codex_native_fast_lane`
- Work unit: PR
- Lane: Fast
- Risk class: R2
- Architecture owner: IYASAKA ARC
- Implementation owner: Wasurezu repo maintainer or delegated implementer
- Review owner: Wasurezu reviewer
- Audit owner: Wasurezu audit owner
- Merge authority: Wasurezu repo maintainer
- Scope: recovery/restart pack safety, continuity guard tests, provenance and
  redaction evidence.
- Non-goals: memory as execution authorization, storing secrets, uncontrolled
  external raw capture.
- Allowed files: repo-owned memory/recovery source/tests/docs.
- Allowed actions: edit source/tests/docs, run repo verification, open/update
  PR, request audit.
- Forbidden actions: store secrets, broaden raw capture without approval, merge.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `normal`
- Audit timing: `after_pr`
- Stop conditions: secret handling, uncontrolled raw capture, memory treated as
  execution permission.
- Fallback next work policy: record blocker and move to next Wasurezu safety
  Work Order.

### WASUREZU-EVIDENCE-PRCONV-002
- Repo: `watchout/agent-memory`
- Issue: `watchout/agent-memory#101`
- Objective: Make Wasurezu recovery evidence usable by repeated conveyor runs.
- Delivery strategy: `pr_conveyor`
- Runner policy: `codex_native_fast_lane`
- Work unit: PR
- Lane: Fast
- Risk class: R2
- Architecture owner: IYASAKA ARC
- Implementation owner: Wasurezu repo maintainer or delegated implementer
- Review owner: Wasurezu reviewer
- Audit owner: Wasurezu audit owner
- Merge authority: Wasurezu repo maintainer
- Scope: approval-note evidence refs, recovery-quality capture, startup
  continuity reports.
- Non-goals: execution authorization, storing secrets, AUN dispatch authority.
- Allowed files: repo-owned memory/recovery source/tests/docs.
- Allowed actions: edit source/tests/docs, run repo verification, open/update
  PR, request audit.
- Forbidden actions: store secrets, merge, permission broadening.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `normal`
- Audit timing: `after_pr`
- Stop conditions: evidence used as authority, unredacted sensitive data,
  missing provenance.
- Fallback next work policy: record blocker and move to next Wasurezu safety
  Work Order.

### KODAMA-CONTEXT-PRCONV-001
- Repo: `watchout/kodama`
- Issue: `watchout/kodama#14`
- Objective: Complete context-pack/get_context work under PR Conveyor.
- Delivery strategy: `pr_conveyor`
- Runner policy: `codex_native_fast_lane`
- Work unit: PR
- Lane: Fast
- Risk class: R2
- Architecture owner: IYASAKA ARC
- Implementation owner: Kodama repo maintainer or delegated implementer
- Review owner: Kodama reviewer
- Audit owner: Kodama audit owner
- Merge authority: Kodama repo maintainer
- Scope: context-pack/get_context implementation and tests, schema hash,
  citations, omitted/risk labels, prompt-injection risk evidence.
- Non-goals: downstream execution authorization, external-state mutation,
  permission broadening.
- Allowed files: `src/**/*context*`, `src/**/*mcp*`,
  `docs/**/*GETCONTEXT*`, `tests/**/*context*`, context schema fixtures.
- Allowed actions: edit source/tests/docs/fixtures, run verification,
  open/update PR, request audit.
- Forbidden actions: mutate external systems, treat context labels as
  permission grants, merge.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `normal`
- Audit timing: `after_pr`
- Stop conditions: context labels used as authorization, unredacted sensitive
  source data, unknown source permission.
- Fallback next work policy: record blocker and move to next Kodama Work Order.

### KODAMA-PROVENANCE-PRCONV-002
- Repo: `watchout/kodama`
- Issue: `watchout/kodama#14`
- Objective: Harden context source/provenance reporting.
- Delivery strategy: `pr_conveyor`
- Runner policy: `codex_native_fast_lane`
- Work unit: PR
- Lane: Fast
- Risk class: R2
- Architecture owner: IYASAKA ARC
- Implementation owner: Kodama repo maintainer or delegated implementer
- Review owner: Kodama reviewer
- Audit owner: Kodama audit owner
- Merge authority: Kodama repo maintainer
- Scope: structured context provenance fields, redaction/omission evidence,
  schema fixtures, tests.
- Non-goals: execution permission, external-state mutation, permission
  broadening.
- Allowed files: `src/**/*context*`, `src/**/*schema*`, `tests/**/*context*`,
  `docs/**/*context*`.
- Allowed actions: edit source/tests/docs/fixtures, run verification,
  open/update PR, request audit.
- Forbidden actions: treat retrieved context as authority, merge, production
  deploy.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `normal`
- Audit timing: `after_pr`
- Stop conditions: unknown provenance, sensitive data leak, permission
  broadening.
- Fallback next work policy: record blocker and move to next Kodama Work Order.

### TOTONOE-DOGFOOD-PRCONV-001
- Repo: `watchout/totonoe`
- Issue: `watchout/totonoe#5`
- Objective: Prepare Totonoe as dogfood after 4MCP minimum readiness.
- Delivery strategy: `pr_conveyor`
- Runner policy: `codex_native_fast_lane`
- Work unit: PR
- Lane: Fast
- Risk class: R2
- Architecture owner: IYASAKA ARC
- Implementation owner: Totonoe repo maintainer or delegated implementer
- Review owner: Totonoe reviewer
- Audit owner: Totonoe audit owner
- Merge authority: Totonoe repo maintainer
- Scope: prepare PR-sized product Work Orders using Shirube evidence fields;
  keep customer-impacting operations out of Fast Lane.
- Non-goals: production deploy, customer data export, billing, permission
  broadening.
- Allowed files: repo-owned docs/spec/tests/source for non-customer-impacting
  product slices.
- Allowed actions: edit docs/source/tests, run verification, open/update PR,
  request audit.
- Forbidden actions: production/customer-impacting changes, billing/value
  transfer, permission broadening, merge.
- Verification commands: repo test command, repo typecheck/build command when
  available.
- PR mode: `normal`
- Audit timing: `after_pr`
- Stop conditions: customer data or production impact, billing/export behavior,
  missing 4MCP minimum support.
- Fallback next work policy: record blocker and move to next Totonoe-safe Work
  Order.

### TOTONOE-ROADMAP-PRCONV-002
- Repo: `watchout/totonoe`
- Issue: `watchout/totonoe#5`
- Objective: Convert Totonoe dogfood roadmap items into bounded Work Orders.
- Delivery strategy: `phase_conveyor`
- Runner policy: `runner_agnostic_manual`
- Work unit: PR
- Lane: Governed
- Risk class: R3
- Architecture owner: IYASAKA ARC
- Implementation owner: Totonoe repo maintainer or delegated implementer
- Review owner: Totonoe reviewer
- Audit owner: Totonoe audit owner
- Merge authority: Totonoe repo maintainer
- Scope: roadmap classification, owner separation, audit timing, protected
  operation stops for Totonoe dogfood.
- Non-goals: production deploy, customer data handling, billing, permission
  broadening.
- Allowed files: repo-owned roadmap/docs/spec Work Order files.
- Allowed actions: edit docs/specs, run docs verification when available,
  open/update draft/reference PR, request audit.
- Forbidden actions: production/customer-impacting changes, billing/value
  transfer, permission broadening, merge.
- Verification commands: repo docs/spec validation command when available.
- PR mode: `draft_or_reference_until_owner_adopts`
- Audit timing: `before_merge`
- Stop conditions: customer-impacting work appears, 4MCP minimum not usable,
  repo-owner adoption missing.
- Fallback next work policy: record blocker and keep Totonoe deferred.
