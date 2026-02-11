import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectTechFromPackageJson,
  detectTechFromFiles,
  analyzeDirectory,
  countFiles,
  findExistingDocs,
  identifyGaps,
  calculateReadiness,
  saveRetrofitReport,
  loadRetrofitReport,
  generateSSOTStub,
  generateRetrofitMarkdown,
  EXPECTED_SSOT_DOCS,
  type RetrofitReport,
  type DirectoryAnalysis,
  type DetectedTech,
  type SSOTGap,
} from "./retrofit-model.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "retrofit-model-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// detectTechFromPackageJson
// ─────────────────────────────────────────────

describe("detectTechFromPackageJson", () => {
  it("detects Next.js from dependencies", () => {
    const pkg = { dependencies: { next: "^15.0.0", react: "^19.0.0" } };
    const result = detectTechFromPackageJson(pkg);
    expect(result.some((t) => t.name === "Next.js")).toBe(true);
    expect(result.some((t) => t.name === "React")).toBe(true);
  });

  it("detects devDependencies", () => {
    const pkg = { devDependencies: { typescript: "^5.7.0", vitest: "^2.0.0" } };
    const result = detectTechFromPackageJson(pkg);
    expect(result.some((t) => t.name === "TypeScript")).toBe(true);
    expect(result.some((t) => t.name === "Vitest")).toBe(true);
  });

  it("detects Supabase", () => {
    const pkg = { dependencies: { "@supabase/supabase-js": "^2.0.0" } };
    const result = detectTechFromPackageJson(pkg);
    expect(result.some((t) => t.name === "Supabase")).toBe(true);
  });

  it("returns empty array for empty package.json", () => {
    const pkg = {};
    const result = detectTechFromPackageJson(pkg);
    expect(result).toEqual([]);
  });

  it("includes version and source", () => {
    const pkg = { dependencies: { next: "^15.0.0" } };
    const result = detectTechFromPackageJson(pkg);
    const nextjs = result.find((t) => t.name === "Next.js");
    expect(nextjs?.version).toBe("^15.0.0");
    expect(nextjs?.source).toBe("package.json (next)");
  });

  it("detects Tailwind CSS", () => {
    const pkg = { devDependencies: { tailwindcss: "^4.0.0" } };
    const result = detectTechFromPackageJson(pkg);
    expect(result.some((t) => t.name === "Tailwind CSS")).toBe(true);
  });
});

// ─────────────────────────────────────────────
// detectTechFromFiles
// ─────────────────────────────────────────────

describe("detectTechFromFiles", () => {
  it("detects TypeScript from tsconfig.json", () => {
    const files = ["tsconfig.json", "package.json", "README.md"];
    const result = detectTechFromFiles(files);
    expect(result.some((t) => t.name === "TypeScript")).toBe(true);
  });

  it("detects Vercel from vercel.json", () => {
    const files = ["vercel.json"];
    const result = detectTechFromFiles(files);
    expect(result.some((t) => t.name === "Vercel")).toBe(true);
  });

  it("returns empty for no matching files", () => {
    const files = ["README.md", "LICENSE"];
    const result = detectTechFromFiles(files);
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// analyzeDirectory
// ─────────────────────────────────────────────

describe("analyzeDirectory", () => {
  it("detects standard directories", () => {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "tests"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "public"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Claude");

    const result = analyzeDirectory(tmpDir);
    expect(result.hasSrc).toBe(true);
    expect(result.hasDocs).toBe(true);
    expect(result.hasTests).toBe(true);
    expect(result.hasPublic).toBe(true);
    expect(result.hasPackageJson).toBe(true);
    expect(result.hasClaudeMd).toBe(true);
  });

  it("detects missing directories", () => {
    const result = analyzeDirectory(tmpDir);
    expect(result.hasSrc).toBe(false);
    expect(result.hasDocs).toBe(false);
    expect(result.hasTests).toBe(false);
    expect(result.hasPackageJson).toBe(false);
    expect(result.hasClaudeMd).toBe(false);
  });

  it("lists src subdirectories", () => {
    fs.mkdirSync(path.join(tmpDir, "src/app"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src/components"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src/lib"), { recursive: true });

    const result = analyzeDirectory(tmpDir);
    expect(result.srcSubdirs).toContain("app");
    expect(result.srcSubdirs).toContain("components");
    expect(result.srcSubdirs).toContain("lib");
  });

  it("detects .framework directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    const result = analyzeDirectory(tmpDir);
    expect(result.hasFramework).toBe(true);
  });

  it("excludes node_modules from topLevelDirs", () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    const result = analyzeDirectory(tmpDir);
    expect(result.topLevelDirs).not.toContain("node_modules");
    expect(result.topLevelDirs).toContain("src");
  });
});

// ─────────────────────────────────────────────
// countFiles
// ─────────────────────────────────────────────

describe("countFiles", () => {
  it("counts files by extension", () => {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src/app.ts"), "const x = 1;\nconst y = 2;");
    fs.writeFileSync(path.join(tmpDir, "src/page.tsx"), "export default function() {}");
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Title");

    const result = countFiles(tmpDir, [".ts", ".tsx", ".md"]);
    expect(result.totalFiles).toBe(3);
    expect(result.byExtension[".ts"]).toBe(1);
    expect(result.byExtension[".tsx"]).toBe(1);
    expect(result.byExtension[".md"]).toBe(1);
  });

  it("counts total lines", () => {
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "line1\nline2\nline3");
    const result = countFiles(tmpDir, [".ts"]);
    expect(result.totalLines).toBe(3);
  });

  it("skips node_modules", () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules/pkg"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "node_modules/pkg/index.js"), "code");
    fs.writeFileSync(path.join(tmpDir, "app.ts"), "code");

    const result = countFiles(tmpDir, [".ts", ".js"]);
    expect(result.totalFiles).toBe(1);
  });
});

