import { Command } from 'commander';
import { join } from 'node:path';
import { validateSpec } from './validate-spec.js';
import { makeFsSpecRepository } from './adapters/spec-fs.js';
import { makeGitHistory } from './adapters/git-history.js';
import { makeHttpLinkProbe, makeFakeLinkProbe } from './adapters/link-probe.js';
import { makeFileAuditLog } from './adapters/audit-log.js';
import type { ValidateSpecOptions } from './ports.js';

export function buildValidateSpecCommand(): Command {
  const cmd = new Command('spec');
  cmd
    .description('Validate spec corpus against 7 mechanical checks (SPEC-DOC4L-017)')
    .option(
      '--check <names>',
      'comma-separated check names (default: all 7)'
    )
    .option('--strict', 'promote warn to fail', false)
    .option('--bootstrap', 'demote fail to warn for pre-existing specs', false)
    .option('--base-ref <ref>', 'git base ref for pre-existing detection', 'main')
    .option('--link-probe <mode>', 'link probe mode: real|fake', 'real')
    .action(async (opts: Record<string, string | boolean>) => {
      const repoRoot = process.cwd();
      const docsDir = join(repoRoot, 'docs', 'spec');

      const rawCheck = typeof opts.check === 'string' ? opts.check : undefined;
      const validateOpts: ValidateSpecOptions = {
        check: rawCheck ? rawCheck.split(',').map((s) => s.trim()) : undefined,
        strict: opts.strict === true,
        bootstrap: opts.bootstrap === true,
        baseRef: typeof opts.baseRef === 'string' ? opts.baseRef : 'main',
        linkProbe: typeof opts.linkProbe === 'string' ? opts.linkProbe : 'real',
      };

      const linkPort =
        validateOpts.linkProbe === 'fake' ? makeFakeLinkProbe() : makeHttpLinkProbe();

      const result = await validateSpec(validateOpts, {
        spec: makeFsSpecRepository(docsDir),
        git: makeGitHistory(repoRoot),
        link: linkPort,
        audit: makeFileAuditLog(repoRoot),
      });

      for (const f of result.findings) {
        const line = `[${f.severity}] ${f.check} ${f.files.join(',')} — ${f.message}`;
        if (f.severity === 'fail') process.stderr.write(line + '\n');
        else process.stdout.write(line + '\n');
      }
      process.stdout.write(
        `\nsummary: passed=${result.passed} findings=${result.findings.length} audit=${result.audit_log_path}\n`
      );
      process.exitCode = result.exit_code;
    });
  return cmd;
}

export function buildValidateCommand(): Command {
  const cmd = new Command('validate');
  cmd.description('Validation subcommands');
  cmd.addCommand(buildValidateSpecCommand());
  return cmd;
}
