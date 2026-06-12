/**
 * ADF v1.2.0 document migration engine.
 *
 * Converts an existing v1.1 SSOT markdown file into 4-layer doc templates.
 * Pure local filesystem script: no LLM, network, DB, or GitHub calls.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseSsot } from './ssot-parser.js';
import { generateFeatureTemplates } from './template-generator.js';
import { SsotParseError } from './ssot-parser.js';
import { parseJsonOrThrow } from './fs-utils.js';

export interface V12MigrationOptions {
  ssotPath?: string;
  outputDir?: string;
  dryRun?: boolean;
  reportDate?: Date;
}

export interface V12MigrationResult {
  discoveredFeatures: string[];
  skippedFeatures: { id: string; reason: string }[];
  generatedFiles: string[];
  skippedFiles: { path: string; reason: string }[];
  configUpdated: boolean;
  reportPath?: string;
  dryRun: boolean;
}

export class V12MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'V12MigrationError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const LAYERS = ['spec', 'impl', 'verify', 'ops'] as const;
const FEATURE_NAME_RE = /^[A-Z][A-Z0-9]*-[0-9]{3}$/;

function defaultSsotPath(projectDir: string): string {
  return join(projectDir, 'docs', 'ssot.md');
}

function defaultOutputDir(projectDir: string): string {
  return join(projectDir, 'docs');
}

function plannedPaths(outputDir: string, features: string[]): string[] {
  return features.flatMap((feature) =>
    LAYERS.map((layer) => resolve(outputDir, layer, `${feature}.md`))
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function discoverFeatureCandidates(content: string): string[] {
  const candidates: string[] = [];
  const headingRe = /^#{2,3}\s+(?:\d+(?:\.\d+)*\s+)?(?:\[?([A-Z][A-Z0-9]*-\d{3}(?:-\d{3})?)\]?)(?=\b|:|\s)/gm;
  const tableRe = /^\|\s*([A-Z][A-Z0-9]*-\d{3}(?:-\d{3})?)\s*\|/gm;

  for (const match of content.matchAll(headingRe)) {
    candidates.push(match[1]);
  }
  for (const match of content.matchAll(tableRe)) {
    candidates.push(match[1]);
  }
  return unique(candidates);
}

function parseOrDiscoverFeatures(ssotPath: string): {
  features: string[];
  skippedFeatures: { id: string; reason: string }[];
  items: Map<string, string[]>;
} {
  try {
    const parsed = parseSsot(ssotPath);
    return { ...parsed, skippedFeatures: [] };
  } catch (e) {
    if (
      !(e instanceof SsotParseError) ||
      !e.message.includes('No feature boundaries detected')
    ) {
      throw e;
    }
  }

  const content = readFileSync(ssotPath, 'utf-8');
  const candidates = discoverFeatureCandidates(content);
  const features = candidates.filter((id) => FEATURE_NAME_RE.test(id));
  const skippedFeatures = candidates
    .filter((id) => !FEATURE_NAME_RE.test(id))
    .map((id) => ({
      id,
      reason: 'feature ID does not match ^[A-Z][A-Z0-9]*-[0-9]{3}$',
    }));

  if (features.length === 0) {
    throw new V12MigrationError(
      `No migratable features detected in SSOT: ${ssotPath}`
    );
  }

  return { features, skippedFeatures, items: new Map() };
}

function findExisting(paths: string[]): { path: string; reason: string }[] {
  return paths
    .filter((p) => existsSync(p))
    .map((p) => ({ path: p, reason: 'output file already exists' }));
}

function appendMigratedSsotIndex(
  specPath: string,
  feature: string,
  items: Map<string, string[]>
): void {
  const h3Items = items.get(feature) ?? [];
  if (h3Items.length === 0) return;

  const content = readFileSync(specPath, 'utf-8');
  const migrated = [
    '',
    '## 10. v1.1 SSOT から移行された項目',
    '',
    ...h3Items.map((item) => `- ${item}`),
    '',
  ].join('\n');
  writeFileSync(specPath, `${content.trimEnd()}\n${migrated}`, 'utf-8');
}

function readConfig(configPath: string): { existed: boolean; content: string | null } {
  if (!existsSync(configPath)) return { existed: false, content: null };
  return { existed: true, content: readFileSync(configPath, 'utf-8') };
}

function writeDocsLayersEnabled(configPath: string): void {
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    config = parseJsonOrThrow<Record<string, unknown>>(configPath);
  }
  config.docs_layers = {
    ...((config.docs_layers as Record<string, unknown> | undefined) ?? {}),
    enabled: true,
  };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

function restoreConfig(configPath: string, prior: { existed: boolean; content: string | null }): void {
  if (prior.existed && prior.content !== null) {
    writeFileSync(configPath, prior.content, 'utf-8');
    return;
  }
  if (existsSync(configPath)) {
    rmSync(configPath, { force: true });
  }
}

function removeGenerated(paths: string[]): void {
  for (const p of paths) {
    rmSync(p, { force: true });
  }
}

function reportName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `migration-${y}${m}${d}.md`;
}

function writeMigrationReport(
  projectDir: string,
  result: Omit<V12MigrationResult, 'reportPath'>,
  date: Date
): string {
  const reportsDir = join(projectDir, '.framework', 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, reportName(date));
  const lines = [
    '# ADF v1.2.0 Migration Report',
    '',
    `- Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `- Discovered features: ${result.discoveredFeatures.length}`,
    `- Skipped features: ${result.skippedFeatures.length}`,
    `- Generated files: ${result.generatedFiles.length}`,
    `- Skipped files: ${result.skippedFiles.length}`,
    `- Config updated: ${result.configUpdated ? 'yes' : 'no'}`,
    '',
    '## Features',
    '',
    ...result.discoveredFeatures.map((feature) => `- ${feature}`),
    '',
    '## Generated Files',
    '',
    ...result.generatedFiles.map((file) => `- ${file}`),
    '',
    '## Skipped Features',
    '',
    ...(result.skippedFeatures.length === 0
      ? ['- none']
      : result.skippedFeatures.map((s) => `- ${s.id}: ${s.reason}`)),
    '',
    '## Skipped Files',
    '',
    ...(result.skippedFiles.length === 0
      ? ['- none']
      : result.skippedFiles.map((s) => `- ${s.path}: ${s.reason}`)),
    '',
  ];
  writeFileSync(reportPath, lines.join('\n'), 'utf-8');
  return reportPath;
}

export async function migrateToV12(
  projectDir: string,
  options: V12MigrationOptions = {}
): Promise<V12MigrationResult> {
  const ssotPath = options.ssotPath ?? defaultSsotPath(projectDir);
  const outputDir = options.outputDir ?? defaultOutputDir(projectDir);
  const dryRun = options.dryRun ?? false;
  const parsed = parseOrDiscoverFeatures(ssotPath);
  const planned = plannedPaths(outputDir, parsed.features);
  const skippedFiles = findExisting(planned);

  if (dryRun) {
    return {
      discoveredFeatures: parsed.features,
      skippedFeatures: parsed.skippedFeatures,
      generatedFiles: planned,
      skippedFiles,
      configUpdated: false,
      dryRun: true,
    };
  }

  if (skippedFiles.length > 0) {
    throw new V12MigrationError(
      `Migration conflict: ${skippedFiles.length} output file(s) already exist`
    );
  }

  const generatedFiles: string[] = [];
  const configPath = join(projectDir, '.framework', 'config.json');
  const priorConfig = readConfig(configPath);
  try {
    for (const feature of parsed.features) {
      const generated = await generateFeatureTemplates(feature, outputDir);
      generatedFiles.push(...generated);
      appendMigratedSsotIndex(resolve(outputDir, 'spec', `${feature}.md`), feature, parsed.items);
    }

    writeDocsLayersEnabled(configPath);

    const resultWithoutReport = {
      discoveredFeatures: parsed.features,
      skippedFeatures: parsed.skippedFeatures,
      generatedFiles,
      skippedFiles: [],
      configUpdated: true,
      dryRun: false,
    };
    const reportPath = writeMigrationReport(
      projectDir,
      resultWithoutReport,
      options.reportDate ?? new Date()
    );
    return { ...resultWithoutReport, reportPath };
  } catch (e) {
    removeGenerated(planned);
    restoreConfig(configPath, priorConfig);
    throw new V12MigrationError(
      `Failed to migrate project to v1.2.0: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e }
    );
  }
}
