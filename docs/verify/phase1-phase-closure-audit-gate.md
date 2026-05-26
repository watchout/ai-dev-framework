---
id: VERIFY-PHASECLOSURE-224
status: Draft
traces:
  spec: [SPEC-PHASECLOSURE-224]
  impl: [IMPL-PHASECLOSURE-224]
  ops: [OPS-PHASECLOSURE-224]
---

# VERIFY: Phase Closure Audit Gate

## 0. Corresponding SPEC
`docs/spec/phase1-phase-closure-audit-gate.md` /
SPEC-PHASECLOSURE-224.

## 1. L0 Required Checks
- `git diff --check`;
- `npm run build:cli`;
- `npm run type-check`;
- `npm run lint`;
- focused workflow tests for `phase_closure`;
- `node dist/cli/index.js trace verify`.

## 2. Required Fixtures
The implementation must prove:

| Fixture | Expected strict result |
|---------|------------------------|
| missing closure record | BLOCK `G12.phase_closure.record.present` |
| partial closure record | BLOCK `G12.phase_closure.required_fields` |
| unresolved blockers remain | BLOCK `G12.phase_closure.blockers_cleared` |
| deferred carryover lacks rationale | BLOCK `G12.phase_closure.carryovers_justified` |
| merged PR lacks POSTMERGE evidence | BLOCK `G12.phase_closure.postmerge_evidence` |
| complete closure record | `phase_closure` check passes |

## 3. Trace Verification
The #224 4-layer docs must remain trace-complete:

- SPEC traces to IMPL/VERIFY/OPS;
- IMPL traces to SPEC/VERIFY/OPS;
- VERIFY traces to SPEC/IMPL/OPS;
- OPS traces to SPEC/IMPL/VERIFY.

## 4. Manual Review Evidence
Required review sequence before merge:

- L0 self-verification;
- L1 developer workflow/scope review;
- L2 independent audit;
- L3 before using this gate for any phase transition claim.

POSTMERGE-001 evidence is required if this PR contributes to Phase 1 exit
readiness.
