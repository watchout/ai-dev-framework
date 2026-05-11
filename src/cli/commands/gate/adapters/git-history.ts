import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitHistoryPort } from '../ports.js';

const exec = promisify(execFile);

export function makeGitHistory(repoRoot: string): GitHistoryPort {
  return {
    async isPreExistingSpec(path: string, baseRef: string): Promise<boolean> {
      try {
        const { stdout } = await exec(
          'git',
          ['log', '--oneline', '-n', '1', baseRef, '--', path],
          { cwd: repoRoot }
        );
        return stdout.trim().length > 0;
      } catch {
        return false;
      }
    },
  };
}
