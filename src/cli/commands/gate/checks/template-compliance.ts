import type { CheckContext } from '../validate-spec.js';
import type { Finding, MetaSpecLayer } from '../ports.js';

const SPEC_REQUIRED_BASE = [
  '0.',
  '1.',
  '2.',
  '3.',
  '4.',
  '5.',
  '6.',
  '7.',
  '8.',
  '9.',
];

const IMPL_REQUIRED = ['§1', '§2', '§3', '§4', '§5', '§6'];
const VERIFY_REQUIRED = ['§1', '§2', '§3', '§4', '§5', '§6'];
const OPS_REQUIRED = ['§1', '§2', '§3', '§4', '§5', '§6', '§7'];

function hasSectionMatching(headings: string[], prefix: string): boolean {
  return headings.some((h) => {
    const t = h.trim();
    if (prefix.startsWith('§')) {
      const num = prefix.slice(1);
      return (
        t === `§${num}` ||
        t.startsWith(`§${num} `) ||
        t.startsWith(`§${num}.`) ||
        t.startsWith(`§${num}\t`)
      );
    }
    return t.startsWith(prefix);
  });
}

interface LayerCheck {
  required: readonly string[];
  label: string;
}

const LAYER_CHECKS: Record<Exclude<MetaSpecLayer, 'spec'>, LayerCheck> = {
  impl: { required: IMPL_REQUIRED, label: 'IMPL' },
  verify: { required: VERIFY_REQUIRED, label: 'VERIFY' },
  ops: { required: OPS_REQUIRED, label: 'OPS' },
};

export async function runTemplateCompliance(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];

  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);

    if (fm.metaSpec && fm.metaSpecLayer !== 'spec') {
      const rule = LAYER_CHECKS[fm.metaSpecLayer];
      const missing = rule.required.filter(
        (p) => !hasSectionMatching(fm.headings, p)
      );
      if (missing.length > 0) {
        findings.push({
          check: 'template-compliance',
          severity: 'fail',
          files: [f.path],
          message: `Missing sections in ${rule.label} layer: ${missing.join(',')}`,
        });
      }
      continue;
    }

    if (fm.metaSpec) {
      const missingMeta = SPEC_REQUIRED_BASE.filter(
        (p) => !hasSectionMatching(fm.headings, p)
      );
      if (missingMeta.length > 0) {
        findings.push({
          check: 'template-compliance',
          severity: 'fail',
          files: [f.path],
          message: `Missing sections in meta_spec: ${missingMeta.join(',')}`,
        });
      }
      continue;
    }

    const missing = SPEC_REQUIRED_BASE.filter(
      (p) => !hasSectionMatching(fm.headings, p)
    );
    if (missing.length > 0) {
      findings.push({
        check: 'template-compliance',
        severity: 'fail',
        files: [f.path],
        message: `Missing sections: ${missing.join(',')}`,
      });
      continue;
    }

    const section7 = await ctx.ports.spec.sectionBody(f.path, '7.');
    if (section7 === null || section7.trim().length === 0) {
      findings.push({
        check: 'template-compliance',
        severity: 'fail',
        files: [f.path],
        message: `F2-a: §7 受入基準 section is empty`,
      });
      continue;
    }

    const hasGherkin =
      /^\s*Given\b/im.test(section7) &&
      /^\s*When\b/im.test(section7) &&
      /^\s*Then\b/im.test(section7);
    if (!hasGherkin) {
      findings.push({
        check: 'template-compliance',
        severity: 'fail',
        files: [f.path],
        message: `F2-b: §7 receives no Gherkin (Given/When/Then) scenario`,
      });
      continue;
    }

    const testingHeading = fm.headings.find((h) => {
      const trimmed = h.trim().toLowerCase();
      if (!/^(1[1-9]|[2-9]\d)\./.test(trimmed)) return false;
      return (
        trimmed.includes('test') ||
        trimmed.includes('テスト') ||
        trimmed.includes('testing layer')
      );
    });
    if (!testingHeading) {
      findings.push({
        check: 'template-compliance',
        severity: 'fail',
        files: [f.path],
        message: `F2-c: testing layer section missing after §11`,
      });
      continue;
    }

    const tlBody = await ctx.ports.spec.sectionBody(f.path, testingHeading.trim());
    if (
      tlBody === null ||
      !/\b(unit|integration|e2e|regression|smoke)\b/i.test(tlBody)
    ) {
      findings.push({
        check: 'template-compliance',
        severity: 'fail',
        files: [f.path],
        message: `F2-d: no testing layer declared (unit|integration|e2e|regression|smoke)`,
      });
    }
  }
  return findings;
}
