import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runRetrofit, type RetrofitIO } from "./retrofit-engine.js";
import {
  loadRetrofitReport,
  saveRetrofitReport,
  type RetrofitReport,
} from "./retrofit-model.js";
import { installGitHubTemplates } from "./github-templates.js";

function testIO(): RetrofitIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

function writeProject(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "retrofit-target",
        dependencies: { next: "^15.0.0", react: "^19.0.0" },
        devDependencies: { typescript: "^5.7.0", vitest: "^4.0.0" },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "src/app.ts"),
    "export const value = 1;\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(projectDir, "README.md"), "# Existing readme\n", "utf-8");
}

function report(projectDir: string): RetrofitReport {
  return {
    projectDir,
    projectName: "retrofit-target",
    scannedAt: "2026-02-03T00:00:00.000Z",
    directory: {
      hasSrc: true,
      hasDocs: false,
      hasTests: false,
      hasPublic: false,
      hasFramework: false,
      hasClaudeMd: false,
      hasPackageJson: true,
      topLevelDirs: ["src"],
      srcSubdirs: [],
    },
    techStack: [],
    fileStats: { totalFiles: 2, totalLines: 2, byExtension: { ".ts": 1, ".md": 1 } },
    existingDocs: [],
    gaps: [],
    readiness: { score: 10, maxScore: 100, details: [] },
  };
}

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function listRelativeFiles(projectDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(path.relative(projectDir, fullPath));
      }
    }
  }

  walk(projectDir);
  return files.sort();
}

describe("retrofit file mutation safety", () => {
  let tmpDir: string;
  let frameworkRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "retrofit-core-"));
    frameworkRoot = process.cwd();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves retrofit reports by creating .framework when missing", () => {
    const filename = saveRetrofitReport(tmpDir, report(tmpDir));

    expect(filename).toBe("retrofit-report.json");
    expect(fs.existsSync(path.join(tmpDir, ".framework", filename))).toBe(true);
  });

  it("loads retrofit reports without mutating report content", () => {
    const input = report(tmpDir);
    saveRetrofitReport(tmpDir, input);

    expect(loadRetrofitReport(tmpDir)).toEqual(input);
  });

  it("creates .framework/retrofit-report.json during scan-only retrofit", async () => {
    writeProject(tmpDir);

    const result = await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: false,
      generateStubs: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.generatedFiles).toContain(".framework/retrofit-report.json");
    expect(fs.existsSync(path.join(tmpDir, ".framework", "retrofit-report.json"))).toBe(true);
  });

  it("generates missing SSOT stubs and .framework structure", async () => {
    writeProject(tmpDir);

    const result = await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: false,
      generateStubs: true,
    });

    expect(result.errors).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, ".framework", "retrofit-report.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "docs/design/core/SSOT-3_API_CONTRACT.md"))).toBe(true);
  });

  it("does not overwrite existing SSOT files without a force path", async () => {
    writeProject(tmpDir);
    const prdPath = path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md");
    fs.mkdirSync(path.dirname(prdPath), { recursive: true });
    fs.writeFileSync(prdPath, "# Existing PRD\n\nKeep this content.\n", "utf-8");

    await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: false,
      generateStubs: true,
    });

    expect(read(prdPath)).toBe("# Existing PRD\n\nKeep this content.\n");
  });

  it("is idempotent for generated SSOT files", async () => {
    writeProject(tmpDir);

    const first = await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: false,
      generateStubs: true,
    });
    const prdPath = path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md");
    const firstContent = read(prdPath);

    const second = await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: false,
      generateStubs: true,
    });

    expect(second.errors).toEqual([]);
    expect(read(prdPath)).toBe(firstContent);
    expect(second.generatedFiles).not.toContain("docs/requirements/SSOT-0_PRD.md");
    expect(first.generatedFiles).toContain("docs/requirements/SSOT-0_PRD.md");
  });

  it("does not write files in dry-run mode", async () => {
    writeProject(tmpDir);

    const before = listRelativeFiles(tmpDir);
    const result = await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: true,
      generateStubs: true,
    });

    expect(result.generatedFiles.length).toBeGreaterThan(0);
    expect(listRelativeFiles(tmpDir)).toEqual(before);
  });

  it("returns an error for missing project directories without creating partial state", async () => {
    const missingDir = path.join(tmpDir, "missing-project");

    const result = await runRetrofit({
      projectDir: missingDir,
      io: testIO(),
      dryRun: false,
      generateStubs: true,
    });

    expect(result.errors[0]).toContain("Project directory not found");
    expect(fs.existsSync(missingDir)).toBe(false);
  });

  it("installs .github/workflows/ci.yml from the profile template", () => {
    writeProject(tmpDir);

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "retrofit-target",
    });

    expect(result.errors).toEqual([]);
    expect(result.installed).toContain(".github/workflows/ci.yml");
    expect(read(path.join(tmpDir, ".github/workflows/ci.yml"))).toContain("CI");
  });

  it("preserves existing GitHub templates when force is false", () => {
    writeProject(tmpDir);
    const ciPath = path.join(tmpDir, ".github/workflows/ci.yml");
    fs.mkdirSync(path.dirname(ciPath), { recursive: true });
    fs.writeFileSync(ciPath, "name: custom-ci\n", "utf-8");

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "retrofit-target",
      force: false,
    });

    expect(result.skipped).toContain(".github/workflows/ci.yml (exists)");
    expect(read(ciPath)).toBe("name: custom-ci\n");
  });

  it("overwrites GitHub templates when force is true", () => {
    writeProject(tmpDir);
    const ciPath = path.join(tmpDir, ".github/workflows/ci.yml");
    fs.mkdirSync(path.dirname(ciPath), { recursive: true });
    fs.writeFileSync(ciPath, "name: custom-ci\n", "utf-8");

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "retrofit-target",
      force: true,
    });

    expect(result.installed).toContain(".github/workflows/ci.yml");
    expect(read(ciPath)).not.toBe("name: custom-ci\n");
    expect(read(ciPath)).toContain("CI");
  });

  it("does not modify files outside retrofit and GitHub template scopes", async () => {
    writeProject(tmpDir);
    const packageBefore = read(path.join(tmpDir, "package.json"));
    const srcBefore = read(path.join(tmpDir, "src/app.ts"));
    const readmeBefore = read(path.join(tmpDir, "README.md"));

    await runRetrofit({
      projectDir: tmpDir,
      io: testIO(),
      dryRun: false,
      generateStubs: true,
    });
    installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "retrofit-target",
    });

    expect(read(path.join(tmpDir, "package.json"))).toBe(packageBefore);
    expect(read(path.join(tmpDir, "src/app.ts"))).toBe(srcBefore);
    expect(read(path.join(tmpDir, "README.md"))).toBe(readmeBefore);
    expect(
      listRelativeFiles(tmpDir).every((file) =>
        file === "package.json" ||
        file === "README.md" ||
        file.startsWith("src/") ||
        file.startsWith("docs/") ||
        file.startsWith(".framework/") ||
        file.startsWith(".github/"),
      ),
    ).toBe(true);
  });
});
