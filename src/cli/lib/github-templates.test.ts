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

function writeFrameworkConfig(
  config: Record<string, unknown>,
  projectDir = tmpDir,
): void {
  const frameworkDir = path.join(projectDir, ".framework");
  fs.mkdirSync(frameworkDir, { recursive: true });
  fs.writeFileSync(
    path.join(frameworkDir, "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

function readyMergeAuthorityConfig(): Record<string, unknown> {
  return {
    roles: {
      bindings: {
        architecture_owner: { type: "external", id: "arc" },
        l3_governance_owner: { type: "github_user", id: "cto-user" },
        implementation_lead: { type: "local_agent", id: "codex-lead" },
        reviewer: { type: "external", id: "reviewer" },
        auditor: { type: "external", id: "auditor" },
        release_owner: { type: "github_user", id: "release-user" },
        human_approver: { type: "github_user", id: "human-user" },
        worker_pool: { type: "local_agent", id: "worker-pool" },
      },
    },
    workflow: {
      publishPolicy: "approval_required",
      outputs: ["github"],
    },
  };
}

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
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/governance-work-order.md"),
      ),
    ).toBe(true);
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

    // Governance workflow and optional PR template
    expect(
      fs.existsSync(path.join(tmpDir, ".github/workflows/governance.yml")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE/governance.md"),
      ),
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
    expect(result.skipped).toEqual([
      ".github/workflows/merge-authority.yml (merge authority not installed: workflow.publishPolicy=draft_only)",
    ]);

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
    expect(prContent).toContain("Closes #");
  });

  it("uses MCP-server PR template and skips UI issue template", () => {
    installGitHubTemplates(tmpDir, "mcp-server", frameworkRoot);

    const prContent = fs.readFileSync(
      path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      "utf-8",
    );
    expect(prContent).toContain("4-Layer Docs");
    expect(prContent).toContain("MCP Contract");
    expect(prContent).toContain("shirube trace verify");
    expect(prContent).not.toContain("FEAT-XXX");

    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-ui.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-api.md"),
      ),
    ).toBe(true);
  });

  it("overwrites stale templates and prunes obsolete issue templates on reapply", () => {
    fs.mkdirSync(path.join(tmpDir, ".github/ISSUE_TEMPLATE"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      "old PR template",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-ui.md"),
      "old UI template",
    );

    const result = installGitHubTemplates(tmpDir, "mcp-server", frameworkRoot, {
      force: true,
      pruneObsolete: true,
    });

    expect(result.errors).toHaveLength(0);
    const prContent = fs.readFileSync(
      path.join(tmpDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      "utf-8",
    );
    expect(prContent).toContain("MCP Contract");
    expect(prContent).not.toContain("old PR template");
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github/ISSUE_TEMPLATE/feature-ui.md"),
      ),
    ).toBe(false);
    expect(result.installed).toContain(
      ".github/ISSUE_TEMPLATE/feature-ui.md (removed obsolete)",
    );
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

  it("installs ssot-audit workflow", () => {
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    const ssotAuditPath = path.join(tmpDir, ".github/workflows/ssot-audit.yml");
    expect(fs.existsSync(ssotAuditPath)).toBe(true);
    expect(result.installed).toContain(".github/workflows/ssot-audit.yml");

    const content = fs.readFileSync(ssotAuditPath, "utf-8");
    expect(content).toContain("SSOT Audit");
    expect(content).toContain("SSOT_SCORE_THRESHOLD");
    expect(content).toContain("docs/**/*.md");
  });

  it("installs governance workflow and Work Order templates", () => {
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    const governanceWorkflowPath = path.join(
      tmpDir,
      ".github/workflows/governance.yml",
    );
    const workOrderTemplatePath = path.join(
      tmpDir,
      ".github/ISSUE_TEMPLATE/governance-work-order.md",
    );
    const governancePrTemplatePath = path.join(
      tmpDir,
      ".github/PULL_REQUEST_TEMPLATE/governance.md",
    );

    expect(fs.existsSync(governanceWorkflowPath)).toBe(true);
    expect(fs.existsSync(workOrderTemplatePath)).toBe(true);
    expect(fs.existsSync(governancePrTemplatePath)).toBe(true);
    expect(result.installed).toContain(".github/workflows/governance.yml");
    expect(result.installed).toContain(
      ".github/ISSUE_TEMPLATE/governance-work-order.md",
    );
    expect(result.installed).toContain(
      ".github/PULL_REQUEST_TEMPLATE/governance.md",
    );

    const workflowContent = fs.readFileSync(governanceWorkflowPath, "utf-8");
    expect(workflowContent).toContain("SHIRUBE_GOVERNANCE_PROFILE");
    expect(workflowContent).toContain("check");
    expect(workflowContent).toContain("governance");
  });

  it("skips ssot-audit workflow if already exists", () => {
    installGitHubTemplates(tmpDir, "app", frameworkRoot);
    const result2 = installGitHubTemplates(tmpDir, "app", frameworkRoot);
    expect(result2.skipped.some((s) => s.includes("ssot-audit.yml"))).toBe(true);
  });

  it("skips merge-authority workflow for draft or placeholder projects", () => {
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    const workflowPath = path.join(
      tmpDir,
      ".github/workflows/merge-authority.yml",
    );
    expect(fs.existsSync(workflowPath)).toBe(false);
    expect(result.skipped).toContain(
      ".github/workflows/merge-authority.yml (merge authority not installed: workflow.publishPolicy=draft_only)",
    );
  });

  it("skips merge-authority workflow when roles are placeholders", () => {
    const config = readyMergeAuthorityConfig();
    config.workflow = { publishPolicy: "approval_required", outputs: ["github"] };
    config.roles = {
      bindings: {
        architecture_owner: { type: "external", id: "todo-architecture-owner", placeholder: true },
        l3_governance_owner: { type: "external", id: "todo-l3-governance-owner", placeholder: true },
        implementation_lead: { type: "external", id: "todo-implementation-lead", placeholder: true },
        reviewer: { type: "external", id: "todo-reviewer", placeholder: true },
        auditor: { type: "external", id: "todo-auditor", placeholder: true },
        release_owner: { type: "external", id: "todo-release-owner", placeholder: true },
        human_approver: { type: "external", id: "todo-human-approver", placeholder: true },
        worker_pool: { type: "external", id: "todo-worker-pool", placeholder: true },
      },
    };
    writeFrameworkConfig(config);

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    expect(
      fs.existsSync(path.join(tmpDir, ".github/workflows/merge-authority.yml")),
    ).toBe(false);
    expect(result.skipped).toContain(
      ".github/workflows/merge-authority.yml (merge authority not installed: required roles are placeholders or missing)",
    );
  });

  it("skips merge-authority workflow when authority roles are not GitHub identities", () => {
    const config = readyMergeAuthorityConfig();
    config.roles = {
      ...(config.roles as Record<string, unknown>),
      bindings: {
        ...((config.roles as { bindings: Record<string, unknown> }).bindings),
        l3_governance_owner: { type: "external", id: "cto" },
      },
    };
    writeFrameworkConfig(config);

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    expect(
      fs.existsSync(path.join(tmpDir, ".github/workflows/merge-authority.yml")),
    ).toBe(false);
    expect(result.skipped).toContain(
      ".github/workflows/merge-authority.yml (merge authority not installed: l3_governance_owner must be github_user or github_team)",
    );
  });

  it("installs merge-authority workflow with review triggers when governance is ready", () => {
    writeFrameworkConfig(readyMergeAuthorityConfig());
    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    const workflowPath = path.join(
      tmpDir,
      ".github/workflows/merge-authority.yml",
    );
    expect(fs.existsSync(workflowPath)).toBe(true);
    expect(result.installed).toContain(".github/workflows/merge-authority.yml");

    const content = fs.readFileSync(workflowPath, "utf-8");
    expect(content).toContain("name: \"shirube merge-authority\"");
    expect(content).toContain("pull_request_review:");
    expect(content).toContain("types: [submitted, edited, dismissed]");
    expect(content).not.toContain("review_submitted");
  });

  it("skips merge-authority workflow if already exists", () => {
    writeFrameworkConfig(readyMergeAuthorityConfig());
    installGitHubTemplates(tmpDir, "app", frameworkRoot);
    const workflowPath = path.join(
      tmpDir,
      ".github/workflows/merge-authority.yml",
    );
    fs.writeFileSync(workflowPath, "operator-owned", "utf-8");

    const result2 = installGitHubTemplates(tmpDir, "app", frameworkRoot);

    expect(result2.skipped.some((s) => s.includes("merge-authority.yml"))).toBe(true);
    expect(fs.readFileSync(workflowPath, "utf-8")).toBe("operator-owned");
  });

  it("preserves existing merge-authority workflow even during force update", () => {
    writeFrameworkConfig(readyMergeAuthorityConfig());
    installGitHubTemplates(tmpDir, "app", frameworkRoot);
    const workflowPath = path.join(
      tmpDir,
      ".github/workflows/merge-authority.yml",
    );
    fs.writeFileSync(workflowPath, "operator-owned", "utf-8");

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      force: true,
    });

    expect(result.skipped.some((s) => s.includes("merge-authority.yml"))).toBe(true);
    expect(fs.readFileSync(workflowPath, "utf-8")).toBe("operator-owned");
  });

  it("overwrites existing merge-authority workflow only with explicit workflow force", () => {
    writeFrameworkConfig(readyMergeAuthorityConfig());
    installGitHubTemplates(tmpDir, "app", frameworkRoot);
    const workflowPath = path.join(
      tmpDir,
      ".github/workflows/merge-authority.yml",
    );
    fs.writeFileSync(workflowPath, "operator-owned", "utf-8");

    const result = installGitHubTemplates(tmpDir, "app", frameworkRoot, {
      force: true,
      forceMergeAuthorityWorkflow: true,
    });

    expect(result.installed).toContain(".github/workflows/merge-authority.yml");
    expect(fs.readFileSync(workflowPath, "utf-8")).toContain(
      "name: \"shirube merge-authority\"",
    );
  });
});
