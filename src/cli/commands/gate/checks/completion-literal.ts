import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

const VAGUE_RE = /(〜?程度|〜?ぐらい|大体|状況に応じて)/;

function findHeading(headings: string[], re: RegExp): string | null {
  return headings.find((h) => re.test(h)) ?? null;
}

export async function runCompletionLiteral(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);
    if (fm.metaSpec) continue;
    const heading =
      findHeading(fm.headings, /完了条件/) ??
      findHeading(fm.headings, /Definition of Done/i);
    let body: string | null = null;
    if (heading) {
      body = await ctx.ports.spec.sectionBody(f.path, heading.trim());
    }
    if (body === null) {
      body = await ctx.ports.spec.sectionBody(f.path, '7.');
    }
    if (body === null) continue;
    if (VAGUE_RE.test(body)) {
      findings.push({
        check: 'completion-literal',
        severity: 'warn',
        files: [f.path],
        message: `F7: ambiguous DoD — vague phrase matched (程度|ぐらい|大体|状況に応じて)`,
      });
    }
  }
  return findings;
}
