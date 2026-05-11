import { describe, expect, it, vi } from 'vitest';
import { buildValidateCommand } from './cli.js';

describe('CLI parser e2e', () => {
  it('--check=id-uniqueness,bogus-check --link-probe=fake → exit 2 / unknown check name', async () => {
    const cmd = buildValidateCommand();
    cmd.exitOverride();

    const stderrChunks: string[] = [];
    const stdoutChunks: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((s: unknown) => {
        stderrChunks.push(typeof s === 'string' ? s : s instanceof Uint8Array ? Buffer.from(s).toString() : String(s));
        return true;
      });
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((s: unknown) => {
        stdoutChunks.push(typeof s === 'string' ? s : s instanceof Uint8Array ? Buffer.from(s).toString() : String(s));
        return true;
      });

    process.exitCode = undefined;
    try {
      await cmd.parseAsync(
        ['spec', '--check=id-uniqueness,bogus-check', '--link-probe=fake'],
        { from: 'user' }
      );
    } finally {
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }

    expect(process.exitCode).toBe(2);
    const combined = stderrChunks.join('') + stdoutChunks.join('');
    expect(combined).toContain('unknown check name: bogus-check');
    process.exitCode = 0;
  });
});
