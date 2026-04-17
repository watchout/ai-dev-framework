# ADF Spec Index

| # | File | Content | Version |
|---|------|---------|---------|
| 01 | [01_DISCOVERY.md](01_DISCOVERY.md) | Discovery question flow (5-stage interview → initial docs) | v1.1.0 |
| 02 | [02_GENERATION_CHAIN.md](02_GENERATION_CHAIN.md) | Step-by-step document generation chain | v1.1.0 |
| 03 | [03_SSOT_FORMAT.md](03_SSOT_FORMAT.md) | SSOT format (12 sections, IEEE/ISO) + audit | v1.0.0 |
| 04 | [04_FEATURE_SPEC.md](04_FEATURE_SPEC.md) | Feature spec creation flow (hearing → SSOT → audit) | v1.1.0 |
| 05 | [05_IMPLEMENTATION.md](05_IMPLEMENTATION.md) | Implementation order, task decomposition, GitHub workflow | v1.1.0 |
| 06 | [06_CODE_QUALITY.md](06_CODE_QUALITY.md) | Code quality check, 2-step review, test format, CI | v1.1.0 |
| 07 | [07_AI_PROTOCOL.md](07_AI_PROTOCOL.md) | AI interruption/judgment protocol, decision backlog, autonomy | v1.1.0 |
| 08 | [08_MARKETING.md](08_MARKETING.md) | Marketing spec | v1.0.0 |
| 09 | [09_ENFORCEMENT.md](09_ENFORCEMENT.md) | **Deterministic enforcement mechanisms** (mode, bypass, integrity, AEGIS, session, read-receipt) | v1.1.0 |

## v1.1.0 Changes (epic #60)

Direction: LLM judgment dependency → deterministic script control.

- **09_ENFORCEMENT.md**: New spec. Consolidates §1 mode state machine (#63), §2 bypass audit (#65), §3 hook integrity (#67), §4 AEGIS gateway (#68), §5 session lifecycle (#69), §6 read-receipt (#64)
- **06_CODE_QUALITY**: §1 AI scoring → pass/fail checklist (#62), §2 adversarial review → 2-step model (#66), §4.7 CTO判断 → deterministic escalation (#62), §5 4-layer → 2-step (#66)
- **07_AI_PROTOCOL**: §4 LLM裁量 → read-receipt enforcement (#64), §6 Markdown → JSON (#61), §10b CTO loop → label-based policy (#61)
- **05_IMPLEMENTATION**: §3 plan.json removed (#61), §4.7 deterministic Gate D (#62)
- **01/02/04**: "review chain は framework 強制ではない" 注記追加

## Unchanged

- 03_SSOT_FORMAT.md, 08_MARKETING.md, common-features/, project-features/
