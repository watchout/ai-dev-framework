import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

export async function runIdUniqueness(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const idToPaths = new Map<string, string[]>();
  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);
    for (const id of fm.id) {
      const list = idToPaths.get(id) ?? [];
      list.push(f.path);
      idToPaths.set(id, list);
    }
  }
  const findings: Finding[] = [];
  for (const [id, paths] of idToPaths) {
    if (paths.length > 1) {
      findings.push({
        check: 'id-uniqueness',
        severity: 'fail',
        files: [...paths].sort(),
        message: `Duplicate ID '${id}' found in ${paths.length} files`,
      });
    }
  }
  return findings;
}