// ─────────────────────────────────────────────
// findExistingDocs
// ─────────────────────────────────────────────

describe("findExistingDocs", () => {
  it("finds markdown files in docs/", () => {
    fs.mkdirSync(path.join(tmpDir, "docs/design"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "docs/README.md"), "# Docs");
    fs.writeFileSync(path.join(tmpDir, "docs/design/API.md"), "# API");

    const result = findExistingDocs(tmpDir);
    expect(result.length).toBe(2);
    expect(result.some((d) => d.name === "README.md")).toBe(true);
    expect(result.some((d) => d.name === "API.md")).toBe(true);
  });

  it("finds root-level markdown files", () => {
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Project");
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Claude");

    const result = findExistingDocs(tmpDir);
    expect(result.some((d) => d.name === "README.md")).toBe(true);
    expect(result.some((d) => d.name === "CLAUDE.md")).toBe(true);
  });

  it("returns empty for no docs", () => {
    const result = findExistingDocs(tmpDir);
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// identifyGaps
// ─────────────────────────────────────────────

describe("identifyGaps", () => {
  it("marks all as missing for empty project", () => {
    const result = identifyGaps(tmpDir, []);
    const missing = result.filter((g) => g.status === "missing");
    expect(missing.length).toBe(EXPECTED_SSOT_DOCS.length);
  });

  it("marks existing docs as exists", () => {
    const prdPath = "docs/requirements/SSOT-0_PRD.md";
    fs.mkdirSync(path.join(tmpDir, "docs/requirements"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, prdPath),
      "# PRD\n" + "x".repeat(200),
    );

    const result = identifyGaps(tmpDir, [{ path: prdPath, name: "SSOT-0_PRD.md", sizeBytes: 200, category: "requirements" }]);
    const prd = result.find((g) => g.ssoId === "SSOT-0");
    expect(prd?.status).toBe("exists");
  });

  it("marks small files as partial", () => {
    const techPath = "docs/standards/TECH_STACK.md";
    fs.mkdirSync(path.join(tmpDir, "docs/standards"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, techPath), "# Tech\n");

    const result = identifyGaps(tmpDir, []);
    const tech = result.find((g) => g.ssoId === "STD-TECH");
    expect(tech?.status).toBe("partial");
  });
});

// ─────────────────────────────────────────────
// calculateReadiness
// ─────────────────────────────────────────────

describe("calculateReadiness", () => {
  it("gives high score for well-equipped project", () => {
    const dir: DirectoryAnalysis = {
      hasSrc: true, hasDocs: true, hasTests: true,
      hasPublic: true, hasFramework: false, hasClaudeMd: true,
      hasPackageJson: true, topLevelDirs: ["src", "docs"], srcSubdirs: ["app"],
    };
    const tech: DetectedTech[] = [
      { name: "Next.js", category: "framework", source: "pkg" },
      { name: "TypeScript", category: "language", source: "pkg" },
      { name: "Vitest", category: "testing", source: "pkg" },
    ];
    const gaps: SSOTGap[] = EXPECTED_SSOT_DOCS.map((e) => ({
      ssoId: e.ssoId, name: e.name, path: e.path,
      status: "exists" as const,
      recommendation: "",
    }));

    const result = calculateReadiness(dir, tech, gaps);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("gives low score for bare project", () => {
    const dir: DirectoryAnalysis = {
      hasSrc: false, hasDocs: false, hasTests: false,
      hasPublic: false, hasFramework: false, hasClaudeMd: false,
      hasPackageJson: false, topLevelDirs: [], srcSubdirs: [],
    };
    const result = calculateReadiness(dir, [], []);
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("penalizes already-managed projects", () => {
    const managed: DirectoryAnalysis = {
      hasSrc: true, hasDocs: true, hasTests: false,
      hasPublic: false, hasFramework: true, hasClaudeMd: true,
      hasPackageJson: true, topLevelDirs: ["src"], srcSubdirs: [],
    };
    const notManaged: DirectoryAnalysis = {
      ...managed, hasFramework: false,
    };
    const r1 = calculateReadiness(managed, [], []);
    const r2 = calculateReadiness(notManaged, [], []);
    expect(r2.score).toBeGreaterThan(r1.score);
  });
});

// ─────────────────────────────────────────────
// saveRetrofitReport / loadRetrofitReport
// ─────────────────────────────────────────────

describe("saveRetrofitReport / loadRetrofitReport", () => {
  it("saves and loads report", () => {
    const report: RetrofitReport = {
      projectDir: tmpDir,
      projectName: "test-project",
      scannedAt: "2026-02-04T00:00:00Z",
      directory: {
        hasSrc: true, hasDocs: false, hasTests: false,
        hasPublic: false, hasFramework: false, hasClaudeMd: false,
        hasPackageJson: true, topLevelDirs: ["src"], srcSubdirs: [],
      },
      techStack: [{ name: "Next.js", category: "framework", source: "pkg" }],
      fileStats: { totalFiles: 10, totalLines: 500, byExtension: { ".ts": 8 } },
      existingDocs: [],
      gaps: [],
      readiness: { score: 50, maxScore: 100, details: [] },
    };

    saveRetrofitReport(tmpDir, report);
    const loaded = loadRetrofitReport(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.projectName).toBe("test-project");
    expect(loaded?.techStack[0].name).toBe("Next.js");
  });

  it("returns null when no report exists", () => {
    const result = loadRetrofitReport(tmpDir);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────
// generateSSOTStub
// ─────────────────────────────────────────────

describe("generateSSOTStub", () => {
  it("generates PRD stub with project info", () => {
    const expected = EXPECTED_SSOT_DOCS.find((e) => e.ssoId === "SSOT-0")!;
    const tech: DetectedTech[] = [
      { name: "Next.js", category: "framework", source: "pkg" },
    ];
    const result = generateSSOTStub(expected, tech, "my-app");
    expect(result).toContain("my-app");
    expect(result).toContain("Next.js");
    expect(result).toContain("§1");
    expect(result).toContain("§12");
  });

  it("generates Tech Stack doc from detected tech", () => {
    const expected = EXPECTED_SSOT_DOCS.find((e) => e.ssoId === "STD-TECH")!;
    const tech: DetectedTech[] = [
      { name: "React", category: "framework", version: "^19.0.0", source: "package.json (react)" },
      { name: "Vitest", category: "testing", version: "^2.0.0", source: "package.json (vitest)" },
    ];
    const result = generateSSOTStub(expected, tech, "my-app");
    expect(result).toContain("React");
    expect(result).toContain("Vitest");
    expect(result).toContain("^19.0.0");
  });

  it("generates generic stub for unknown ssoId", () => {
    const expected = { ssoId: "UNKNOWN", name: "Unknown Doc", path: "docs/unknown.md", required: false };
    const result = generateSSOTStub(expected, [], "my-app");
    expect(result).toContain("Unknown Doc");
    expect(result).toContain("[要記入]");
  });
});

// ─────────────────────────────────────────────
// generateRetrofitMarkdown
// ─────────────────────────────────────────────

describe("generateRetrofitMarkdown", () => {
  it("generates markdown report", () => {
    const report: RetrofitReport = {
      projectDir: "/tmp/test",
      projectName: "test-project",
      scannedAt: "2026-02-04T00:00:00Z",
      directory: {
        hasSrc: true, hasDocs: false, hasTests: false,
        hasPublic: false, hasFramework: false, hasClaudeMd: false,
        hasPackageJson: true, topLevelDirs: ["src"], srcSubdirs: [],
      },
      techStack: [{ name: "Next.js", category: "framework", version: "^15.0.0", source: "pkg" }],
      fileStats: { totalFiles: 10, totalLines: 500, byExtension: { ".ts": 8 } },
      existingDocs: [],
      gaps: [
        { ssoId: "SSOT-0", name: "PRD", path: "docs/requirements/SSOT-0_PRD.md", status: "missing", recommendation: "Generate" },
        { ssoId: "STD-TECH", name: "Tech Stack", path: "docs/standards/TECH_STACK.md", status: "exists", recommendation: "Audit" },
      ],
      readiness: {
        score: 50, maxScore: 100,
        details: [{ name: "Has src/", passed: true, points: 10 }],
      },
    };

    const md = generateRetrofitMarkdown(report);
    expect(md).toContain("test-project");
    expect(md).toContain("50/100");
    expect(md).toContain("Next.js");
    expect(md).toContain("MISSING");
    expect(md).toContain("EXISTS");
    expect(md).toContain("Next Steps");
  });
});
