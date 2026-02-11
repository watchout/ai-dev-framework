import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  fetchFrameworkDocs,
  loadFrameworkState,
  FRAMEWORK_REPO,
} from "./framework-fetch.js";

let tmpDir: string;
let sourceDir: string;

/**
 * Create a fake framework repo directory for testing
 * (avoids actual git clone)
 */
function createFakeFrameworkRepo(): void {
  fs.mkdirSync(sourceDir, { recursive: true });

  // Root-level docs
  fs.writeFileSync(
    path.join(sourceDir, "00_MASTER_GUIDE.md"),
    "# Master Guide\n\nFramework overview.",
  );
  fs.writeFileSync(
    path.join(sourceDir, "09_TOOLCHAIN.md"),
    "# Toolchain\n\nCLI specifications.",
  );
  fs.writeFileSync(
    path.join(sourceDir, "21_AI_ESCALATION.md"),
    "# AI Escalation\n\nProtocol for AI interruption.",
  );
  fs.writeFileSync(
    path.join(sourceDir, "README.md"),
    "# AI Dev Framework\n\nSSOT repository.",
  );

  // Subdirectories
  fs.mkdirSync(path.join(sourceDir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "templates/TEMPLATE.md"),
    "# Template\n\nDocument template.",
  );

  fs.mkdirSync(path.join(sourceDir, "checklists"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "checklists/REVIEW.md"),
    "# Review Checklist\n\n- [ ] Item 1",
  );

  // Simulate .git directory (should be skipped)
  fs.mkdirSync(path.join(sourceDir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, ".git/HEAD"), "ref: refs/heads/main");

  // Simulate .DS_Store (should be skipped)
  fs.writeFileSync(path.join(sourceDir, ".DS_Store"), "");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-fetch-test-"));
  sourceDir = path.join(tmpDir, "fake-framework");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// fetchFrameworkDocs
// ─────────────────────────────────────────────

describe("fetchFrameworkDocs", () => {
  it("copies framework docs to target docs/standards/", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(targetDir, { recursive: true });

    const result = await fetchFrameworkDocs(targetDir, {
      sourceDir,
    });

    expect(result.errors).toEqual([]);
    expect(result.copiedFiles.length).toBeGreaterThan(0);

    // Check files were created
    expect(
      fs.existsSync(
        path.join(targetDir, "docs/standards/00_MASTER_GUIDE.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(targetDir, "docs/standards/09_TOOLCHAIN.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(targetDir, "docs/standards/templates/TEMPLATE.md"),
      ),
    ).toBe(true);
  });

  it("skips .git and .DS_Store", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(targetDir, { recursive: true });

    const result = await fetchFrameworkDocs(targetDir, {
      sourceDir,
    });

    expect(result.errors).toEqual([]);
    expect(
      fs.existsSync(path.join(targetDir, "docs/standards/.git")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(targetDir, "docs/standards/.DS_Store")),
    ).toBe(false);
  });

  it("refuses to overwrite non-empty docs/standards/ without force", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(targetDir, "docs/standards"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(targetDir, "docs/standards/existing.md"),
      "existing",
    );

    const result = await fetchFrameworkDocs(targetDir, {
      sourceDir,
    });

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("already exists");
  });

  it("overwrites existing docs/standards/ with force option", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(targetDir, "docs/standards"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(targetDir, "docs/standards/old-file.md"),
      "old content",
    );

    const result = await fetchFrameworkDocs(targetDir, {
      sourceDir,
      force: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.copiedFiles.length).toBeGreaterThan(0);

    // Old file should be gone
    expect(
      fs.existsSync(
        path.join(targetDir, "docs/standards/old-file.md"),
      ),
    ).toBe(false);

    // New files should be present
    expect(
      fs.existsSync(
        path.join(targetDir, "docs/standards/00_MASTER_GUIDE.md"),
      ),
    ).toBe(true);
  });

  it("creates docs/standards/ directory if it doesn't exist", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(targetDir, { recursive: true });

    await fetchFrameworkDocs(targetDir, { sourceDir });

    expect(
      fs.existsSync(path.join(targetDir, "docs/standards")),
    ).toBe(true);
  });

  it("saves framework state to .framework/framework.json", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(targetDir, { recursive: true });

    await fetchFrameworkDocs(targetDir, { sourceDir });

    const state = loadFrameworkState(targetDir);
    expect(state).not.toBeNull();
    expect(state?.repo).toBe(FRAMEWORK_REPO);
    expect(state?.fetchedAt).toBeDefined();
    expect(state?.files.length).toBeGreaterThan(0);
  });

  it("preserves directory structure in copied files", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(targetDir, { recursive: true });

    const result = await fetchFrameworkDocs(targetDir, {
      sourceDir,
    });

    // Check that nested paths are included
    const hasTemplateFile = result.copiedFiles.some((f) =>
      f.includes("templates/TEMPLATE.md"),
    );
    expect(hasTemplateFile).toBe(true);

    const hasChecklistFile = result.copiedFiles.some((f) =>
      f.includes("checklists/REVIEW.md"),
    );
    expect(hasChecklistFile).toBe(true);
  });

  it("file content is correctly copied", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(targetDir, { recursive: true });

    await fetchFrameworkDocs(targetDir, { sourceDir });

    const content = fs.readFileSync(
      path.join(targetDir, "docs/standards/00_MASTER_GUIDE.md"),
      "utf-8",
    );
    expect(content).toBe("# Master Guide\n\nFramework overview.");
  });

  it("works with empty docs/standards/ directory (not force)", async () => {
    createFakeFrameworkRepo();
    const targetDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(targetDir, "docs/standards"), {
      recursive: true,
    });

    const result = await fetchFrameworkDocs(targetDir, {
      sourceDir,
    });

    expect(result.errors).toEqual([]);
    expect(result.copiedFiles.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// loadFrameworkState
// ─────────────────────────────────────────────

describe("loadFrameworkState", () => {
  it("returns null when no state file exists", () => {
    const targetDir = path.join(tmpDir, "no-state");
    fs.mkdirSync(targetDir, { recursive: true });

    const state = loadFrameworkState(targetDir);
    expect(state).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const targetDir = path.join(tmpDir, "bad-json");
    fs.mkdirSync(path.join(targetDir, ".framework"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(targetDir, ".framework/framework.json"),
      "not json",
    );

    const state = loadFrameworkState(targetDir);
    expect(state).toBeNull();
  });

  it("loads valid state", () => {
    const targetDir = path.join(tmpDir, "good-state");
    fs.mkdirSync(path.join(targetDir, ".framework"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(targetDir, ".framework/framework.json"),
      JSON.stringify({
        repo: FRAMEWORK_REPO,
        version: "abc123",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        files: ["docs/standards/00_MASTER_GUIDE.md"],
      }),
    );

    const state = loadFrameworkState(targetDir);
    expect(state).not.toBeNull();
    expect(state?.version).toBe("abc123");
    expect(state?.files.length).toBe(1);
  });
});
