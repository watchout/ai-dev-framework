import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitHistoryPort } from '../ports.js';

const exec = promisify(execFile);

async function gitFirstAddCommit(
  repoRoot: string,
  baseRef: string,
  path: string
): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'git',
      ['log', '--diff-filter=A', '--format=%H', baseRef, '--', path],
      { cwd: repoRoot }
    );
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    return lines[lines.length - 1];
  } catch {
    return null;
  }
}

async function isCommitOlderThan(
  repoRoot: string,
  commit: string,
  ref: string
): Promise<boolean> {
  try {
    const { stdout } = await exec(
      'git',
      ['merge-base', '--is-ancestor', commit, ref],
      { cwd: repoRoot }
    );
    void stdout;
    return true;
  } catch {
    return false;
  }
}

export function makeGitHistory(repoRoot: string): GitHistoryPort {
  return {
    async isPreExistingSpec(path: string, baseRef: string): Promise<boolean> {
      const firstAdd = await gitFirstAddCommit(repoRoot, baseRef, path);
      if (firstAdd === null) return false;
      return isCommitOlderThan(repoRoot, firstAdd, baseRef);
    },
  };
}
