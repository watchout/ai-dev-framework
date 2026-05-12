import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MetaSpecLayer, SpecRepositoryPort } from '../ports.js';
import { META_SPEC_LAYERS } from '../ports.js';

async function listMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
    }
  }
  await walk(root);
  return out;
}

function parseHeadingsImpl(content: string): string[] {
  const out: string[] = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[2]);
  return out;
}

function parseFrontmatterImpl(content: string): {
  id: string[];
  metaSpec: boolean;
  metaSpecLayer: MetaSpecLayer;
} {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return { id: [], metaSpec: false, metaSpecLayer: 'spec' };
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
  const metaSpec = /^meta_spec:\s*true(\s+#.*)?\s*$/m.test(fm[1]);
  const layerMatch = fm[1].match(/^meta_spec_layer:\s*([A-Za-z]+)\s*$/m);
  const rawLayer = layerMatch?.[1];
  const metaSpecLayer: MetaSpecLayer =
    rawLayer && (META_SPEC_LAYERS as readonly string[]).includes(rawLayer)
      ? (rawLayer as MetaSpecLayer)
      : 'spec';
  return { id: ids, metaSpec, metaSpecLayer };
}

function sectionBodyImpl(content: string, heading: string): string | null {
  const lines = content.split('\n');
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
}

export function makeFsSpecRepository(rootDir: string): SpecRepositoryPort {
  const cache = new Map<string, string>();
  let files: Array<{ path: string; content: string }> | null = null;
  async function load() {
    if (files) return files;
    const abs = await listMarkdown(rootDir);
    files = await Promise.all(
      abs.map(async (p) => {
        const content = await readFile(p, 'utf8');
        cache.set(p, content);
        return { path: p, content };
      })
    );
    return files;
  }
  return {
    async list() {
      return load();
    },
    async parseFrontmatter(path: string) {
      const content = cache.get(path) ?? (await readFile(path, 'utf8'));
      cache.set(path, content);
      const fm = parseFrontmatterImpl(content);
      return { ...fm, headings: parseHeadingsImpl(content) };
    },
    async sectionBody(path: string, heading: string) {
      const content = cache.get(path) ?? (await readFile(path, 'utf8'));
      cache.set(path, content);
      return sectionBodyImpl(content, heading);
    },
  };
}
