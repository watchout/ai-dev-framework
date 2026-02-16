/**
 * Tests for github-templates.ts
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installGitHubTemplates } from "./github-templates.js";

let tmpDir: string;

// Use the actual framework root for template source
const frameworkRoot = path.resolve(__dirname, "../../..");

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-templates-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("installGitHubTemplates", () => {
  it("installs all templates for app profile", () => {
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "test-project",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.installed.length).toBeGreaterThan(0);

    // CI workflow
    const ciPath = path.join(tmpDir, ".github/workflows/ci.yml");
    expect(fs.existsSync(ciPath)).toBe(true);
    const ciContent = fs.readFileSync(ciPath, "utf-8");
    expect(ciContent).toContain("test-project");
    expect(ciContent).not.toContain("{{PROJECT_NAME}}");

    // PR template
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      ),
    ).toBe(true);

    // Issue templates
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-db.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-api.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-ui.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-test.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/bug.md"),
      ),
    ).toBe(true);

    // CODEOWNERS
    expect(
      fs.existsSync(path.join(tmpDir, ".github/CODEOWNERS")),
    ).toBe(true);
  });

  it("replaces {{PROJECT_NAME}} in CI workflow", () => {
    installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "my-cool-app",
    });

    const ciContent = fs.readFileSync(
      path.join(tmpDir, ".github/workflows/ci.yml"),
      "utf-8",
    );
    expect(ciContent).toContain("my-cool-app");
    expect(ciContent).not.toContain("{{PROJECT_NAME}}");
  });

  it("skips existing files without force", () => {
    // First install
    installGitHubTemplates(tmpDir, "app", frameworkRoot);

    // Second install — should skip all
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    expect(result.installed).toHaveLength(0);
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it("overwrites existing files with force", () => {
    // First install
    installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "first",
    });

    // Second install with force
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      projectName: "second",
      force: true,
    });

    expect(result.installed.length).toBeGreaterThan(0);
    expect(result.skipped).toHaveLength(0);

    const ciContent = fs.readFileSync(
      path.join(tmpDir, ".github/workflows/ci.yml"),
      "utf-8",
    );
    expect(ciContent).toContain("second");
  });

  it("uses profile-specific CI template", () => {
    installGitHubTemplates(tmpDir, "api", frameworkRoot, {
      projectName: "api-project",
    });

    const ciPath = path.join(tmpDir, ".github/workflows/ci.yml");
    expect(fs.existsSync(ciPath)).toBe(true);
  });

  it("handles missing CI template for profile gracefully", () => {
    // Use a non-existent framework root for CI templates only
    const fakeRoot = path.join(os.tmpdir(), "fake-framework-" + Date.now());
    fs.mkdirSync(path.join(fakeRoot, "templates/github/ISSUE_TEMPLATE"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(fakeRoot, "templates/ci"), { recursive: true });

    // Copy github templates but no CI
    const srcGithub = path.join(frameworkRoot, "templates/github");
    for (const file of ["PULL_REQUEST_TEMPLATE.md", "CODEOWNERS"]) {
      const src = path.join(srcGithub, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(fakeRoot, "templates/github", file));
      }
    }
    const srcIssue = path.join(srcGithub, "ISSUE_TEMPLATE");
    for (const file of fs.readdirSync(srcIssue)) {
      fs.copyFileSync(
        path.join(srcIssue, file),
        path.join(fakeRoot, "templates/github/ISSUE_TEMPLATE", file),
      );
    }

    const result = installGitHubTemplates(tmpDir, "app", fakeRoot);

    // CI error expected
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("CI template not found");

    // Other templates should still be installed
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      ),
    ).toBe(true);

    fs.rmSync(fakeRoot, { recursive: true, force: true });
  });

  it("PR template contains SSOT compliance checklist", () => {
    installGitHubTemplates(tmpDir, "app", frameworkRoot);

    const prContent = fs.readFileSync(
      path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      "utf-8",
    );
    expect(prContent).toContain("SSOT Compliance");
    expect(prContent).toContain("SSOT Reference");
    expect(prContent).toContain("Closes #XXX");
  });

  it("issue templates contain correct front matter", () => {
    installGitHubTemplates(tmpDir, "app", frameworkRoot);

    const dbContent = fs.readFileSync(
      path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-db.md"),
      "utf-8",
    );
    expect(dbContent).toContain("name:");
    expect(dbContent).toContain("labels:");
    expect(dbContent).toContain("Definition of Done");
    expect(dbContent).toContain("Migration file created");
  });
});
