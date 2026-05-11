import { describe, expect, it } from 'vitest';
import { validateSpec } from './validate-spec.js';
import {
  makeFakeAudit,
  makeFakeGit,
  makeFakeLink,
  makeFakeSpec,
} from './__fixtures__/fakes.js';

function ports(spec: ReturnType<typeof makeFakeSpec>, git = makeFakeGit([])) {
  return {
    spec,
    git,
    link: makeFakeLink({}),
    audit: makeFakeAudit(),
  };
}

const COMPLETE_SPEC = `---
id: SPEC-FOO-OK
status: Draft
---
## 0. メタ
## 1. 目的
## 2. 非目的
## 3. ストーリー
## 4. 要件
## 5. 契約
## 6. 非機能
## 7. 受入基準
Given X
When Y
Then Z
## 8. 前提
## 9. リスク
## 10. 制御機構
control here
## 11. testing layer
- unit
`;

describe('validateSpec', () => {
  it('Fixture 1: F1 id duplication → fail', async () => {
    const spec = makeFakeSpec([
      { path: 'dup-a.md', content: `---\nid: SPEC-FOO-001\n---\n## 0. m\n` },
      { path: 'dup-b.md', content: `---\nid: SPEC-FOO-001\n---\n## 0. m\n` },
    ]);
    const r = await validateSpec({ check: 'id-uniqueness' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].check).toBe('id-uniqueness');
    expect(r.findings[0].files).toEqual(['dup-a.md', 'dup-b.md']);
    expect(r.findings[0].message).toContain('Duplicate ID');
  });

  it('Fixture 2: F2 base section missing → fail', async () => {
    const spec = makeFakeSpec([
      {
        path: 'partial.md',
        content: `---\nid: SPEC-FOO-002\n---\n## 0. m\n## 1. p\n## 2. n\n## 3. s\n## 4. r\n## 5. c\n## 6. nf\n`,
      },
    ]);
    const r = await validateSpec({ check: 'template-compliance' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].message).toContain('Missing sections');
  });

  it('Fixture 3: F2-a §7 empty → fail', async () => {
    const content = `---
id: SPEC-FOO-003
status: Draft
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
ok
## 11. testing layer
- unit
`;
    const spec = makeFakeSpec([{ path: 'f2a.md', content }]);
    const r = await validateSpec({ check: 'template-compliance' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].check).toBe('template-compliance');
    expect(r.findings[0].severity).toBe('fail');
    expect(r.findings[0].files).toEqual(['f2a.md']);
    expect(r.findings[0].message).toContain('F2-a');
    expect(r.findings[0].message).toContain('§7');
    expect(r.findings[0].message).toContain('empty');
  });

  it('Fixture 4: F2-b no Gherkin → fail', async () => {
    const content = `---
id: SPEC-FOO-004
status: Draft
---
## 0. メタ
## 1. 目的
## 2. 非目的
## 3. ストーリー
## 4. 要件
## 5. 契約
## 6. 非機能
## 7. 受入基準
受入基準は run pass で達成される(prose only)
## 8. 前提
## 9. リスク
## 10. 制御機構
ok
## 11. testing layer
- integration
`;
    const spec = makeFakeSpec([{ path: 'f2b.md', content }]);
    const r = await validateSpec({ check: 'template-compliance' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].check).toBe('template-compliance');
    expect(r.findings[0].severity).toBe('fail');
    expect(r.findings[0].files).toEqual(['f2b.md']);
    expect(r.findings[0].message).toContain('F2-b');
    expect(r.findings[0].message).toContain('Gherkin');
  });

  it('Fixture 5: F2-c §11 testing layer missing → fail', async () => {
    const content = `---
id: SPEC-FOO-005
status: Draft
---
## 0. メタ
## 1. 目的
## 2. 非目的
## 3. ストーリー
## 4. 要件
## 5. 契約
## 6. 非機能
## 7. 受入基準
Given X
When Y
Then Z
## 8. 前提
## 9. リスク
## 10. 制御機構
ok
## 11. notes
some notes that do not declare testing
`;
    const spec = makeFakeSpec([{ path: 'f2c.md', content }]);
    const r = await validateSpec({ check: 'template-compliance' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].check).toBe('template-compliance');
    expect(r.findings[0].severity).toBe('fail');
    expect(r.findings[0].files).toEqual(['f2c.md']);
    expect(r.findings[0].message).toContain('F2-c');
    expect(r.findings[0].message).toContain('testing layer');
    expect(r.findings[0].message).toContain('missing');
  });

  it('Fixture 6: F2-d no testing layer keyword → fail', async () => {
    const content = `---
id: SPEC-FOO-006
status: Draft
---
## 0. メタ
## 1. 目的
## 2. 非目的
## 3. ストーリー
## 4. 要件
## 5. 契約
## 6. 非機能
## 7. 受入基準
Given X
When Y
Then Z
## 8. 前提
## 9. リスク
## 10. 制御機構
ok
## 11. testing notes
テスト方針はあとで決める
`;
    const spec = makeFakeSpec([{ path: 'f2d.md', content }]);
    const r = await validateSpec({ check: 'template-compliance' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].check).toBe('template-compliance');
    expect(r.findings[0].severity).toBe('fail');
    expect(r.findings[0].files).toEqual(['f2d.md']);
    expect(r.findings[0].message).toContain('F2-d');
    expect(r.findings[0].message).toContain('no testing layer declared');
  });

  it('Fixture 7: F3 multiple ids without bundle exception → fail', async () => {
    const content = `---
ids: [SPEC-FOO-001, SPEC-FOO-002]
---
## 0. m
`;
    const spec = makeFakeSpec([{ path: 'multi.md', content }]);
    const r = await validateSpec({ check: 'one-id-per-file' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].message).toContain('Multiple IDs without exception');
  });

  it('Fixture 8: bootstrap fail → warn', async () => {
    const content = `---
id: SPEC-LEGACY-001
---
## 0. m
## 1. p
## 2. n
## 3. s
## 4. r
## 5. c
## 6. nf
## 7. 受入基準
Given X
When Y
Then Z
## 8. pre
## 9. risk
## 11. testing
- unit
`;
    const spec = makeFakeSpec([{ path: 'legacy.md', content }]);
    const git = makeFakeGit(['legacy.md']);
    const r = await validateSpec(
      { check: 'control-mechanism', bootstrap: true },
      { ...ports(spec, git) }
    );
    expect(r.exit_code).toBe(0);
    expect(r.findings[0].severity).toBe('warn');
    expect(r.findings[0].files).toEqual(['legacy.md']);
  });

  it('Fixture 9: usage error (--strict + --bootstrap)', async () => {
    const spec = makeFakeSpec([]);
    const r = await validateSpec({ strict: true, bootstrap: true }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].check).toBe('usage');
    expect(r.findings[0].message).toContain('mutually exclusive');
  });

  it('Fixture 10: usage error invalid check name', async () => {
    const spec = makeFakeSpec([]);
    const r = await validateSpec(
      { check: ['id-uniqueness', 'bogus-check'] },
      ports(spec)
    );
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].check).toBe('usage');
    expect(r.findings[0].message).toContain('unknown check name: bogus-check');
  });

  it('Fixture 11: usage error invalid linkProbe', async () => {
    const spec = makeFakeSpec([]);
    const r = await validateSpec({ linkProbe: 'invalid' }, ports(spec));
    expect(r.exit_code).toBe(2);
    expect(r.findings[0].check).toBe('usage');
    expect(r.findings[0].message).toContain('invalid --link-probe value');
  });

  it('Fixture 12: meta_spec exception (§12-§14 missing allowed)', async () => {
    const content = `---
id: SPEC-META-001
meta_spec: true
---
${COMPLETE_SPEC.split('---\n').slice(2).join('---\n')}`;
    const spec = makeFakeSpec([{ path: 'meta-spec.md', content }]);
    const r = await validateSpec({ check: 'template-compliance' }, ports(spec));
    expect(r.exit_code).toBe(0);
    expect(r.findings).toHaveLength(0);
  });
});
