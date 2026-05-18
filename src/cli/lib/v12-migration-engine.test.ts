import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { migrateToV12, V12MigrationError } from './v12-migration-engine.js';

let tmpDir: string;

function writeSsot(content: string): string {
  const docsDir = join(tmpDir, 'docs');
  mkdirSync(docsDir, { recursive: true });
  const ssotPath = join(docsDir, 'ssot.md');
  writeFileSync(ssotPath, content, 'utf-8');
  return ssotPath;
}

function sampleSsot(): string {
  return [
    '# Project SSOT',
    '',
    '## AUTH-001 Login',
    '',
    '### 3.1 Main scenario',
    '',
    '### 4.1 API contract',
    '',
    '## BILL-002 Billing',
    '',
    '### 3.1 Payment scenario',
    '',
  ].join('\n');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'v12-migration-'));
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('migrateToV12', () => {
  it('dry-run reports planned files without writing docs or config', async () => {
    writeSsot(sampleSsot());

    const result = await migrateToV12(tmpDir, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.discoveredFeatures).toEqual(['AUTH-001', 'BILL-002']);
    expect(result.generatedFiles).toHaveLength(8);
    expect(result.skippedFiles).toHaveLength(0);
    expect(result.configUpdated).toBe(false);
    expect(existsSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'))).toBe(false);
    expect(existsSync(join(tmpDir, '.framework', 'config.json'))).toBe(false);
  });

  it('generates 4-layer docs, enables docs_layers, and writes a report', async () => {
    writeSsot(sampleSsot());

    const result = await migrateToV12(tmpDir, {
      reportDate: new Date('2026-05-19T00:00:00Z'),
    });

    expect(result.dryRun).toBe(false);
    expect(result.discoveredFeatures).toEqual(['AUTH-001', 'BILL-002']);
    expect(result.generatedFiles).toHaveLength(8);
    expect(result.configUpdated).toBe(true);
    expect(result.reportPath).toBe(join(tmpDir, '.framework', 'reports', 'migration-20260519.md'));

    for (const feature of ['AUTH-001', 'BILL-002']) {
      for (const layer of ['spec', 'impl', 'verify', 'ops']) {
        expect(existsSync(join(tmpDir, 'docs', layer, `${feature}.md`))).toBe(true);
      }
    }

    const config = JSON.parse(
      readFileSync(join(tmpDir, '.framework', 'config.json'), 'utf-8')
    ) as { docs_layers?: { enabled?: boolean } };
    expect(config.docs_layers?.enabled).toBe(true);

    const spec = readFileSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'), 'utf-8');
    expect(spec).toContain('SPEC-AUTH-001-001');
    expect(spec).toContain('## 10. v1.1 SSOT から移行された項目');
    expect(spec).toContain('- 3.1 Main scenario');
    expect(spec).toContain('- 4.1 API contract');

    const report = readFileSync(result.reportPath!, 'utf-8');
    expect(report).toContain('Discovered features: 2');
    expect(report).toContain('Generated files: 8');
    expect(report).toContain('AUTH-001');
  });

  it('dry-run reports existing output conflicts as skipped files', async () => {
    writeSsot(sampleSsot());
    mkdirSync(join(tmpDir, 'docs', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'), 'existing', 'utf-8');

    const result = await migrateToV12(tmpDir, { dryRun: true });

    expect(result.skippedFiles).toEqual([
      {
        path: join(tmpDir, 'docs', 'spec', 'AUTH-001.md'),
        reason: 'output file already exists',
      },
    ]);
    expect(readFileSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'), 'utf-8')).toBe('existing');
  });

  it('throws before writing when output files already exist', async () => {
    writeSsot(sampleSsot());
    mkdirSync(join(tmpDir, 'docs', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'), 'existing', 'utf-8');

    await expect(migrateToV12(tmpDir)).rejects.toThrow(V12MigrationError);

    expect(readFileSync(join(tmpDir, 'docs', 'spec', 'AUTH-001.md'), 'utf-8')).toBe('existing');
    expect(existsSync(join(tmpDir, 'docs', 'impl', 'AUTH-001.md'))).toBe(false);
    expect(existsSync(join(tmpDir, '.framework', 'config.json'))).toBe(false);
  });

  it('preserves existing config values while enabling docs_layers', async () => {
    writeSsot(sampleSsot());
    mkdirSync(join(tmpDir, '.framework'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.framework', 'config.json'),
      JSON.stringify({ provider: { default: 'codex' } }, null, 2),
      'utf-8'
    );

    await migrateToV12(tmpDir);

    const config = JSON.parse(
      readFileSync(join(tmpDir, '.framework', 'config.json'), 'utf-8')
    ) as { provider?: { default?: string }; docs_layers?: { enabled?: boolean } };
    expect(config.provider?.default).toBe('codex');
    expect(config.docs_layers?.enabled).toBe(true);
  });
});
