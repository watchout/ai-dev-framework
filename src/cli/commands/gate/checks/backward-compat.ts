import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;
const FR_ID_RE = /\b(?:SPEC-[A-Z0-9-]+-FR-\d+|FR-\d+)\b/g;
const FRONTMATTER_FIELD_RE = /^([a-zA-Z_][a-zA-Z0-9_-]*):/gm;

function headings(content: string): string[] {
  const out: string[] = [];
  HEADING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(content)) !== null) out.push(m[2].trim());
  return out;
}

function frIds(content: string): Set<string> {
  return new Set(content.match(FR_ID_RE) ?? []);
}

function frontmatterFields(content: string): Set<string> {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return new Set();
  const fields = new Set<string>();
  FRONTMATTER_FIELD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FRONTMATTER_FIELD_RE.exec(fm[1])) !== null) fields.add(m[1]);
  return fields;
}

function section0PatchTable(content: string): string | null {
  const m = content.match(/^##\s*0\.[^\n]*\n([\s\S]*?)(?=\n##\s|$)/m);
  if (!m) return null;
  if (!/\|.*\|/.test(m[1])) return null;
  return m[1];
}

function declaresChange(content: string): boolean {
  return /(廃止|removed|deprecat|breaking)/i.test(content);
}

export async function runBackwardCompat(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);
    if (fm.metaSpec) continue;

    let oldContent: string | null = null;
    try {
      oldContent = await ctx.ports.git.fileAtRef(f.path, ctx.baseRef);
    } catch {
      oldContent = null;
    }

    if (oldContent === null) continue;

    const oldHeadings = new Set(headings(oldContent));
    const newHeadings = new Set(headings(f.content));
    const removedHeadings = [...oldHeadings].filter((h) => !newHeadings.has(h));

    const oldFr = frIds(oldContent);
    const newFr = frIds(f.content);
    const removedFr = [...oldFr].filter((id) => !newFr.has(id));

    const oldFields = frontmatterFields(oldContent);
    const newFields = frontmatterFields(f.content);
    const removedFields = [...oldFields].filter((k) => !newFields.has(k));

    const patchTable = section0PatchTable(f.content);
    const hasPatch = patchTable !== null;

    const removals: string[] = [];
    if (removedHeadings.length > 0)
      removals.push(`headings: ${removedHeadings.join(',')}`);
    if (removedFr.length > 0) removals.push(`FRs: ${removedFr.join(',')}`);
    if (removedFields.length > 0)
      removals.push(`frontmatter: ${removedFields.join(',')}`);

    if (removals.length > 0) {
      if (!hasPatch) {
        findings.push({
          check: 'backward-compat',
          severity: 'fail',
          files: [f.path],
          message: `F5: silent breaking change — removals (${removals.join(' | ')}) without §0 patch table`,
        });
        continue;
      }
      const missing: string[] = [];
      for (const h of removedHeadings) {
        if (!patchTable.includes(h)) missing.push(`heading "${h}"`);
      }
      for (const id of removedFr) {
        if (!patchTable.includes(id)) missing.push(`FR ${id}`);
      }
      for (const k of removedFields) {
        if (!patchTable.includes(k)) missing.push(`field ${k}`);
      }
      if (missing.length > 0) {
        findings.push({
          check: 'backward-compat',
          severity: 'fail',
          files: [f.path],
          message: `F5: §0 patch table missing entries for: ${missing.join('; ')}`,
        });
        continue;
      }
    } else if (declaresChange(f.content) && !hasPatch) {
      findings.push({
        check: 'backward-compat',
        severity: 'fail',
        files: [f.path],
        message: `F5: deprecation/removal language present but §0 patch table missing`,
      });
    }
  }
  return findings;
}
