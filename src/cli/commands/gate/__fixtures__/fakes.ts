import type {
  AuditLogPort,
  GitHistoryPort,
  LinkProbePort,
  MetaSpecLayer,
  SpecRepositoryPort,
} from '../ports.js';
import { META_SPEC_LAYERS } from '../ports.js';

interface FakeFile {
  path: string;
  content: string;
  id?: string[];
  metaSpec?: boolean;
  metaSpecLayer?: MetaSpecLayer;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;

export function makeFakeSpec(files: FakeFile[]): SpecRepositoryPort {
  const parseHeadings = (content: string): string[] => {
    const out: string[] = [];
    HEADING_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HEADING_RE.exec(content)) !== null) {
      out.push(m[2]);
    }
    return out;
  };
  const parseFrontmatterIds = (content: string): string[] => {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return [];
    const ids: string[] = [];
    const single = fm[1].match(/^id:\s*(\S+)\s*$/m);
    if (single) ids.push(single[1]);
    const list = fm[1].match(/^ids:\s*\[([^\]]+)\]/m);
    if (list) {
      for (const part of list[1].split(',')) {
        const t = part.trim().replace(/^["']|["']$/g, '');
        if (t) ids.push(t);
      }
    }
    return ids;
  };
  const parseMetaSpec = (content: string): boolean => {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return false;
    return /^meta_spec:\s*true\s*$/m.test(fm[1]);
  };
  const parseMetaSpecLayer = (content: string): MetaSpecLayer => {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return 'spec';
    const m = fm[1].match(/^meta_spec_layer:\s*([A-Za-z]+)\s*$/m);
    const raw = m?.[1];
    return raw && (META_SPEC_LAYERS as readonly string[]).includes(raw)
      ? (raw as MetaSpecLayer)
      : 'spec';
  };

  return {
    async list() {
      return files.map((f) => ({ path: f.path, content: f.content }));
    },
    async parseFrontmatter(path: string) {
      const f = files.find((x) => x.path === path);
      if (!f)
        return { id: [], headings: [], metaSpec: false, metaSpecLayer: 'spec' };
      const id = f.id ?? parseFrontmatterIds(f.content);
      const metaSpec = f.metaSpec ?? parseMetaSpec(f.content);
      const metaSpecLayer = f.metaSpecLayer ?? parseMetaSpecLayer(f.content);
      const headings = parseHeadings(f.content);
      return { id, headings, metaSpec, metaSpecLayer };
    },
    async sectionBody(path: string, heading: string) {
      const f = files.find((x) => x.path === path);
      if (!f) return null;
      const lines = f.content.split('\n');
      const norm = heading.trim();
      let start = -1;
      let startLevel = 0;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
        if (!m) continue;
        const title = m[2].trim();
        if (title === norm || title.startsWith(norm)) {
          start = i + 1;
          startLevel = m[1].length;
          break;
        }
      }
      if (start === -1) return null;
      const body: string[] = [];
      for (let i = start; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/);
        if (m && m[1].length <= startLevel) break;
        body.push(lines[i]);
      }
      return body.join('\n');
    },
  };
}

export function makeFakeGit(
  preExistingPaths: string[],
  oldContent: Record<string, string> = {}
): GitHistoryPort {
  const set = new Set(preExistingPaths);
  return {
    async isPreExistingSpec(path: string) {
      return set.has(path);
    },
    async fileAtRef(path: string) {
      return oldContent[path] ?? null;
    },
  };
}

export function makeFakeLink(probes: Record<string, { ok: boolean; reason?: string }>): LinkProbePort {
  return {
    async head(url: string) {
      const r = probes[url];
      if (r) return r;
      return { ok: true };
    },
  };
}

export function makeFakeAudit(): AuditLogPort & { entries: object[] } {
  const entries: object[] = [];
  return {
    entries,
    async append(entry: object) {
      entries.push(entry);
      return '.framework/audit/fake.jsonl';
    },
  };
}
