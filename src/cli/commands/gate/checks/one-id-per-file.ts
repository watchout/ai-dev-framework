import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

export async function runOneIdPerFile(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];
  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);
    if (fm.id.length > 1) {
      const bundle = await ctx.ports.spec.sectionBody(f.path, 'Bundle');
      if (bundle === null || bundle.trim().length === 0) {
        findings.push({
          check: 'one-id-per-file',
          severity: 'fail',
          files: [f.path],
          message: `Multiple IDs without exception (Bundle section) in ${f.path}: ${fm.id.join(',')}`,
        });
      }
    }
  }
  return findings;
}
