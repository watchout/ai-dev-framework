---
id: OPS-WASUREZU-SHIRUBE-246
status: Draft
traces:
  spec: [SPEC-WASUREZU-SHIRUBE-246]
  impl: [IMPL-WASUREZU-SHIRUBE-246]
  verify: [VERIFY-WASUREZU-SHIRUBE-246]
---

# OPS: Wasurezu Lightweight Shirube Adoption Profile

## 0. Corresponding SPEC
`docs/spec/phase1-wasurezu-shirube-adoption.md` /
SPEC-WASUREZU-SHIRUBE-246.

## 1. Operator Flow
1. Create or select the Wasurezu issue. The first recommended issue is
   `WASUREZU-SHIRUBE-001`.
2. Classify the task before implementation.
3. Start ordinary scaffolding work with:

   ```bash
   shirube start . --feature WASUREZU-SHIRUBE-001 --quality-mode single-agent --audit-level minimal
   ```

4. Escalate risky work with:

   ```bash
   shirube start . --feature <id> --quality-mode single-agent --audit-level standard
   ```

5. Do not use `--mode lightweight`.
6. Do not use `--audit-level strict` with `--quality-mode single-agent`.
7. Create or cite a Wasurezu Work Order before dispatch or implementation.
8. For behavior-changing Wasurezu work, create SPEC/IMPL/VERIFY/OPS docs.
9. Run required local validation and record producer, gate, and review sections
   separately.

## 2. Risk Classification
Use minimal audit only for:

- docs-only changes;
- non-behavioral refactors;
- small test additions;
- Shirube adoption scaffolding.

Use standard audit for:

- recovery pack behavior;
- memory write/read semantics;
- memory promotion, candidate, or approved boundaries;
- MCP tool contracts;
- `structuredContent`, `outputSchema`, or `isError` behavior;
- host invocation, restart, or delivery modes;
- redaction, provenance, or token handling;
- migrations or data-model changes.

Escalate beyond single-agent only when a cross-repo, release-critical,
security-sensitive, or explicitly reviewed change requires it.

## 3. Work Order Template
Use `docs/ops/wasurezu-work-order-template.example.json` as the starting point.
The file is an example, not canonical schema authority. #244 owns the generic
`work-order/v1` contract.

At minimum, fill:

- repo;
- issue;
- feature id;
- objective;
- scope;
- non-goals;
- affected MCP tools;
- affected schemas;
- data/migration impact;
- recovery behavior impact;
- host-runtime impact;
- redaction/provenance impact;
- tests required;
- rollback plan;
- evidence/report format.

## 4. Manual Report Format
Every early Wasurezu Shirube report should use this structure:

```markdown
## Producer
- Work Order:
- Feature:
- Objective:
- Scope:
- Non-goals:
- Changes:

## Gate
- Risk classification:
- Quality mode:
- Audit level:
- Commands:
- Gate decisions:
- Warnings:

## Review
- Findings:
- Residual risks:
- Missing evidence:
- Non-claims:
- Next action:
```

The same single agent may complete the sections during early adoption, but the
sections must remain separate.

## 5. Concrete Issue and PR Sequence
1. Shirube issue #246: define the Wasurezu adoption profile under #238.
2. Shirube PR: add SPEC/IMPL/VERIFY/OPS docs and Wasurezu Work Order template.
3. Wasurezu issue `WASUREZU-SHIRUBE-001`: add local adoption scaffolding and
   first Work Order.
4. Wasurezu PR A: docs/scaffolding under minimal audit.
5. Wasurezu PR B: first behavior-affecting recovery or MCP change under
   standard audit.
6. Later Shirube PR: promote Wasurezu Work Order gaps from WARN to BLOCK after
   dogfood evidence exists.

## 6. Gate Interpretation
First-phase Work Order field gaps are WARN findings. WARN means the task is not
ready for stricter dispatch, not that gates were skipped.

Do not claim:

- full runner automation;
- merge-authority enforcement;
- multi-agent governance;
- AUN auto-runner readiness;
- `state_daemon` enforcement;
- recovery correctness from memory summaries alone.

## 7. Rollback
The first Shirube adoption PR is documentation-only. Rollback is a normal docs
revert.

If a Wasurezu-side consumer treats first-phase WARN findings as hard failure,
lower that consumer threshold to block-only until the later blocking phase is
reviewed and approved.
