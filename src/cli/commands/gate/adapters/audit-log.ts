import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AuditLogPort } from '../ports.js';

export function makeFileAuditLog(repoRoot: string): AuditLogPort {
  return {
    async append(entry: object): Promise<string> {
      const date = new Date().toISOString().slice(0, 10);
      const path = join(repoRoot, '.framework', 'audit', `spec-audit-${date}.jsonl`);
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, JSON.stringify(entry) + '\n', 'utf8');
      return path;
    },
  };
}
