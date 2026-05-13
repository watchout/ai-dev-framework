/**
 * SPEC-DOC4L-006 prerequisite — SSOT.md parser (pure script).
 *
 * Public surface (signature literal, per instruction §1.1):
 *   export function parseSsot(ssotPath: string): { features: string[]; items: Map<string, string[]> };
 *   export class SsotParseError extends Error { constructor(message: string); }
 */
import { existsSync, readFileSync } from 'node:fs';

export class SsotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsotParseError';
  }
}

const FEATURE_ID_PATTERN =
  '/^##\\s+(\\[[A-Z][\\w-]*-?\\d+\\]|[A-Z][\\w-]*-?\\d+)\\b/gm';

interface H2Match {
  rawId: string;
  startLine: number;
}

function stripBrackets(s: string): string {
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1);
  return s;
}

function findFeatureBoundaries(lines: string[]): H2Match[] {
  const matches: H2Match[] = [];
  const bracketed = /^##\s+(\[[A-Z][\w-]*-?\d+\])(?:\s|$)/;
  const bare = /^##\s+([A-Z][\w-]*-?\d+)\b/;
  for (let i = 0; i < lines.length; i++) {
    const mb = lines[i].match(bracketed);
    if (mb) {
      matches.push({ rawId: stripBrackets(mb[1]), startLine: i });
      continue;
    }
    const mp = lines[i].match(bare);
    if (mp) matches.push({ rawId: mp[1], startLine: i });
  }
  return matches;
}

function extractH3Titles(lines: string[], start: number, endExclusive: number): string[] {
  const out: string[] = [];
  const re = /^###\s+(.+?)\s*$/;
  for (let i = start; i < endExclusive; i++) {
    const m = lines[i].match(re);
    if (m) out.push(m[1]);
  }
  return out;
}

export function parseSsot(ssotPath: string): {
  features: string[];
  items: Map<string, string[]>;
} {
  if (!existsSync(ssotPath)) {
    throw new SsotParseError(`SSOT file not found: ${ssotPath}`);
  }
  const content = readFileSync(ssotPath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i].match(/^##\s+(.+?)\s*$/);
    if (!h2) continue;
    const hasId =
      /^\[[A-Z][\w-]*-?\d+\](?:\s|$)/.test(h2[1]) ||
      /^[A-Z][\w-]*-?\d+\b/.test(h2[1]);
    if (!hasId) {
      console.warn(
        `SSOT parse warning: skipping H2 without feature ID prefix at line ${i + 1}: "${h2[1]}"`
      );
    }
  }

  const boundaries = findFeatureBoundaries(lines);
  if (boundaries.length === 0) {
    throw new SsotParseError(
      `No feature boundaries detected in SSOT (regex: ${FEATURE_ID_PATTERN})`
    );
  }

  const seen = new Set<string>();
  for (const b of boundaries) {
    if (seen.has(b.rawId)) {
      throw new SsotParseError(
        `Duplicate feature ID detected: ${b.rawId}`
      );
    }
    seen.add(b.rawId);
  }

  const features: string[] = boundaries.map((b) => b.rawId);
  const items = new Map<string, string[]>();
  for (let idx = 0; idx < boundaries.length; idx++) {
    const cur = boundaries[idx];
    const nextStart =
      idx + 1 < boundaries.length ? boundaries[idx + 1].startLine : lines.length;
    items.set(cur.rawId, extractH3Titles(lines, cur.startLine + 1, nextStart));
  }
  return { features, items };
}
