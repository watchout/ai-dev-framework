import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseDocument,
  buildGraph,
  verifyTraceability,
  renderGraph,
} from "./trace-engine.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-engine-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeDoc(layer: string, name: string, content: string): string {
  const dir = path.join(tmpDir, "docs", layer);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeConfig(config: Record<string, unknown>): void {
  const frameworkDir = path.join(tmpDir, ".framework");
  fs.mkdirSync(frameworkDir, { recursive: true });
  fs.writeFileSync(
    path.join(frameworkDir, "config.json"),
    JSON.stringify(config),
  );
}

// ─────────────────────────────────────────────
// parseDocument tests (existing from step 1)
// ─────────────────────────────────────────────

describe("parseDocument", () => {
  it("parses valid YAML front matter + H2 sections", () => {
    const filePath = writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
  verify: [VERIFY-AUTH-001]
---

# SPEC: auth

## 1. Purpose
content here

## 2. Non-goals
more content
`);

    const doc = parseDocument(filePath);
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe("SPEC-AUTH-001");
    expect(doc!.layer).toBe("spec");
    expect(doc!.frontMatter.status).toBe("Draft");
    expect(doc!.frontMatter.traces.impl).toEqual(["IMPL-AUTH-001"]);
    expect(doc!.frontMatter.traces.verify).toEqual(["VERIFY-AUTH-001"]);
    expect(doc!.sections).toContain("1. Purpose");
    expect(doc!.sections).toContain("2. Non-goals");
  });

  it("returns null for missing file", () => {
    expect(parseDocument("/nonexistent/file.md")).toBeNull();
  });

  it("returns null for file without front matter", () => {
    const filePath = writeDoc("spec", "no-fm", "# Just a title\n\nSome content");
    expect(parseDocument(filePath)).toBeNull();
  });

  it("returns null for invalid YAML (no id)", () => {
    const filePath = writeDoc("spec", "bad-yaml", `---
status: Draft
traces: {}
---
# No ID`);
    expect(parseDocument(filePath)).toBeNull();
  });

  it("detects layer from path", () => {
    for (const layer of ["spec", "impl", "verify", "ops"] as const) {
      const filePath = writeDoc(layer, "test", `---
id: ${layer.toUpperCase()}-TEST-001
status: Draft
traces: {}
---
# Test`);
      const doc = parseDocument(filePath);
      expect(doc).not.toBeNull();
      expect(doc!.layer).toBe(layer);
    }
  });

  it("handles Frozen and Deprecated status", () => {
    const filePath = writeDoc("impl", "frozen", `---
id: IMPL-FROZEN-001
status: Frozen
traces:
  spec: [SPEC-FROZEN-001]
---
# Frozen doc`);
    const doc = parseDocument(filePath);
    expect(doc!.frontMatter.status).toBe("Frozen");
  });
});

// ─────────────────────────────────────────────
// buildGraph tests
// ─────────────────────────────────────────────

describe("buildGraph", () => {
  it("returns correct Map size for valid docs", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---
# Spec`);

    writeDoc("impl", "auth", `---
id: IMPL-AUTH-001
status: Draft
traces:
  spec: [SPEC-AUTH-001]
  verify: [VERIFY-AUTH-001]
---
# Impl`);

    writeDoc("verify", "auth", `---
id: VERIFY-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---
# Verify`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);

    expect(graph.size).toBe(3);
    expect(graph.has("SPEC-AUTH-001")).toBe(true);
    expect(graph.has("IMPL-AUTH-001")).toBe(true);
    expect(graph.has("VERIFY-AUTH-001")).toBe(true);
  });

  it("returns empty Map when enabled=false", () => {
    writeConfig({ docs_layers: { enabled: false } });

    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces: {}
---
# Spec`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);

    expect(graph.size).toBe(0);
  });

  it("returns empty Map when docs_layers is missing from config", () => {
    writeConfig({ provider: { default: "claude" } });

    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces: {}
---
# Spec`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);

    expect(graph.size).toBe(0);
  });

  it("returns empty Map when config.json does not exist", () => {
    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces: {}
---
# Spec`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);

    expect(graph.size).toBe(0);
  });

  it("scans subdirectories recursively", () => {
    writeConfig({ docs_layers: { enabled: true } });

    // Create a nested file
    const subDir = path.join(tmpDir, "docs", "spec", "sub");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, "nested.md"),
      `---
id: SPEC-NESTED-001
status: Draft
traces: {}
---
# Nested`,
    );

    writeDoc("spec", "top", `---
id: SPEC-TOP-001
status: Draft
traces: {}
---
# Top`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);

    expect(graph.size).toBe(2);
    expect(graph.has("SPEC-NESTED-001")).toBe(true);
    expect(graph.has("SPEC-TOP-001")).toBe(true);
  });
});

// ─────────────────────────────────────────────
// verifyTraceability tests
// ─────────────────────────────────────────────

