import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFsSpecRepository } from './spec-fs.js';

function withTempSpec(content: string, body: (port: ReturnType<typeof makeFsSpecRepository>, path: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'spec-fs-test-'));
  const path = join(dir, 's.md');
  writeFileSync(path, content, 'utf8');
  const port = makeFsSpecRepository(dir);
  return body(port, path).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('spec-fs meta_spec regex (Task 3 inline comment hotfix)', () => {
  it('T1: `meta_spec: true # comment` → true', async () => {
    await withTempSpec(
      `---\nid: SPEC-A\nmeta_spec: true # comment\n---\n# x\n`,
      async (port, path) => {
        const fm = await port.parseFrontmatter(path);
        expect(fm.metaSpec).toBe(true);
      }
    );
  });

  it('T2: `meta_spec: false # comment` → false', async () => {
    await withTempSpec(
      `---\nid: SPEC-A\nmeta_spec: false # comment\n---\n# x\n`,
      async (port, path) => {
        const fm = await port.parseFrontmatter(path);
        expect(fm.metaSpec).toBe(false);
      }
    );
  });

  it('T3: `meta_spec: true` (regression) → true', async () => {
    await withTempSpec(
      `---\nid: SPEC-A\nmeta_spec: true\n---\n# x\n`,
      async (port, path) => {
        const fm = await port.parseFrontmatter(path);
        expect(fm.metaSpec).toBe(true);
      }
    );
  });

  it('T4: `meta_spec: false` (regression) → false', async () => {
    await withTempSpec(
      `---\nid: SPEC-A\nmeta_spec: false\n---\n# x\n`,
      async (port, path) => {
        const fm = await port.parseFrontmatter(path);
        expect(fm.metaSpec).toBe(false);
      }
    );
  });

  it('T5: `meta_spec: true   #   complex comment with spaces` → true', async () => {
    await withTempSpec(
      `---\nid: SPEC-A\nmeta_spec: true   #   complex comment with spaces\n---\n# x\n`,
      async (port, path) => {
        const fm = await port.parseFrontmatter(path);
        expect(fm.metaSpec).toBe(true);
      }
    );
  });

  it('T6: `meta_spec:  true ` (no comment, whitespace edge) → true', async () => {
    await withTempSpec(
      `---\nid: SPEC-A\nmeta_spec:  true \n---\n# x\n`,
      async (port, path) => {
        const fm = await port.parseFrontmatter(path);
        expect(fm.metaSpec).toBe(true);
      }
    );
  });
});
