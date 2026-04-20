/**
 * Template generator — 4-layer document template generation.
 *
 * Part of ADF v1.2.0 (#92, SPEC-DOC4L-002).
 * Spec: IMPL §3.1, §4.3, 付録 A.
 *
 * Principle #0: Pure script — template expansion only, no LLM calls.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { LayerType } from "./trace-engine.js";

// ─────────────────────────────────────────────
// Template loading (IMPL §4.3: fallback to CLI-bundled defaults)
// ─────────────────────────────────────────────

const TEMPLATE_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../../../templates/project/docs",
);

export function loadTemplate(layer: LayerType): string {
  const templatePath = path.join(TEMPLATE_DIR, layer, "_template.md");
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, "utf-8");
  }
  // Fallback: minimal default (IMPL §4.3)
  return `---
id: ${layer.toUpperCase()}-{FEATURE}-{NNN}
status: Draft
traces: {}
---

# ${layer.toUpperCase()}: {feature-name}

## 0. メタ
`;
}

// ─────────────────────────────────────────────
// Template expansion
// ─────────────────────────────────────────────

function expandTemplate(
  template: string,
  featureName: string,
  layer: LayerType,
): string {
  const featureUpper = featureName.toUpperCase();
  return template
    .replace(/\{FEATURE\}/g, featureUpper)
    .replace(/\{feature-name\}/g, featureName)
    .replace(/\{NNN\}/g, "001");
}

// ─────────────────────────────────────────────
// Feature template generation (IMPL §3.1)
// ─────────────────────────────────────────────

const LAYERS: LayerType[] = ["spec", "impl", "verify", "ops"];

export async function generateFeatureTemplates(
  featureName: string,
  outputDir: string,
): Promise<string[]> {
  const generated: string[] = [];

  for (const layer of LAYERS) {
    const template = loadTemplate(layer);
    const content = expandTemplate(template, featureName, layer);
    const layerDir = path.join(outputDir, layer);

    if (!fs.existsSync(layerDir)) {
      fs.mkdirSync(layerDir, { recursive: true });
    }

    const filePath = path.join(layerDir, `${featureName}.md`);
    fs.writeFileSync(filePath, content, "utf-8");
    generated.push(filePath);
  }

  return generated;
}
