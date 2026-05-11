import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

export async function runControlMechanism(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);
    if (fm.metaSpec) continue;
    const body = await ctx.ports.spec.sectionBody(f.path, '10.');
    if (body === null || body.trim().length === 0) {
      findings.push({
        check: 'control-mechanism',
        severity: 'fail',
        files: [f.path],
        message: `F4: §10 control mechanism section missing or empty`,
      });
    }
  }
  return findings;
}
