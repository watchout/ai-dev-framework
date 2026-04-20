import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseDocument } from "./trace-engine.js";

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

## 1. 目的
content here

## 2. 非目的
more content
`);

    const doc = parseDocument(filePath);
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe("SPEC-AUTH-001");
    expect(doc!.layer).toBe("spec");
    expect(doc!.frontMatter.status).toBe("Draft");
    expect(doc!.frontMatter.traces.impl).toEqual(["IMPL-AUTH-001"]);
    expect(doc!.frontMatter.traces.verify).toEqual(["VERIFY-AUTH-001"]);
    expect(doc!.sections).toContain("1. 目的");
    expect(doc!.sections).toContain("2. 非目的");
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
