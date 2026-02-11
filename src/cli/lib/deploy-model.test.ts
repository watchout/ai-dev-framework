import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type DeployReport,
  type DeployConfig,
  type ReleaseInfo,
  parseVersion,
  bumpVersion,
  createDeploySteps,
  validateDeployReadiness,
  saveDeployReport,
  loadDeployReports,
  generateReleaseNotes,
  formatDeployMarkdown,
} from "./deploy-model.js";

function makeDeployReport(
  overrides?: Partial<DeployReport>,
): DeployReport {
  return {
    config: {
      environment: "staging",
      version: "1.0.0",
      branch: "main",
      commit: "abc12345",
    },
    steps: [],
    startedAt: "2026-02-04T00:00:00Z",
    completedAt: "2026-02-04T00:01:00Z",
    success: true,
    ...overrides,
  };
}

describe("deploy-model", () => {
  describe("parseVersion", () => {
    it("parses valid semver string", () => {
      const result = parseVersion("1.2.3");
      expect(result).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it("parses version with v prefix", () => {
      const result = parseVersion("v2.0.1");
      expect(result).toEqual({ major: 2, minor: 0, patch: 1 });
    });

    it("returns null for invalid version", () => {
      expect(parseVersion("invalid")).toBeNull();
      expect(parseVersion("1.2")).toBeNull();
      expect(parseVersion("")).toBeNull();
    });

    it("parses zero version", () => {
      const result = parseVersion("0.0.0");
      expect(result).toEqual({ major: 0, minor: 0, patch: 0 });
    });
  });

  describe("bumpVersion", () => {
    it("bumps major version", () => {
      expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
    });

    it("bumps minor version", () => {
      expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    });

    it("bumps patch version", () => {
      expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    });

    it("returns 0.1.0 for invalid version", () => {
      expect(bumpVersion("invalid", "patch")).toBe("0.1.0");
    });

    it("bumps from zero", () => {
      expect(bumpVersion("0.0.0", "major")).toBe("1.0.0");
      expect(bumpVersion("0.0.0", "minor")).toBe("0.1.0");
      expect(bumpVersion("0.0.0", "patch")).toBe("0.0.1");
    });
  });

  describe("createDeploySteps", () => {
    it("creates 2 steps for dev", () => {
      const steps = createDeploySteps("dev");
      expect(steps).toHaveLength(2);
      expect(steps[0].step).toBe("deploy");
      expect(steps[1].step).toBe("smoke-test");
    });

    it("creates 3 steps for staging", () => {
      const steps = createDeploySteps("staging");
      expect(steps).toHaveLength(3);
      expect(steps[0].step).toBe("migrate");
      expect(steps[1].step).toBe("deploy");
      expect(steps[2].step).toBe("smoke-test");
    });

    it("creates 4 steps for production", () => {
      const steps = createDeploySteps("production");
      expect(steps).toHaveLength(4);
      expect(steps[0].step).toBe("migrate");
      expect(steps[1].step).toBe("deploy");
      expect(steps[2].step).toBe("smoke-test");
      expect(steps[3].step).toBe("monitor");
    });

    it("all steps start as pending", () => {
      const steps = createDeploySteps("production");
      for (const step of steps) {
        expect(step.status).toBe("pending");
      }
    });
  });

  describe("validateDeployReadiness", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-deploy-ready-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns not ready when no CI reports exist", () => {
      const result = validateDeployReadiness(tmpDir);
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("No CI reports"))).toBe(true);
    });

    it("returns not ready when CI verdict is not ready", () => {
      const auditsDir = path.join(tmpDir, ".framework", "audits");
      fs.mkdirSync(auditsDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditsDir, "ci-1000.json"),
        JSON.stringify({ verdict: "not_ready" }),
      );
      fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
      fs.mkdirSync(path.join(tmpDir, "dist"));

      const result = validateDeployReadiness(tmpDir);
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("not 'ready'"))).toBe(true);
    });

    it("returns not ready when no build output exists", () => {
      const auditsDir = path.join(tmpDir, ".framework", "audits");
      fs.mkdirSync(auditsDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditsDir, "ci-1000.json"),
        JSON.stringify({ verdict: "ready" }),
      );
      fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");

      const result = validateDeployReadiness(tmpDir);
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("build output"))).toBe(true);
    });

    it("returns ready when all conditions met", () => {
      const auditsDir = path.join(tmpDir, ".framework", "audits");
      fs.mkdirSync(auditsDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditsDir, "ci-1000.json"),
        JSON.stringify({ verdict: "ready" }),
      );
      fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
      fs.mkdirSync(path.join(tmpDir, "dist"));

      const result = validateDeployReadiness(tmpDir);
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-deploy-persist-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads deploy reports", () => {
      const report = makeDeployReport();
      saveDeployReport(tmpDir, report);

      const reports = loadDeployReports(tmpDir);
      expect(reports).toHaveLength(1);
      expect(reports[0].config.environment).toBe("staging");
      expect(reports[0].config.version).toBe("1.0.0");
    });

    it("creates deploys directory", () => {
      saveDeployReport(tmpDir, makeDeployReport());
      expect(
        fs.existsSync(path.join(tmpDir, ".framework", "deploys")),
      ).toBe(true);
    });

    it("filters by environment", () => {
      saveDeployReport(
        tmpDir,
        makeDeployReport({
          config: { environment: "staging", version: "1.0.0", branch: "main", commit: "abc" },
        }),
      );
      saveDeployReport(
        tmpDir,
        makeDeployReport({
          config: { environment: "production", version: "1.0.0", branch: "main", commit: "abc" },
        }),
      );

      const stagingReports = loadDeployReports(tmpDir, "staging");
      expect(stagingReports).toHaveLength(1);
      expect(stagingReports[0].config.environment).toBe("staging");
    });

    it("returns empty array when no reports exist", () => {
      expect(loadDeployReports(tmpDir)).toHaveLength(0);
    });

    it("sorts reports newest first", () => {
      // Write files with distinct names to avoid same-millisecond collision
      const deploysDir = path.join(tmpDir, ".framework", "deploys");
      fs.mkdirSync(deploysDir, { recursive: true });
      fs.writeFileSync(
        path.join(deploysDir, "staging-1000.json"),
        JSON.stringify(makeDeployReport({ startedAt: "2026-01-01T00:00:00Z" })),
      );
      fs.writeFileSync(
        path.join(deploysDir, "staging-2000.json"),
        JSON.stringify(makeDeployReport({ startedAt: "2026-02-01T00:00:00Z" })),
      );

      const reports = loadDeployReports(tmpDir);
      expect(reports).toHaveLength(2);
      expect(reports[0].startedAt).toBe("2026-02-01T00:00:00Z");
    });
  });

  describe("generateReleaseNotes", () => {
    it("generates markdown with all sections", () => {
      const info: ReleaseInfo = {
        version: "2.0.0",
        date: "2026-02-04",
        features: ["New dashboard", "API v2"],
        fixes: ["Login timeout fix"],
        breakingChanges: ["Removed v1 API"],
        knownIssues: ["Slow on mobile"],
      };
      const md = generateReleaseNotes(info);

      expect(md).toContain("# Release 2.0.0");
      expect(md).toContain("2026-02-04");
      expect(md).toContain("## Features");
      expect(md).toContain("New dashboard");
      expect(md).toContain("## Bug Fixes");
      expect(md).toContain("Login timeout fix");
      expect(md).toContain("## Breaking Changes");
      expect(md).toContain("Removed v1 API");
      expect(md).toContain("## Known Issues");
      expect(md).toContain("Slow on mobile");
    });

    it("omits empty sections", () => {
      const info: ReleaseInfo = {
        version: "1.0.1",
        date: "2026-02-04",
        features: [],
        fixes: ["Bug fix"],
        breakingChanges: [],
        knownIssues: [],
      };
      const md = generateReleaseNotes(info);

      expect(md).toContain("## Bug Fixes");
      expect(md).not.toContain("## Features");
      expect(md).not.toContain("## Breaking Changes");
      expect(md).not.toContain("## Known Issues");
    });
  });

  describe("formatDeployMarkdown", () => {
    it("generates markdown with config and steps", () => {
      const report = makeDeployReport({
        steps: [
          { step: "migrate", status: "success", detail: "done", timestamp: "2026-02-04T00:00:00Z" },
          { step: "deploy", status: "success", detail: "deployed", timestamp: "2026-02-04T00:00:01Z" },
        ],
      });
      const md = formatDeployMarkdown(report);

      expect(md).toContain("# Deploy Report");
      expect(md).toContain("staging");
      expect(md).toContain("1.0.0");
      expect(md).toContain("main");
      expect(md).toContain("## Steps");
      expect(md).toContain("migrate");
      expect(md).toContain("SUCCESS");
    });

    it("includes release notes when present", () => {
      const report = makeDeployReport({
        releaseNotes: "Added new features",
      });
      const md = formatDeployMarkdown(report);
      expect(md).toContain("## Release Notes");
      expect(md).toContain("Added new features");
    });

    it("shows success status correctly", () => {
      const pass = formatDeployMarkdown(makeDeployReport({ success: true }));
      const fail = formatDeployMarkdown(makeDeployReport({ success: false }));
      expect(pass).toContain("Yes");
      expect(fail).toContain("No");
    });
  });
});
