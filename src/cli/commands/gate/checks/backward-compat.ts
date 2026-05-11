import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

function hasPatchTableInSection0(content: string): boolean {
  const sec0 = content.match(/^##\s*0\.[^\n]*\n([\s\S]*?)(?=\n##\s|\Z)/m);
  if (!sec0) return false;
  const body = sec0[1];
  if (!/\|.*\|/.test(body)) return false;
  return /patch|廃止|deprecat|removed|backward|互換/i.test(body);
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
    let isPre = false;
    try {
      isPre = await ctx.ports.git.isPreExistingSpec(f.path, ctx.baseRef);
    } catch {
      continue;
    }
    if (!isPre) continue;
    if (declaresChange(f.content) && !hasPatchTableInSection0(f.content)) {
      findings.push({
        check: 'backward-compat',
        severity: 'fail',
        files: [f.path],
        message: `F5: silent breaking change detected — §0 patch table missing for pre-existing spec with deprecation/removal language`,
      });
    }
  }
  return findings;
}
