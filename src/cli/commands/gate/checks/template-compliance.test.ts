import { describe, expect, it } from 'vitest';
import { validateSpec } from '../validate-spec.js';
import {
  makeFakeAudit,
  makeFakeGit,
  makeFakeLink,
  makeFakeSpec,
} from '../__fixtures__/fakes.js';

function ports(spec: ReturnType<typeof makeFakeSpec>) {
  return {
    spec,
    git: makeFakeGit([]),
    link: makeFakeLink({}),
    audit: makeFakeAudit(),
  };
}

const SPEC_OK = `---
id: SPEC-FOO-001
status: Draft
meta_spec: true
meta_spec_layer: spec
---
## 0. メタ
## 1. 目的
## 2. 非目的
## 3. ストーリー
## 4. 要件
## 5. 契約
## 6. 非機能
## 7. 受入基準
## 8. 前提
## 9. リスク
## 10. 制御機構
## 11. testing layer
`;

const IMPL_OK = `---
id: IMPL-FOO-001
meta_spec: true
meta_spec_layer: impl
---
## §1 概要
## §2 アーキテクチャ
## §3 主要 component
## §4 主要 file path 一覧
## §5 SPEC ↔ IMPL alignment
## §6 Related documents
`;

const VERIFY_OK = `---
id: VERIFY-FOO-001
meta_spec: true
meta_spec_layer: verify
---
## §1 概要
## §2 Test inventory
## §3 Coverage rationale
## §4 Regression discipline
## §5 Known coverage gaps
## §6 Related documents
`;

const OPS_OK = `---
id: OPS-FOO-001
meta_spec: true
meta_spec_layer: ops
---
## §1 概要
## §2 Deploy
## §3 Monitoring
## §4 Failure response
## §5 Rollback
## §6 Known operational debt
## §7 Related documents
`;

describe('template-compliance layer-aware', () => {
  it('T1: SPEC layer PASS (legacy meta_spec, no layer field)', async () => {
    const content = SPEC_OK.replace('meta_spec_layer: spec\n', '');
    const spec = makeFakeSpec([{ path: 's.md', content }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(0);
    expect(r.findings).toHaveLength(0);
  });

  it('T2: IMPL layer PASS', async () => {
    const spec = makeFakeSpec([{ path: 'i.md', content: IMPL_OK }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(0);
    expect(r.findings).toHaveLength(0);
  });

  it('T3: VERIFY layer PASS', async () => {
    const spec = makeFakeSpec([{ path: 'v.md', content: VERIFY_OK }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(0);
    expect(r.findings).toHaveLength(0);
  });

  it('T4: OPS layer PASS', async () => {
    const spec = makeFakeSpec([{ path: 'o.md', content: OPS_OK }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(0);
    expect(r.findings).toHaveLength(0);
  });

  it('T5: IMPL layer FAIL on missing §3', async () => {
    const content = IMPL_OK.replace('## §3 主要 component\n', '');
    const spec = makeFakeSpec([{ path: 'i-bad.md', content }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].message).toContain('IMPL');
    expect(r.findings[0].message).toContain('§3');
  });

  it('T6: invalid layer value falls back to SPEC', async () => {
    const content = IMPL_OK.replace('meta_spec_layer: impl', 'meta_spec_layer: foobar');
    const spec = makeFakeSpec([{ path: 'bad-layer.md', content }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].message).toContain('meta_spec');
  });

  it('T7: meta-spec with §0.1 exception (no layer field, SPEC default) PASS', async () => {
    const spec = makeFakeSpec([{ path: 'meta.md', content: SPEC_OK }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(0);
  });

  it('T8: regression — legacy non-meta_spec doc still required §0-§9', async () => {
    const content = `---
id: SPEC-LEGACY-001
---
## 0. m
## 1. p
`;
    const spec = makeFakeSpec([{ path: 'legacy.md', content }]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      ports(spec)
    );
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].message).toContain('Missing sections');
  });
});
