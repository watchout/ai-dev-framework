# Shirube Governance Flow Snapshot

Status: derived snapshot
Canonical source: `docs/standards/shirube-ai-development-governance-standard-v1.md`

This document is not a competing SSOT. The canonical delivery flow, risk-tier chain, audit model, maker/checker rule, authority model, and CTO role are defined in the Shirube AI Development Governance Standard v1.

## Derived Risk-tier Chain

| Tier or Route | Derived Summary |
| --- | --- |
| R0 | Mechanical gates only. Auto-merge candidate only; active auto-merge requires a later approved enforcement Cell. |
| R1/R2 | Mechanical gates plus one standardized semantic audit, Bridge admissibility PASS, and owner merge. |
| R3/R4 | Mechanical gates plus standardized semantic audit, human protected-surface authority, CTO participation where required, and staged rollout. |
| route:ceo-approval | CEO ratification is required before merge or activation. |

## Derived Audit Flow

```text
Part A: machine reconciliation
Part B: list-driven LLM semantic audit with structured item output
Bridge: machine admissibility check
Merge gate: consumes Bridge output, not LLM prose
```

Freeform audit prose is not valid gate evidence. This snapshot must be refreshed from the standard whenever the canonical delivery flow changes.
