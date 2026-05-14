/**
 * PR-1b template-generator — SPEC-DOC4L-006 sub-PR (leaf, parseSsot 非依存).
 *
 * Public surface (signature literal, per instruction §1.1):
 *   export type LayerType = 'spec' | 'impl' | 'verify' | 'ops';
 *   export function loadTemplate(layer: LayerType): string;
 *   export function generateFeatureTemplates(featureName: string, outputDir: string): Promise<string[]>;
 *   export class TemplateGenerationError extends Error { ... }
 *   export class TemplateLoadError extends TemplateGenerationError { ... }
 *
 * Per §3 Forbidden: no embedded fallback templates, no LLM/HTTP/DB,
 * no CLI wiring, no `--force` flag, no filesystem port abstraction.
 */
import { readFileSync, existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LayerType = 'spec' | 'impl' | 'verify' | 'ops';

const LAYERS: readonly LayerType[] = ['spec', 'impl', 'verify', 'ops'] as const;

const FEATURE_NAME_RE = /^[A-Z][A-Z0-9]*-[0-9]{3}$/;
const FEATURE_NAME_PATTERN = '^[A-Z][A-Z0-9]*-[0-9]{3}$';

export class TemplateGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'TemplateGenerationError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class TemplateLoadError extends TemplateGenerationError {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateLoadError';
  }
}

function templatePath(layer: LayerType): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..', '..', '..');
  return join(repoRoot, 'templates', 'project', 'docs', layer, '_template.md');
}

export function loadTemplate(layer: LayerType): string {
  const path = templatePath(layer);
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    throw new TemplateLoadError(`Template not found for layer: ${layer}`);
  }
}

function applyPlaceholders(template: string, featureName: string): string {
  const lower = featureName.toLowerCase();
  return template
    .replace(/\{FEATURE\}/g, featureName)
    .replace(/\{feature-name\}/g, lower)
    .replace(/\{NNN\}/g, '001');
}

export async function generateFeatureTemplates(
  featureName: string,
  outputDir: string
): Promise<string[]> {
  if (!FEATURE_NAME_RE.test(featureName)) {
    throw new TemplateGenerationError(
      `Invalid featureName (must match ${FEATURE_NAME_PATTERN}): ${featureName}`
    );
  }

  const planned: Array<{ outPath: string; content: string }> = [];
  for (const layer of LAYERS) {
    const raw = loadTemplate(layer);
    const content = applyPlaceholders(raw, featureName);
    const layerDir = join(outputDir, layer);
    const outPath = resolve(layerDir, `${featureName}.md`);
    if (existsSync(outPath)) {
      throw new TemplateGenerationError(`Output file already exists: ${outPath}`);
    }
    planned.push({ outPath, content });
  }

  const written: string[] = [];
  for (const item of planned) {
    try {
      await mkdir(dirname(item.outPath), { recursive: true });
      await writeFile(item.outPath, item.content, 'utf-8');
      written.push(item.outPath);
    } catch (e) {
      throw new TemplateGenerationError(
        `Failed to write ${item.outPath}: ${(e as Error).message}`,
        { cause: e }
      );
    }
  }
  return written;
}
