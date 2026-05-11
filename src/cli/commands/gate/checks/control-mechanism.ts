import type { CheckContext } from '../validate-spec.js';
import type { Finding } from '../ports.js';

const SELECTION_RATIONALE = /(script|Hook|フック)[^。\n]{0,40}(選定|根拠|理由|採用|why)/i;
const HOOK_UNAVOIDABLE_CASES = /(不可避|unavoidable)[^。\n]{0,20}(4|四)\s*(case|ケース|条件)/i;

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
        message: `F4: §10 制御機構選定原則 section missing or empty`,
      });
      continue;
    }
    if (!SELECTION_RATIONALE.test(body)) {
      findings.push({
        check: 'control-mechanism',
        severity: 'fail',
        files: [f.path],
        message: `F4: §10 missing script/Hook 選定根拠 rationale`,
      });
      continue;
    }
    const hookAdopted =
      /(Hook|フック)[^。\n]{0,20}(採用|adopt)/i.test(body) &&
      !/(Hook|フック)[^。\n]{0,20}不採用/i.test(body);
    if (hookAdopted && !HOOK_UNAVOIDABLE_CASES.test(body)) {
      findings.push({
        check: 'control-mechanism',
        severity: 'fail',
        files: [f.path],
        message: `F4: Hook 採用時 不可避 4 case explicit enumeration required`,
      });
    }
  }
  return findings;
}
