import { describe, it, expect } from "vitest";
import { PROJECT_DIRECTORIES, DOC_PLACEHOLDERS } from "./project-structure.js";

// ─────────────────────────────────────────────
// PROJECT_DIRECTORIES
// ─────────────────────────────────────────────

describe("PROJECT_DIRECTORIES", () => {
  it("is a non-empty array", () => {
    expect(PROJECT_DIRECTORIES.length).toBeGreaterThan(0);
  });

  it("contains docs directories", () => {
    const dirs = [...PROJECT_DIRECTORIES];
    expect(dirs).toContain("docs/idea");
    expect(dirs).toContain("docs/requirements");
    expect(dirs).toContain("docs/design/core");
    expect(dirs).toContain("docs/design/features/common");
    expect(dirs).toContain("docs/design/features/project");
    expect(dirs).toContain("docs/design/adr");
    expect(dirs).toContain("docs/standards");
    expect(dirs).toContain("docs/operations");
    expect(dirs).toContain("docs/marketing");
    expect(dirs).toContain("docs/growth");
    expect(dirs).toContain("docs/management");
  });

  it("contains src directories", () => {
    const dirs = [...PROJECT_DIRECTORIES];
    expect(dirs).toContain("src/app");
    expect(dirs).toContain("src/components/ui");
    expect(dirs).toContain("src/components/features");
    expect(dirs).toContain("src/lib");
    expect(dirs).toContain("src/hooks");
    expect(dirs).toContain("src/types");
    expect(dirs).toContain("src/services");
    expect(dirs).toContain("src/__tests__");
  });

  it("contains GitHub directories", () => {
    const dirs = [...PROJECT_DIRECTORIES];
    expect(dirs).toContain(".github/workflows");
    expect(dirs).toContain(".github/ISSUE_TEMPLATE");
  });

  it("contains framework state directories", () => {
    const dirs = [...PROJECT_DIRECTORIES];
    expect(dirs).toContain(".framework/audits/ssot");
    expect(dirs).toContain(".framework/audits/code");
    expect(dirs).toContain(".framework/logs");
  });

  it("contains no duplicate entries", () => {
    const dirs = [...PROJECT_DIRECTORIES];
    const unique = new Set(dirs);
    expect(unique.size).toBe(dirs.length);
  });

  it("all paths use forward slashes (no backslashes)", () => {
    for (const dir of PROJECT_DIRECTORIES) {
      expect(dir).not.toContain("\\");
    }
  });
});

// ─────────────────────────────────────────────
// DOC_PLACEHOLDERS
// ─────────────────────────────────────────────

describe("DOC_PLACEHOLDERS", () => {
  it("is a non-empty array", () => {
    expect(DOC_PLACEHOLDERS.length).toBeGreaterThan(0);
  });

  it("each entry has path and description", () => {
    for (const doc of DOC_PLACEHOLDERS) {
      expect(doc.path).toBeDefined();
      expect(doc.path.length).toBeGreaterThan(0);
      expect(doc.description).toBeDefined();
      expect(doc.description.length).toBeGreaterThan(0);
    }
  });

  it("all paths end with .md", () => {
    for (const doc of DOC_PLACEHOLDERS) {
      expect(doc.path).toMatch(/\.md$/);
    }
  });

  it("contains no duplicate paths", () => {
    const paths = DOC_PLACEHOLDERS.map((d) => d.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  it("includes all SSOT documents", () => {
    const paths = DOC_PLACEHOLDERS.map((d) => d.path);
    expect(paths).toContain("docs/requirements/SSOT-0_PRD.md");
    expect(paths).toContain("docs/requirements/SSOT-1_FEATURE_CATALOG.md");
    expect(paths).toContain("docs/design/core/SSOT-2_UI_STATE.md");
    expect(paths).toContain("docs/design/core/SSOT-3_API_CONTRACT.md");
    expect(paths).toContain("docs/design/core/SSOT-4_DATA_MODEL.md");
    expect(paths).toContain("docs/design/core/SSOT-5_CROSS_CUTTING.md");
  });

  it("includes idea documents", () => {
    const paths = DOC_PLACEHOLDERS.map((d) => d.path);
    expect(paths).toContain("docs/idea/IDEA_CANVAS.md");
    expect(paths).toContain("docs/idea/USER_PERSONA.md");
    expect(paths).toContain("docs/idea/COMPETITOR_ANALYSIS.md");
    expect(paths).toContain("docs/idea/VALUE_PROPOSITION.md");
  });

  it("includes marketing documents", () => {
    const paths = DOC_PLACEHOLDERS.map((d) => d.path);
    expect(paths).toContain("docs/marketing/LP_SPEC.md");
    expect(paths).toContain("docs/marketing/SNS_STRATEGY.md");
    expect(paths).toContain("docs/marketing/EMAIL_SEQUENCE.md");
    expect(paths).toContain("docs/marketing/LAUNCH_PLAN.md");
    expect(paths).toContain("docs/marketing/PRICING_STRATEGY.md");
  });

  it("includes ADR template", () => {
    const paths = DOC_PLACEHOLDERS.map((d) => d.path);
    expect(paths).toContain("docs/design/adr/000_TEMPLATE.md");
  });

  it("all paths are relative (no leading /)", () => {
    for (const doc of DOC_PLACEHOLDERS) {
      expect(doc.path).not.toMatch(/^\//);
    }
  });
});
