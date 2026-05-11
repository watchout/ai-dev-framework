import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpec } from './validate-spec.js';
import { makeFakeAudit, makeFakeLink } from './__fixtures__/fakes.js';
import type {
  GitHistoryPort,
  SpecRepositoryPort,
} from './ports.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, '__fixtures__', 'corpus-v1');

interface History {
  preExistingPaths: string[];
  baseRef: string;
}

function loadCorpus() {
  const history: History = JSON.parse(
    readFileSync(join(CORPUS_DIR, 'git-history.json'), 'utf8')
  );
  const files = readdirSync(CORPUS_DIR)
    .filter((n) => n.endsWith('.md'))
    .map((n) => ({
      path: `corpus-v1/${n}`,
      content: readFileSync(join(CORPUS_DIR, n), 'utf8'),
    }));
  return { history, files };
}

function corpusSpec(files: Array<{ path: string; content: string }>): SpecRepositoryPort {
  const parseHeadings = (content: string): string[] => {
    const out: string[] = [];
    const re = /^(#{1,6})\s+(.+?)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) out.push(m[2]);
    return out;
  };
  const ids = (content: string): string[] => {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return [];
    const single = fm[1].match(/^id:\s*(\S+)\s*$/m);
    return single ? [single[1]] : [];
  };
  const meta = (content: string): boolean => {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return false;
    return /^meta_spec:\s*true\s*$/m.test(fm[1]);
  };
  return {
    async list() {
      return files;
    },
    async parseFrontmatter(path: string) {
      const f = files.find((x) => x.path === path);
      if (!f) return { id: [], headings: [], metaSpec: false };
      return {
        id: ids(f.content),
        headings: parseHeadings(f.content),
        metaSpec: meta(f.content),
      };
    },
    async sectionBody(path: string, heading: string) {
      const f = files.find((x) => x.path === path);
      if (!f) return null;
      const lines = f.content.split('\n');
      const norm = heading.trim();
      let start = -1;
      let lvl = 0;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
        if (!m) continue;
        if (m[2].trim() === norm || m[2].trim().startsWith(norm)) {
          start = i + 1;
          lvl = m[1].length;
          break;
        }
      }
      if (start === -1) return null;
      const out: string[] = [];
      for (let i = start; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/);
        if (m && m[1].length <= lvl) break;
        out.push(lines[i]);
      }
      return out.join('\n');
    },
  };
}

function corpusGit(preExisting: string[]): GitHistoryPort {
  const set = new Set(preExisting);
  return { async isPreExistingSpec(path: string) { return set.has(path); } };
}

describe('integration smoke (corpus-v1)', () => {
  it('Smoke A: no-flag default → exit 2, 3 findings (F1 fail + 2 warns)', async () => {
    const { history, files } = loadCorpus();
    const r = await validateSpec(
      { baseRef: history.baseRef, linkProbe: 'fake' },
      {
        spec: corpusSpec(files),
        git: corpusGit(history.preExistingPaths),
        link: makeFakeLink({}),
        audit: makeFakeAudit(),
      }
    );
    expect(r.exit_code).toBe(2);
    expect(r.findings.length).toBe(3);
    const f1 = r.findings.find((f) => f.check === 'id-uniqueness');
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe('fail');
    expect(new Set(f1!.files)).toEqual(
      new Set(['corpus-v1/duplicate.md', 'corpus-v1/normal-new.md'])
    );
    const warns = r.findings.filter((f) => f.severity === 'warn');
    expect(warns.length).toBe(2);
    expect(r.audit_log_path).not.toBe('');
    expect(r.audit_log_path).not.toBe('unavailable');
  });

  it('Smoke B: --bootstrap → exit 0, 3 warn findings', async () => {
    const { history, files } = loadCorpus();
    const r = await validateSpec(
      { baseRef: history.baseRef, linkProbe: 'fake', bootstrap: true },
      {
        spec: corpusSpec(files),
        git: corpusGit(history.preExistingPaths),
        link: makeFakeLink({}),
        audit: makeFakeAudit(),
      }
    );
    expect(r.exit_code).toBe(0);
    expect(r.findings.length).toBe(3);
    for (const f of r.findings) expect(f.severity).toBe('warn');
  });
});
