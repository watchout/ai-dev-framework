import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

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
    if (!/(backward[- ]?compat|互換|breaking)/i.test(f.content)) {
      findings.push({
        check: 'backward-compat',
        severity: 'fail',
        files: [f.path],
        message: `F5: pre-existing spec lacks backward-compat declaration`,
      });
    }
  }
  return findings;
}
