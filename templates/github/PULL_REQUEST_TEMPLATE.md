## Summary
<!-- What was implemented/fixed in 1-3 sentences -->

## Tier
- [ ] **Nano** — existing contract only, no new product decisions, machine CI Gate 0 sufficient
- [ ] **Standard** — known domain, bounded scope, PR Design + acceptance criteria
- [ ] **Full** — new domain / protected surface / public impact

## Protected Categories
<!-- If any checked → tier auto-promotes to Full regardless of declaration above -->
- [ ] None
- [ ] Security / Auth / Credentials / Token / Encryption
- [ ] DB Schema / Migration / Data-loss Risk
- [ ] Public API / MCP Contract / External Protocol
- [ ] Agent Routing / Queue / Recovery
- [ ] Runtime / Process Lifecycle / Live Transport
- [ ] Production Deploy / Billing / Customer-impacting
- [ ] Governance / Branch Protection / Gate Bypass

## SSOT Reference
- Feature: <!-- FEAT-XXX or "existing spec sufficient" for Nano -->
- Sections: <!-- SX or N/A -->
- Path: <!-- docs/design/features/... or N/A -->

## SSOT Compliance (Full tier only)
- [ ] All MUST requirements from S3 satisfied
- [ ] S4 data spec matches implementation
- [ ] S5 API spec matches implementation
- [ ] S7 business rules correctly implemented
- [ ] S10 test cases all implemented

## Acceptance Evidence
- [ ] Acceptance criteria met (link to issue or checklist below)
- [ ] Unit tests added / updated and passing
- [ ] Integration tests passing
- [ ] No regression in existing tests

## Rollback Note
<!-- How to revert if issues arise post-merge -->

## Complete Evidence (fill AFTER deploy)
- [ ] Deployed to target environment
- [ ] Health check passing (runtime repos)
- [ ] Smoke test passing
- [ ] No error rate regression

## Related Issue
Closes #
