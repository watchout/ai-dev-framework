import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerMigrateToV12Command } from './migrate-to-v12.js';

let tmpDir: string;
let priorCwd: string;

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => undefined,
    writeErr: () => undefined,
  });
  registerMigrateToV12Command(program);
  return program;
}

function writeSsot(): void {
  mkdirSync(join(tmpDir, 'docs'), { recursive: true });
  writeFileSync(
    join(tmpDir, 'docs', 'ssot.md'),
    [
      '# SSOT',
      '',
      '## AUTH-001 Login',
      '',
      '### 3.1 Main scenario',
      '',
    ].join('\n'),
    'utf-8'
  );
}

beforeEach(() => {
  priorCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), 'migrate-to-v12-command-'));
  process.chdir(tmpDir);
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.chdir(priorCwd);
  process.exitCode = undefined;
  vi.restoreAllMocks();
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('migrate-to-v1.2 command', () => {
  it('dry-run prints planned migration without writing files', async () => {
    writeSsot();
    const program = makeProgram();

    await program.parseAsync(['node', 'framework', 'migrate-to-v1.2', '--dry-run']);

    expect(process.exitCode).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith('Discovered 1 feature(s).');
    expect(console.log).toHaveBeenCalledWith('Would generate 4 file(s).');
    expect(existsSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'))).toBe(false);
  });

  it('generates 4-layer docs from the default docs/ssot.md', async () => {
    writeSsot();
    const program = makeProgram();

    await program.parseAsync(['node', 'framework', 'migrate-to-v1.2']);

    expect(process.exitCode).toBeUndefined();
    expect(existsSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'docs', 'impl', 'AUTH-001.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'docs', 'verify', 'AUTH-001.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'docs', 'ops', 'AUTH-001.md'))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(tmpDir, '.framework', 'config.json'), 'utf-8'))
        .docs_layers.enabled
    ).toBe(true);
  });

  it('sets exitCode 2 on migration errors', async () => {
    const program = makeProgram();

    await program.parseAsync(['node', 'framework', 'migrate-to-v1.2']);

    expect(process.exitCode).toBe(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Migration failed:')
    );
  });
});
