## Summary
<!-- What changed and why -->

## 4-Layer Docs
- SPEC: `docs/spec/<FEATURE-ID>.md`
- IMPL: `docs/impl/<FEATURE-ID>.md`
- VERIFY: `docs/verify/<FEATURE-ID>.md`
- OPS: `docs/ops/<FEATURE-ID>.md`

## Traceability
- [ ] `framework trace verify` passes
- [ ] SPEC traces to IMPL / VERIFY / OPS
- [ ] IMPL traces to SPEC / VERIFY / OPS
- [ ] VERIFY traces to SPEC / IMPL
- [ ] OPS traces to SPEC / IMPL

## MCP Contract
- [ ] MCP tool names, schemas, and errors match `SSOT-3_API_CONTRACT`
- [ ] Storage entities and persistence modes match `SSOT-4_DATA_MODEL`
- [ ] No frontend/browser assumptions were introduced

## Validation
- [ ] `npm run build`
- [ ] `npm run type-check`
- [ ] `npm test`
- [ ] `framework gate spec`
- [ ] `framework gate check`

## Related Issue
Closes #
