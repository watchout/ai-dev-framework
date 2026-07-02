# Script-Control Fitness Negative Proof

This fixture intentionally violates the Shirube script-control fitness policy.
It proves the validator blocks non-deterministic authority without committing an
invalid control spec to the repository root.

```yaml
control_points:
  - id: CP-NEGATIVE-PROOF-001
    subject: script_control_fitness_negative_proof
    authority: llm
    enforcement:
      mode: enforced
```
