import {
  ALL_CHECKS,
  type CheckName,
  type Finding,
  type LinkProbeMode,
  type Ports,
  type ValidateSpecOptions,
  type ValidateSpecResult,
} from './ports.js';
import { runIdUniqueness } from './checks/id-uniqueness.js';
import { runTemplateCompliance } from './checks/template-compliance.js';
import { runOneIdPerFile } from './checks/one-id-per-file.js';
import { runControlMechanism } from './checks/control-mechanism.js';
import { runBackwardCompat } from './checks/backward-compat.js';
import { runNotionLink } from './checks/notion-link.js';
import { runCompletionLiteral } from './checks/completion-literal.js';

interface SeverityRule {
  default: 'fail' | 'warn';
  strictBecomesFail: boolean;
  bootstrapDowngrade: boolean;
}

const SEVERITY: Record<CheckName, SeverityRule> = {
  'id-uniqueness': { default: 'fail', strictBecomesFail: false, bootstrapDowngrade: true },
  'template-compliance': { default: 'fail', strictBecomesFail: false, bootstrapDowngrade: true },
  'one-id-per-file': { default: 'fail', strictBecomesFail: false, bootstrapDowngrade: true },
  'control-mechanism': { default: 'fail', strictBecomesFail: false, bootstrapDowngrade: true },
  'backward-compat': { default: 'fail', strictBecomesFail: false, bootstrapDowngrade: true },
  'notion-link': { default: 'warn', strictBecomesFail: true, bootstrapDowngrade: false },
  'completion-literal': { default: 'warn', strictBecomesFail: true, bootstrapDowngrade: false },
};

const RUNNERS: Record<CheckName, (ctx: CheckContext) => Promise<Finding[]>> = {
  'id-uniqueness': runIdUniqueness,
  'template-compliance': runTemplateCompliance,
  'one-id-per-file': runOneIdPerFile,
  'control-mechanism': runControlMechanism,
  'backward-compat': runBackwardCompat,
  'notion-link': runNotionLink,
  'completion-literal': runCompletionLiteral,
};

export interface CheckContext {
  ports: Ports;
  baseRef: string;
  strict: boolean;
  bootstrap: boolean;
  linkProbe: LinkProbeMode;
}

function usageFailure(message: string): ValidateSpecResult {
  return {
    passed: false,
    exit_code: 2,
    findings: [{ check: 'usage', severity: 'fail', files: [], message }],
    audit_log_path: '',
  };
}

function narrowChecks(raw: string | string[] | undefined): CheckName[] | { error: string } {
  if (raw === undefined) return [...ALL_CHECKS];
  const arr = Array.isArray(raw) ? raw : [raw];
  const unknown: string[] = [];
  const ok: CheckName[] = [];
  for (const s of arr) {
    if ((ALL_CHECKS as readonly string[]).includes(s)) {
      ok.push(s as CheckName);
    } else {
      unknown.push(s);
    }
  }
  if (unknown.length > 0) {
    return { error: `unknown check name: ${unknown.join(',')}` };
  }
  return ok;
}

function narrowLinkProbe(raw: string | undefined): LinkProbeMode | { error: string } {
  if (raw === undefined) return 'real';
  if (raw === 'real' || raw === 'fake') return raw;
  return { error: `invalid --link-probe value: ${raw}` };
}

export async function validateSpec(
  opts: ValidateSpecOptions,
  ports: Ports
): Promise<ValidateSpecResult> {
  if (opts.strict && opts.bootstrap) {
    return usageFailure('--strict and --bootstrap are mutually exclusive');
  }
  const checks = narrowChecks(opts.check);
  if ('error' in checks) return usageFailure(checks.error);
  const linkProbe = narrowLinkProbe(opts.linkProbe);
  if (typeof linkProbe === 'object') return usageFailure(linkProbe.error);

  const baseRef = opts.baseRef ?? 'main';
  const ctx: CheckContext = {
    ports,
    baseRef,
    strict: opts.strict === true,
    bootstrap: opts.bootstrap === true,
    linkProbe,
  };

  let specPortFailed = false;
  try {
    await ports.spec.list();
  } catch (e) {
    specPortFailed = true;
    const message = e instanceof Error ? e.message : String(e);
    const findings: Finding[] = [
      {
        check: 'port-failure',
        severity: 'fail',
        files: [],
        message: `spec port failure: ${message}`,
      },
    ];
    return { passed: false, exit_code: 2, findings, audit_log_path: '' };
  }

  const allFindings: Finding[] = [];
  for (const name of checks) {
    const raw = await RUNNERS[name](ctx);
    for (const f of raw) {
      allFindings.push(await applySeverity(name, f, ctx));
    }
  }

  const hasFail = allFindings.some((f) => f.severity === 'fail');
  const exit_code: 0 | 2 = hasFail ? 2 : 0;

  let auditPath = '';
  try {
    auditPath = await ports.audit.append({
      ts: new Date().toISOString(),
      opts,
      result_summary: {
        passed: !hasFail,
        exit_code,
        finding_count: allFindings.length,
      },
      findings: allFindings,
    });
  } catch (e) {
    auditPath = 'unavailable';
    allFindings.push({
      check: 'port-failure',
      severity: 'warn',
      files: [],
      message: `audit port failure: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  void specPortFailed;

  return {
    passed: !hasFail,
    exit_code,
    findings: allFindings,
    audit_log_path: auditPath,
  };
}

async function applySeverity(
  check: CheckName,
  finding: Finding,
  ctx: CheckContext
): Promise<Finding> {
  const rule = SEVERITY[check];
  let severity = finding.severity;

  if (ctx.strict && rule.strictBecomesFail && severity === 'warn') {
    severity = 'fail';
  }

  if (severity === 'fail' && rule.bootstrapDowngrade) {
    const targetFiles = finding.files;
    if (targetFiles.length > 0) {
      const downgrade = await shouldDowngradeBootstrap(ctx, targetFiles);
      if (downgrade) severity = 'warn';
    }
  }
  return { ...finding, severity };
}

async function shouldDowngradeBootstrap(
  ctx: CheckContext,
  files: string[]
): Promise<boolean> {
  if (ctx.bootstrap) return true;
  if (ctx.strict) return false;
  for (const f of files) {
    try {
      if (!(await ctx.ports.git.isPreExistingSpec(f, ctx.baseRef))) return false;
    } catch {
      return false;
    }
  }
  return true;
}
