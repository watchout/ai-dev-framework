# Valid Enforced Control

```yaml
control_points:
  - id: CP-VALID-001
    subject: design_validator
    authority: deterministic-script
    enforcement:
      mode: enforced
    evidence_required:
      - check_run
    script_ref: scripts/shirube/check-script-control-fitness.mjs
```
