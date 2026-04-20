/**
 * Trace engine — 4-layer document system type definitions + parser.
 *
 * Part of ADF v1.2.0 (#92, SPEC-DOC4L-001〜007).
 * Spec: IMPL §2.1 (types), IMPL §3 (sequences).
 *
 * Principle #0: All parsing is deterministic (regex + YAML).
 * No LLM calls in this module.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types (IMPL §2.1)
// ─────────────────────────────────────────────

export type LayerType = "spec" | "impl" | "verify" | "ops";

export interface FrontMatter {
  id: string;
  traces: {
    spec?: string[];
    impl?: string[];
    verify?: string[];
    ops?: string[];
  };
  status: "Draft" | "Frozen" | "Deprecated";
}

export interface DocumentNode {
  id: string;
  layer: LayerType;
  path: string;
  frontMatter: FrontMatter;
  sections: string[];
}

export interface TraceResult {
  orphans: DocumentNode[];
  missing: { from: string; expected: LayerType; expectedId: string }[];
  broken: { from: string; to: string; reason: string }[];
  oversizedFeatures: { feature: string; idCount: number }[];
  totalNodes: number;
  passCount: number;
}

export interface GateSpecResult {
  status: "PASS" | "BLOCK";
  critical: {
    docId: string;
    type:
      | "MissingAcceptanceCriteria"
      | "STRIDE_NA_WithoutReason"
      | "MissingRequiredSection";
    message: string;
  }[];
  warnings: { docId: string; type: string; message: string }[];
}

export interface MigrationResult {
  discoveredFeatures: string[];
  generatedFiles: string[];
  skippedFiles: { path: string; reason: string }[];
  configUpdated: boolean;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FRONT_MATTER_REGEX = /^---\n([\s\S]*?)\n---/;
const H2_REGEX = /^## .+$/gm;
const FRONT_MATTER_MAX_SIZE = 1_000_000; // 1MB (IMPL §8)
const PARSE_TIMEOUT_MS = 5_000; // 5s (IMPL §8)

const LAYERS: LayerType[] = ["spec", "impl", "verify", "ops"];

// ─────────────────────────────────────────────
// YAML Front Matter parser (minimal, no js-yaml dependency)
// Uses SAFE parsing — no code execution, no custom tags.
// ─────────────────────────────────────────────

function parseYamlFrontMatter(yaml: string): FrontMatter | null {
  try {
    // Extract id
    const idMatch = yaml.match(/^id:\s*(.+)$/m);
    if (!idMatch) return null;
    const id = idMatch[1].trim().replace(/^["']|["']$/g, "");

    // Extract status
    const statusMatch = yaml.match(/^status:\s*(.+)$/m);
    const statusRaw = statusMatch
      ? statusMatch[1].trim().replace(/^["']|["']$/g, "")
      : "Draft";
    const status = (["Draft", "Frozen", "Deprecated"].includes(statusRaw)
      ? statusRaw
      : "Draft") as FrontMatter["status"];

    // Extract traces
    const traces: FrontMatter["traces"] = {};
    for (const layer of LAYERS) {
      const traceRegex = new RegExp(
        `^\\s*${layer}:\\s*\\[([^\\]]*)]`,
        "m",
      );
      const match = traceRegex.exec(yaml);
      if (match) {
        const items = match[1]
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        if (items.length > 0) {
          traces[layer] = items;
        }
      }
    }

    return { id, traces, status };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Document parser (IMPL §2.2)
// ─────────────────────────────────────────────

function detectLayer(filePath: string): LayerType | null {
  const normalized = filePath.replace(/\\/g, "/");
  for (const layer of LAYERS) {
    if (
      normalized.includes(`/docs/${layer}/`) ||
      normalized.includes(`docs/${layer}/`)
    ) {
      return layer;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Config reader (for docs_layers.enabled check)
// ─────────────────────────────────────────────

interface DocsLayersConfig {
  enabled: boolean;
  strict?: boolean;
}

function readDocsLayersConfig(projectDir: string): DocsLayersConfig | null {
  const configPath = path.join(projectDir, ".framework", "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (raw.docs_layers && typeof raw.docs_layers.enabled === "boolean") {
      return {
        enabled: raw.docs_layers.enabled,
        strict: raw.docs_layers.strict,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// File scanner
// ─────────────────────────────────────────────

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(fullPath));
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // permission/read errors — skip
  }
  return results;
}

// ─────────────────────────────────────────────
// buildGraph (IMPL §3 — step 2-1)
// ─────────────────────────────────────────────

export function buildGraph(docsDir: string): Map<string, DocumentNode> {
  const graph = new Map<string, DocumentNode>();

  // Check .framework/config.json for docs_layers.enabled
  const projectDir = path.resolve(docsDir, "..");
  const config = readDocsLayersConfig(projectDir);
  if (!config || !config.enabled) {
    return graph; // empty Map when disabled/missing
  }

  for (const layer of LAYERS) {
    const layerDir = path.join(docsDir, layer);
    const mdFiles = collectMdFiles(layerDir);
    for (const filePath of mdFiles) {
      const node = parseDocument(filePath);
      if (node) {
        graph.set(node.id, node);
      }
    }
  }

  return graph;
}

// ─────────────────────────────────────────────
// verifyTraceability (IMPL §3 — step 2-1)
// ─────────────────────────────────────────────

export function verifyTraceability(
  graph: Map<string, DocumentNode>,
): TraceResult {
  const allIds = new Set(graph.keys());
  const referenced = new Set<string>();
  const orphans: DocumentNode[] = [];
  const missing: TraceResult["missing"] = [];
  const broken: TraceResult["broken"] = [];
  const oversizedFeatures: TraceResult["oversizedFeatures"] = [];

  // 1. Collect all referenced ids & detect broken references
  for (const [_id, node] of graph) {
    const traces = node.frontMatter.traces;
    for (const layer of LAYERS) {
      const refs = traces[layer];
      if (!refs) continue;
      for (const ref of refs) {
        referenced.add(ref);
        if (!allIds.has(ref)) {
          broken.push({
            from: node.id,
            to: ref,
            reason: `Referenced id "${ref}" not found in graph`,
          });
        }
      }
    }
  }

  // 2. Detect orphans: nodes not referenced by any other node
  for (const [id, node] of graph) {
    if (!referenced.has(id)) {
      orphans.push(node);
    }
  }

  // 3. Detect missing: SPEC id with no corresponding IMPL (via traces.impl)
  for (const [_id, node] of graph) {
    if (node.layer === "spec") {
      const implRefs = node.frontMatter.traces.impl;
      if (!implRefs || implRefs.length === 0) {
        missing.push({
          from: node.id,
          expected: "impl",
          expectedId: node.id.replace(/^SPEC-/, "IMPL-"),
        });
      }
    }
  }

  // 4. Detect oversized features: >100 ids sharing a feature prefix
  const featureCounts = new Map<string, number>();
  for (const id of allIds) {
    // Extract feature name: e.g. "SPEC-AUTH-001" → "AUTH"
    const parts = id.split("-");
    if (parts.length >= 3) {
      const feature = parts.slice(1, -1).join("-");
      featureCounts.set(feature, (featureCounts.get(feature) ?? 0) + 1);
    }
  }
  for (const [feature, count] of featureCounts) {
    if (count > 100) {
      oversizedFeatures.push({ feature, idCount: count });
    }
  }

  // 5. Calculate pass count (nodes with no issues)
  const problemIds = new Set<string>();
  for (const o of orphans) problemIds.add(o.id);
  for (const m of missing) problemIds.add(m.from);
  for (const b of broken) problemIds.add(b.from);

  return {
    orphans,
    missing,
    broken,
    oversizedFeatures,
    totalNodes: graph.size,
    passCount: graph.size - problemIds.size,
  };
}

// ─────────────────────────────────────────────
// renderGraph (IMPL §3 — step 2-1)
// ─────────────────────────────────────────────

const LAYER_COLORS: Record<LayerType, string> = {
  spec: "#4A90D9",
  impl: "#7B68EE",
  verify: "#50C878",
  ops: "#FF8C00",
};

export function renderGraph(
  graph: Map<string, DocumentNode>,
  _format: "mermaid",
): string {
  const lines: string[] = ["graph LR"];

  // Add style classes
  lines.push("  classDef spec fill:#4A90D9,stroke:#333,color:#fff");
  lines.push("  classDef impl fill:#7B68EE,stroke:#333,color:#fff");
  lines.push("  classDef verify fill:#50C878,stroke:#333,color:#fff");
  lines.push("  classDef ops fill:#FF8C00,stroke:#333,color:#fff");

  // Add nodes with class assignments
  for (const [id, node] of graph) {
    lines.push(`  ${id}[${id}]:::${node.layer}`);
  }

  // Add edges from traces
  for (const [_id, node] of graph) {
    const traces = node.frontMatter.traces;
    for (const layer of LAYERS) {
      const refs = traces[layer];
      if (!refs) continue;
      for (const ref of refs) {
        lines.push(`  ${node.id} --> ${ref}`);
      }
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Document parser (IMPL §2.2)
// ─────────────────────────────────────────────

export function parseDocument(filePath: string): DocumentNode | null {
  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);
  if (stat.size > FRONT_MATTER_MAX_SIZE) return null;

  let content: string;
  try {
    // Timeout protection (IMPL §8)
    const start = Date.now();
    content = fs.readFileSync(filePath, "utf-8");
    if (Date.now() - start > PARSE_TIMEOUT_MS) return null;
  } catch {
    return null;
  }

  // Extract YAML front matter
  const fmMatch = FRONT_MATTER_REGEX.exec(content);
  if (!fmMatch) return null;

  const frontMatter = parseYamlFrontMatter(fmMatch[1]);
  if (!frontMatter) return null;

  // Extract H2 sections
  const sections: string[] = [];
  let match: RegExpExecArray | null;
  const h2Regex = new RegExp(H2_REGEX.source, "gm");
  while ((match = h2Regex.exec(content)) !== null) {
    sections.push(match[0].replace(/^## /, "").trim());
  }

  // Detect layer from path
  const layer = detectLayer(filePath);
  if (!layer) return null;

  return {
    id: frontMatter.id,
    layer,
    path: filePath,
    frontMatter,
    sections,
  };
}
