import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

const VAGUE_PATTERNS = [
  /\bTBD\b/i,
  /\bTODO\b/i,
  /\bあとで\b/,
  /\b未定\b/,
  /\bdecide\s+later\b/i,
];

export async function runCompletionLiteral(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);
    if (fm.metaSpec) continue;
    const heading = fm.headings.find((h) => /完了条件|completion/i.test(h));
    let body: string | null = null;
    if (heading) {
      body = await ctx.ports.spec.sectionBody(f.path, heading.trim());
    }
    if (body === null) {
      body = await ctx.ports.spec.sectionBody(f.path, '7.');
    }
    if (body === null || body.trim().length === 0) {
      findings.push({
        check: 'completion-literal',
        severity: 'warn',
        files: [f.path],
        message: `F7: ambiguous DoD — completion criteria section empty`,
      });
      continue;
    }
    for (const re of VAGUE_PATTERNS) {
      if (re.test(body)) {
        findings.push({
          check: 'completion-literal',
          severity: 'warn',
          files: [f.path],
          message: `F7: ambiguous DoD — vague phrase matched (${re.source})`,
        });
        break;
      }
    }
  }
  return findings;
}