describe("verifyTraceability", () => {
  it("all traced -> PASS (orphans/missing/broken empty)", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---
# Spec`);

    writeDoc("impl", "auth", `---
id: IMPL-AUTH-001
status: Draft
traces:
  spec: [SPEC-AUTH-001]
  verify: [VERIFY-AUTH-001]
---
# Impl`);

    writeDoc("verify", "auth", `---
id: VERIFY-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---
# Verify`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);
    const result = verifyTraceability(graph);

    // All nodes reference each other — no orphans, missing, or broken
    expect(result.orphans).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.broken).toHaveLength(0);
    expect(result.oversizedFeatures).toHaveLength(0);
    expect(result.totalNodes).toBe(3);
    expect(result.passCount).toBe(3);
  });

  it("missing IMPL -> missing entry", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "payment", `---
id: SPEC-PAYMENT-001
status: Draft
traces: {}
---
# Spec without impl trace`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);
    const result = verifyTraceability(graph);

    expect(result.missing.length).toBeGreaterThanOrEqual(1);
    const missingEntry = result.missing.find(
      (m) => m.from === "SPEC-PAYMENT-001",
    );
    expect(missingEntry).toBeDefined();
    expect(missingEntry!.expected).toBe("impl");
    expect(missingEntry!.expectedId).toBe("IMPL-PAYMENT-001");
  });

  it("broken reference -> broken entry", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "broken", `---
id: SPEC-BROKEN-001
status: Draft
traces:
  impl: [IMPL-NONEXISTENT-001]
---
# Spec with broken ref`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);
    const result = verifyTraceability(graph);

    expect(result.broken.length).toBeGreaterThanOrEqual(1);
    const brokenEntry = result.broken.find(
      (b) => b.from === "SPEC-BROKEN-001" && b.to === "IMPL-NONEXISTENT-001",
    );
    expect(brokenEntry).toBeDefined();
    expect(brokenEntry!.reason).toContain("not found in graph");
  });

  it("oversized feature (101 ids) -> WARNING", () => {
    // Build a graph manually with 101 ids sharing the same feature prefix
    const graph = new Map<
      string,
      {
        id: string;
        layer: "spec";
        path: string;
        frontMatter: {
          id: string;
          traces: { spec?: string[]; impl?: string[]; verify?: string[]; ops?: string[] };
          status: "Draft";
        };
        sections: string[];
      }
    >();

    for (let i = 1; i <= 101; i++) {
      const id = `SPEC-BIGFEAT-${String(i).padStart(3, "0")}`;
      graph.set(id, {
        id,
        layer: "spec" as const,
        path: `/fake/docs/spec/bigfeat-${i}.md`,
        frontMatter: {
          id,
          traces: {
            // Make them reference each other to avoid orphan noise
            impl: [`SPEC-BIGFEAT-${String((i % 101) + 1).padStart(3, "0")}`],
          },
          status: "Draft" as const,
        },
        sections: [],
      });
    }

    const result = verifyTraceability(graph);

    expect(result.oversizedFeatures.length).toBeGreaterThanOrEqual(1);
    const oversized = result.oversizedFeatures.find(
      (o) => o.feature === "BIGFEAT",
    );
    expect(oversized).toBeDefined();
    expect(oversized!.idCount).toBe(101);
  });

  it("empty graph -> all zeros", () => {
    const graph = new Map();
    const result = verifyTraceability(graph);

    expect(result.totalNodes).toBe(0);
    expect(result.passCount).toBe(0);
    expect(result.orphans).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.broken).toHaveLength(0);
    expect(result.oversizedFeatures).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// renderGraph tests
// ─────────────────────────────────────────────

describe("renderGraph", () => {
  it("contains 'graph LR'", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---
# Spec`);

    writeDoc("impl", "auth", `---
id: IMPL-AUTH-001
status: Draft
traces:
  spec: [SPEC-AUTH-001]
---
# Impl`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);
    const output = renderGraph(graph, "mermaid");

    expect(output).toContain("graph LR");
  });

  it("includes node ids and layer class assignments", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "auth", `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---
# Spec`);

    writeDoc("impl", "auth", `---
id: IMPL-AUTH-001
status: Draft
traces:
  spec: [SPEC-AUTH-001]
---
# Impl`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);
    const output = renderGraph(graph, "mermaid");

    expect(output).toContain("SPEC-AUTH-001");
    expect(output).toContain("IMPL-AUTH-001");
    expect(output).toContain(":::spec");
    expect(output).toContain(":::impl");
    expect(output).toContain("SPEC-AUTH-001 --> IMPL-AUTH-001");
    expect(output).toContain("IMPL-AUTH-001 --> SPEC-AUTH-001");
  });

  it("includes style class definitions", () => {
    writeConfig({ docs_layers: { enabled: true } });

    writeDoc("spec", "s", `---
id: SPEC-S-001
status: Draft
traces: {}
---
# S`);

    const docsDir = path.join(tmpDir, "docs");
    const graph = buildGraph(docsDir);
    const output = renderGraph(graph, "mermaid");

    expect(output).toContain("classDef spec");
    expect(output).toContain("classDef impl");
    expect(output).toContain("classDef verify");
    expect(output).toContain("classDef ops");
  });

  it("empty graph -> just header and classDefs", () => {
    const graph = new Map();
    const output = renderGraph(graph, "mermaid");

    expect(output).toContain("graph LR");
    // Should still have classDef lines but no nodes/edges
    expect(output).toContain("classDef spec");
  });
});
