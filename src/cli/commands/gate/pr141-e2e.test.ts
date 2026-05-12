import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpec } from './validate-spec.js';
import {
  makeFakeAudit,
  makeFakeGit,
  makeFakeLink,
  makeFakeSpec,
} from './__fixtures__/fakes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const DOCS_DIR = join(REPO_ROOT, 'docs', 'spec');

function loadFile(name: string) {
  return {
    path: name,
    content: readFileSync(join(DOCS_DIR, name), 'utf8'),
  };
}

describe('PR #141 e2e — real v1.2.6 4-layer docs pass layer-aware validator', () => {
  it('v1.2.6-impl.md / v1.2.6-verify.md / v1.2.6-ops.md all PASS template-compliance', async () => {
    const files = [
      loadFile('v1.2.6-impl.md'),
      loadFile('v1.2.6-verify.md'),
      loadFile('v1.2.6-ops.md'),
    ];
    const spec = makeFakeSpec(files);
    const r = await validateSpec(
      { check: 'template-compliance' },
      {
        spec,
        git: makeFakeGit([]),
        link: makeFakeLink({}),
        audit: makeFakeAudit(),
      }
    );
    expect(
      r.findings.filter((f) => f.check === 'template-compliance')
    ).toEqual([]);
    expect(r.exit_code).toBe(0);
  });

  it('Task 3 regression: v1.2.6-spec-audit-gate.md (inline-comment frontmatter) PASSes template-compliance via production adapter (metaSpec exception)', async () => {
    const { makeFsSpecRepository } = await import('./adapters/spec-fs.js');
    const content = loadFile('v1.2.6-spec-audit-gate.md').content;
    expect(content).toMatch(/^meta_spec:\s*true\s+#/m);
    const spec = makeFsSpecRepository(DOCS_DIR);
    const all = await spec.list();
    const target = all.find((f) => f.path.endsWith('v1.2.6-spec-audit-gate.md'));
    expect(target).toBeDefined();
    const fm = await spec.parseFrontmatter(target!.path);
    expect(fm.metaSpec).toBe(true);

    const singleFileSpec = makeFakeSpec([
      { path: target!.path, content: target!.content, metaSpec: true },
    ]);
    const r = await validateSpec(
      { check: 'template-compliance' },
      {
        spec: singleFileSpec,
        git: makeFakeGit([]),
        link: makeFakeLink({}),
        audit: makeFakeAudit(),
      }
    );
    expect(
      r.findings.filter((f) => f.check === 'template-compliance')
    ).toEqual([]);
    expect(r.exit_code).toBe(0);
  });
});
