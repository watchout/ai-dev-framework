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
