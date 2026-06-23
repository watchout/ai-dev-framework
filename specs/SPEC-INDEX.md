<!-- skill-validator: bypass=spec index cross-reference document; all entries reference checked-in files in this repo -->
# ADF Spec Index

| # | File | Content | Version |
|---|------|---------|---------|
| 01 | [01_DISCOVERY.md](01_DISCOVERY.md) | Discovery question flow (5-stage interview → initial docs) + Tier Modes (Nano/Standard/Full) | v1.2.0 |
| 02 | [02_GENERATION_CHAIN.md](02_GENERATION_CHAIN.md) | Step-by-step document generation chain | v1.1.0 |
| 03 | [03_SSOT_FORMAT.md](03_SSOT_FORMAT.md) | SSOT format (12 sections, IEEE/ISO) + audit | v1.0.0 |
| 04 | [04_FEATURE_SPEC.md](04_FEATURE_SPEC.md) | Feature spec creation flow (hearing → SSOT → audit) + Deliberation Protocol (Full tier only) | v1.2.0 |
| 05 | [05_IMPLEMENTATION.md](05_IMPLEMENTATION.md) | Implementation order, task decomposition, GitHub workflow, slice-mode tier control | v1.2.0 |
| 06 | [06_CODE_QUALITY.md](06_CODE_QUALITY.md) | Code quality check, Tiered Quality Gates (Nano/Standard/Full), 2-step review, test format, CI | v1.2.0 |
| 07 | [07_AI_PROTOCOL.md](07_AI_PROTOCOL.md) | AI interruption/judgment protocol + Tier Auto-Promotion Triggers (7 protected categories) | v1.2.0 |
| 08 | [08_MARKETING.md](08_MARKETING.md) | Marketing spec | v1.0.0 |
| 09 | [09_ENFORCEMENT.md](09_ENFORCEMENT.md) | **Deterministic enforcement mechanisms** (mode, bypass, integrity, AEGIS, session, read-receipt) + **Gate Engine** (Goal Contract, Context Pack, AI Change Record, Merge Authority) | v1.2.0 |

## v1.2.0 Changes

Direction: Public-grade Gate Engine baseline — Goal Contract, Context Pack, AI Change Record, Tier system, Protected-category auto-promotion.

- **09_ENFORCEMENT.md §10**: Gate Engine concepts (Goal Contract, Context Pack, AI Change Record, Tier Auto-Promotion, Merge Authority) — issue #329
- **07_AI_PROTOCOL.md §0**: Tier Auto-Promotion Triggers (7 protected categories) with trigger patterns
- **06_CODE_QUALITY.md**: Tiered Quality Gates table (Nano=CI only, Standard≥80, Full=100/100)
- **05_IMPLEMENTATION.md**: Slice-mode tier control
- **04_FEATURE_SPEC.md**: Deliberation Protocol restricted to Full tier / protected surfaces
- **01_DISCOVERY.md**: Tier Modes section (Nano=Skip, Standard=Fast-track, Full=30Q+Deliberation)

## v1.1.0 Changes (epic #60)

Direction: LLM judgment dependency → deterministic script control.

- **09_ENFORCEMENT.md**: New spec. Consolidates §1 mode state machine, §2 bypass audit, §3 hook integrity, §4 AEGIS gateway, §5 session lifecycle, §6 read-receipt
- **06_CODE_QUALITY**: §1 AI scoring → pass/fail checklist, §2 adversarial review → 2-step model
- **07_AI_PROTOCOL**: §4 LLM裁量 → read-receipt enforcement, §6 Markdown → JSON
- **05_IMPLEMENTATION**: §3 plan.json removed, §4.7 deterministic Gate D
- **01/02/04**: "review chain は framework 強制ではない" 注記追加

## See Also

- `docs/spec/v1.2.0-gate-engine.md` — Full Gate Engine spec (SPEC-DOC4L-020)
- `docs/spec/v1.2.0-merge-authority-gate.md` — Merge authority gate spec
- `src/cli/lib/llm-adapter-model.ts` — ContextPack + AIChangeRecord TypeScript interfaces
- `src/cli/lib/protected-pattern-detector.ts` — Tier auto-promotion diff scanner
- `docs/specs/SPEC-INDEX.md` — Extended index with additional specs (04b, 04c, 10)
