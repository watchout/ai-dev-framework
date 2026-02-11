import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runRetrofit,
  type RetrofitIO,
} from "./retrofit-engine.js";

let tmpDir: string;
const output: string[] = [];

function createTestIO(): RetrofitIO {
  output.length = 0;
  return {
    print(message: string): void {
      output.push(message);
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "retrofit-engine-"));
  output.length = 0;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Helper: set up a minimal project structure
 */
function setupProject(opts?: {
  withPackageJson?: boolean;
  withSrc?: boolean;
  withDocs?: boolean;
  withExistingSSot?: boolean;
  packageDeps?: Record<string, string>;
  packageDevDeps?: Record<string, string>;
}): void {
  const o = opts ?? {};

  if (o.withSrc) {
    fs.mkdirSync(path.join(tmpDir, "src/app"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src/app/page.tsx"), "export default function Home() { return <div>Home</div>; }");
  }

  if (o.withDocs) {
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "docs/README.md"), "# Documentation");
  }

  if (o.withPackageJson) {
    const pkg: Record<string, unknown> = { name: "test-project" };
    if (o.packageDeps) pkg.dependencies = o.packageDeps;
    if (o.packageDevDeps) pkg.devDependencies = o.packageDevDeps;
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(pkg, null, 2));
  }

  if (o.withExistingSSot) {
    fs.mkdirSync(path.join(tmpDir, "docs/requirements"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md"),
      "# PRD\n\n" + "Content ".repeat(50),
    );
  }
}

// ─────────────────────────────────────────────
// Scan-only mode (no --generate)
// ─────────────────────────────────────────────

describe("runRetrofit (scan only)", () => {
  it("scans an empty directory", async () => {
    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.report.projectName).toBeDefined();
    expect(result.report.techStack).toEqual([]);
    expect(result.report.gaps.length).toBeGreaterThan(0);
  });

  it("detects tech stack from package.json", async () => {
    setupProject({
      withPackageJson: true,
      packageDeps: { next: "^15.0.0", react: "^19.0.0" },
      packageDevDeps: { typescript: "^5.7.0", vitest: "^2.0.0" },
    });

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    expect(result.report.techStack.some((t) => t.name === "Next.js")).toBe(true);
    expect(result.report.techStack.some((t) => t.name === "React")).toBe(true);
    expect(result.report.techStack.some((t) => t.name === "TypeScript")).toBe(true);
    expect(result.report.techStack.some((t) => t.name === "Vitest")).toBe(true);
  });

  it("uses package.json name as projectName", async () => {
    setupProject({ withPackageJson: true });

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    expect(result.report.projectName).toBe("test-project");
  });

  it("reports file statistics", async () => {
    setupProject({ withSrc: true, withPackageJson: true });
    fs.writeFileSync(path.join(tmpDir, "src/util.ts"), "export const x = 1;\nexport const y = 2;\n");

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    expect(result.report.fileStats.totalFiles).toBeGreaterThan(0);
    expect(result.report.fileStats.totalLines).toBeGreaterThan(0);
  });

  it("identifies existing SSOT documents", async () => {
    setupProject({ withPackageJson: true, withDocs: true, withExistingSSot: true });

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    const prd = result.report.gaps.find((g) => g.ssoId === "SSOT-0");
    expect(prd?.status).toBe("exists");
  });

  it("saves retrofit report to .framework/", async () => {
    setupProject({ withPackageJson: true });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    const reportPath = path.join(tmpDir, ".framework", "retrofit-report.json");
    expect(fs.existsSync(reportPath)).toBe(true);
  });

  it("calculates readiness score", async () => {
    setupProject({
      withPackageJson: true,
      withSrc: true,
      withDocs: true,
      packageDeps: { next: "^15.0.0" },
      packageDevDeps: { typescript: "^5.7.0" },
    });

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    expect(result.report.readiness.score).toBeGreaterThan(0);
    expect(result.report.readiness.maxScore).toBeGreaterThan(0);
  });

  it("returns error for non-existent directory", async () => {
    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: "/tmp/nonexistent-project-12345", io, dryRun: false, generateStubs: false,
    });

    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Generate mode (--generate)
// ─────────────────────────────────────────────

describe("runRetrofit (with --generate)", () => {
  it("generates missing SSOT stubs", async () => {
    setupProject({
      withPackageJson: true,
      withSrc: true,
      packageDeps: { next: "^15.0.0" },
    });

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: true,
    });

    expect(result.generatedFiles.length).toBeGreaterThan(0);

    // Check PRD was created
    const prdPath = path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md");
    expect(fs.existsSync(prdPath)).toBe(true);

    const content = fs.readFileSync(prdPath, "utf-8");
    expect(content).toContain("test-project");
    expect(content).toContain("Next.js");
  });

  it("does not overwrite existing documents", async () => {
    setupProject({
      withPackageJson: true,
      withExistingSSot: true,
    });

    const originalContent = fs.readFileSync(
      path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md"),
      "utf-8",
    );

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: true,
    });

    const afterContent = fs.readFileSync(
      path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md"),
      "utf-8",
    );
    expect(afterContent).toBe(originalContent);
  });

  it("creates necessary directories", async () => {
    setupProject({ withPackageJson: true });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: true,
    });

    expect(fs.existsSync(path.join(tmpDir, "docs/requirements"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "docs/design/core"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "docs/standards"))).toBe(true);
  });

  it("generates tech stack document with detected tech", async () => {
    setupProject({
      withPackageJson: true,
      packageDeps: { react: "^19.0.0" },
      packageDevDeps: { vitest: "^2.0.0" },
    });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: true,
    });

    const techPath = path.join(tmpDir, "docs/standards/TECH_STACK.md");
    expect(fs.existsSync(techPath)).toBe(true);

    const content = fs.readFileSync(techPath, "utf-8");
    expect(content).toContain("React");
    expect(content).toContain("Vitest");
  });
});

// ─────────────────────────────────────────────
// Dry-run mode
// ─────────────────────────────────────────────

describe("runRetrofit (dry run)", () => {
  it("does not create files in dry-run mode", async () => {
    setupProject({ withPackageJson: true });

    const io = createTestIO();
    const result = await runRetrofit({
      projectDir: tmpDir, io, dryRun: true, generateStubs: true,
    });

    expect(result.generatedFiles.length).toBeGreaterThan(0);

    // Verify files were NOT created
    const prdPath = path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md");
    expect(fs.existsSync(prdPath)).toBe(false);
  });

  it("prints DRY RUN messages", async () => {
    setupProject({ withPackageJson: true });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: true, generateStubs: true,
    });

    const hasDryRunMsg = output.some((line) => line.includes("DRY RUN"));
    expect(hasDryRunMsg).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────

describe("runRetrofit (output)", () => {
  it("prints summary with tech stack", async () => {
    setupProject({
      withPackageJson: true,
      packageDeps: { next: "^15.0.0" },
    });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    const hasNext = output.some((line) => line.includes("Next.js"));
    expect(hasNext).toBe(true);
  });

  it("prints readiness checks", async () => {
    setupProject({ withPackageJson: true, withSrc: true });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    const hasPass = output.some((line) => line.includes("[PASS]"));
    expect(hasPass).toBe(true);
  });

  it("prints next steps", async () => {
    setupProject({ withPackageJson: true });

    const io = createTestIO();
    await runRetrofit({
      projectDir: tmpDir, io, dryRun: false, generateStubs: false,
    });

    const hasNextSteps = output.some((line) => line.includes("Next Steps"));
    expect(hasNextSteps).toBe(true);
  });
});
