import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSsot, SsotParseError } from './ssot-parser.js';

function withSsot(content: string, body: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'ssot-parser-test-'));
  const path = join(dir, 'SSOT.md');
  writeFileSync(path, content, 'utf8');
  try {
    body(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('parseSsot', () => {
  it('T1: single feature minimal parse', () => {
    const ssot = `# My Project SSOT

## AUTH-001 ログイン機能

### 3.1 主要シナリオ

### 3.2 例外フロー
`;
    withSsot(ssot, (path) => {
      const r = parseSsot(path);
      expect(r.features).toEqual(['AUTH-001']);
      expect(r.items.get('AUTH-001')).toEqual(['3.1 主要シナリオ', '3.2 例外フロー']);
    });
  });

  it('T2: multiple features preserve order', () => {
    const ssot = `# SSOT

## AUTH-001 ログイン

### 3.1 メイン

## AUTH-002 ログアウト

### 3.1 メイン

## FEAT-013 テスト

### 4.1 API
`;
    withSsot(ssot, (path) => {
      const r = parseSsot(path);
      expect(r.features).toEqual(['AUTH-001', 'AUTH-002', 'FEAT-013']);
      expect(r.items.get('AUTH-001')).toEqual(['3.1 メイン']);
      expect(r.items.get('AUTH-002')).toEqual(['3.1 メイン']);
      expect(r.items.get('FEAT-013')).toEqual(['4.1 API']);
    });
  });

  it('T3: bracketed ID optional', () => {
    const ssot = `## [AUTH-001] ログイン\n\n### 3.1 X\n`;
    withSsot(ssot, (path) => {
      const r = parseSsot(path);
      expect(r.features).toEqual(['AUTH-001']);
      expect(r.items.has('AUTH-001')).toBe(true);
    });
  });

  it('T4: file not found → SsotParseError E1', () => {
    expect(() => parseSsot('/nonexistent/path.md')).toThrow(SsotParseError);
    try {
      parseSsot('/nonexistent/path.md');
    } catch (e) {
      expect((e as Error).message).toContain('SSOT file not found');
      expect((e as Error).message).toContain('/nonexistent/path.md');
    }
  });

  it('T5: zero H2 features → SsotParseError E2', () => {
    withSsot('# Only title\n\nNo features.\n', (path) => {
      expect(() => parseSsot(path)).toThrow(SsotParseError);
      try {
        parseSsot(path);
      } catch (e) {
        expect((e as Error).message).toContain('No feature boundaries detected');
        expect((e as Error).message).toContain('/^##');
      }
    });
  });

  it('T6: duplicate feature ID → SsotParseError E3', () => {
    const ssot = `# SSOT

## AUTH-001 ログイン

### 3.1 X

## AUTH-001 重複

### 3.1 Y
`;
    withSsot(ssot, (path) => {
      expect(() => parseSsot(path)).toThrow(SsotParseError);
      try {
        parseSsot(path);
      } catch (e) {
        expect((e as Error).message).toContain('Duplicate feature ID detected');
        expect((e as Error).message).toContain('AUTH-001');
      }
    });
  });

  it('T7: H2 without ID prefix → warn + skip', () => {
    const ssot = `# SSOT

## ログイン機能

## AUTH-001 ログイン

### 3.1 X
`;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withSsot(ssot, (path) => {
      const r = parseSsot(path);
      expect(warnSpy).toHaveBeenCalled();
      expect(r.features).toEqual(['AUTH-001']);
    });
    warnSpy.mockRestore();
  });

  it('T8: H3 boundary between H2 sections', () => {
    const ssot = `## AUTH-001 A

### 3.1 First section of A

### 3.2 Second section of A

## AUTH-002 B

### 3.1 First section of B
`;
    withSsot(ssot, (path) => {
      const r = parseSsot(path);
      expect(r.items.get('AUTH-001')).toEqual([
        '3.1 First section of A',
        '3.2 Second section of A',
      ]);
      expect(r.items.get('AUTH-002')).toEqual(['3.1 First section of B']);
    });
  });

  it('T9: H4 and below ignored', () => {
    const ssot = `## AUTH-001 X

### 3.1 Main

#### 3.1.1 Sub-sub
`;
    withSsot(ssot, (path) => {
      const r = parseSsot(path);
      expect(r.items.get('AUTH-001')).toEqual(['3.1 Main']);
    });
  });
});
