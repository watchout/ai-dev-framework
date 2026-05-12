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

interface SectionRule {
  n: number;
  titleKeyword: string;
}

const IMPL_REQUIRED: readonly SectionRule[] = [
  { n: 1, titleKeyword: '概要' },
  { n: 2, titleKeyword: 'アーキテクチャ' },
  { n: 3, titleKeyword: '主要 component' },
  { n: 4, titleKeyword: '主要 file path' },
  { n: 5, titleKeyword: 'SPEC ↔ IMPL alignment' },
  { n: 6, titleKeyword: 'Related documents' },
];

const VERIFY_REQUIRED: readonly SectionRule[] = [
  { n: 1, titleKeyword: '概要' },
  { n: 2, titleKeyword: 'Test inventory' },
  { n: 3, titleKeyword: 'Coverage rationale' },
  { n: 4, titleKeyword: 'Regression discipline' },
  { n: 5, titleKeyword: 'Known coverage gaps' },
  { n: 6, titleKeyword: 'Related documents' },
];

const OPS_REQUIRED: readonly SectionRule[] = [
  { n: 1, titleKeyword: '概要' },
  { n: 2, titleKeyword: 'Deploy' },
  { n: 3, titleKeyword: 'Monitoring' },
  { n: 4, titleKeyword: 'Failure response' },
  { n: 5, titleKeyword: 'Rollback' },
  { n: 6, titleKeyword: 'Known operational debt' },
  { n: 7, titleKeyword: 'Related documents' },
];

function hasSectionMatching(headings: string[], prefix: string): boolean {
  return headings.some((h) => {
    const t = h.trim();
    return t.startsWith(prefix);
  });
}

function hasLayerSection(headings: string[], rule: SectionRule): boolean {
  return headings.some((h) => {
    const t = h.trim();
    const p = `§${rule.n}`;
    const boundary =
      t === p ||
      t.startsWith(`${p} `) ||
      t.startsWith(`${p}.`) ||
      t.startsWith(`${p}\t`);
    if (!boundary) return false;
    return t.includes(rule.titleKeyword);
  });
}

interface LayerCheck {
  required: readonly SectionRule[];
  label: string;
}

const LAYER_CHECKS: Record<Exclude<MetaSpecLayer, 'spec'>, LayerCheck> = {
  impl: { required: IMPL_REQUIRED, label: 'IMPL' },
  verify: { required: VERIFY_REQUIRED, label: 'VERIFY' },
  ops: { required: OPS_REQUIRED, label: 'OPS' },
};

function formatRule(rule: SectionRule): string {
  return `§${rule.n} ${rule.titleKeyword}`;
}

export async function runTemplateCompliance(ctx: CheckContext): Promise<Finding[]> {
  const files = await ctx.ports.spec.list();
  const findings: Finding[] = [];

  for (const f of files) {
    const fm = await ctx.ports.spec.parseFrontmatter(f.path);

    if (fm.metaSpec && fm.metaSpecLayer !== 'spec') {
      const rule = LAYER_CHECKS[fm.metaSpecLayer];
      const missing = rule.required.filter(
        (r) => !hasLayerSection(fm.headings, r)
      );
      if (missing.length > 0) {
        findings.push({
          check: 'template-compliance',
          severity: 'fail',
          files: [f.path],
          message: `Missing sections in ${rule.label} layer: ${missing.map(formatRule).join(', ')}`,
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
