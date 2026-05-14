import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { originalReadFileSync, originalWriteFile } = vi.hoisted(() => {
  const fsActual = require('node:fs');
  const fsPromisesActual = require('node:fs/promises');
  return {
    originalReadFileSync: fsActual.readFileSync,
    originalWriteFile: fsPromisesActual.writeFile,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

import {
  loadTemplate,
  generateFeatureTemplates,
  TemplateGenerationError,
  TemplateLoadError,
} from './template-generator.js';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

afterEach(() => {
  vi.mocked(fs.readFileSync).mockImplementation(
    originalReadFileSync as typeof readFileSync
  );
  vi.mocked(fsPromises.writeFile).mockImplementation(
    originalWriteFile as typeof fsPromises.writeFile
  );
});

describe('loadTemplate', () => {
  it('loadTemplate spec returns SPEC template body', () => {
    const out = loadTemplate('spec');
    expect(out).toContain('## 1. 目的 (Goals) [必須]');
  });

  it('loadTemplate impl', () => {
    expect(loadTemplate('impl')).toContain('## 1. 配置図 [必須]');
  });

  it('loadTemplate verify', () => {
    expect(loadTemplate('verify')).toContain('## 1. 機能テスト（Gherkin） [必須]');
  });

  it('loadTemplate ops', () => {
    expect(loadTemplate('ops')).toContain('## 1. デプロイ手順 [必須]');
  });

  it('throws TemplateLoadError when template file is missing', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error(
        'ENOENT'
      ) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    expect(() => loadTemplate('spec')).toThrow(TemplateLoadError);
    expect(() => loadTemplate('spec')).toThrow(/Template not found for layer: spec/);
  });
});

describe('generateFeatureTemplates', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pr1b-'));
  });

  it('generates 4 files with placeholder substitution', async () => {
    const result = await generateFeatureTemplates('AUTH-001', tmpDir);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatch(/spec\/AUTH-001\.md$/);
    expect(result[1]).toMatch(/impl\/AUTH-001\.md$/);
    expect(result[2]).toMatch(/verify\/AUTH-001\.md$/);
    expect(result[3]).toMatch(/ops\/AUTH-001\.md$/);
    const specContent = readFileSync(result[0], 'utf-8');
    expect(specContent).toContain('SPEC-AUTH-001-001');
    expect(specContent).toContain('SPEC: auth-001');
    expect(specContent).not.toMatch(/\{FEATURE\}|\{feature-name\}|\{NNN\}/);
  });

  it.each([['auth-001'], ['AUTH-1'], ['AUTH_001'], [''], ['001-AUTH']])(
    'rejects invalid featureName: %s',
    async (input) => {
      await expect(
        generateFeatureTemplates(input, tmpDir)
      ).rejects.toThrow(TemplateGenerationError);
      await expect(
        generateFeatureTemplates(input, tmpDir)
      ).rejects.toThrow(/Invalid featureName/);
    }
  );

  it('throws on existing file and does not partial-write', async () => {
    mkdirSync(join(tmpDir, 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'spec', 'AUTH-001.md'), 'preexisting');
    await expect(
      generateFeatureTemplates('AUTH-001', tmpDir)
    ).rejects.toThrow(TemplateGenerationError);
    expect(existsSync(join(tmpDir, 'impl', 'AUTH-001.md'))).toBe(false);
    expect(existsSync(join(tmpDir, 'verify', 'AUTH-001.md'))).toBe(false);
    expect(existsSync(join(tmpDir, 'ops', 'AUTH-001.md'))).toBe(false);
  });

  it('throws TemplateGenerationError on disk write failure', async () => {
    vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(
      Object.assign(new Error('EACCES'), { code: 'EACCES' })
    );
    await expect(
      generateFeatureTemplates('AUTH-001', tmpDir)
    ).rejects.toThrow(TemplateGenerationError);
  });
});
