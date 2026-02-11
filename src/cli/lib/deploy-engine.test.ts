import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { type DeployIO, runDeploy } from "./deploy-engine.js";
import { saveDeployReport, type DeployReport } from "./deploy-model.js";

function createMockIO(
  answers: string[] = ["yes"],
): DeployIO & { output: string[] } {
  let answerIndex = 0;
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
    async ask(_prompt: string): Promise<string> {
      const answer = answers[answerIndex] ?? "no";
      answerIndex++;
      return answer;
    },
  };
}

/**
 * Set up a project directory that passes deploy readiness checks.
 */
function setupDeployableProject(dir: string): void {
  // package.json
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "test", version: "1.0.0", scripts: { build: "tsc" } }),
  );

  // Build output
  fs.mkdirSync(path.join(dir, "dist"));

  // CI report with ready verdict
  const auditsDir = path.join(dir, ".framework", "audits");
  fs.mkdirSync(auditsDir, { recursive: true });
  fs.writeFileSync(
    path.join(auditsDir, "ci-1000.json"),
    JSON.stringify({
      timestamp: "2026-02-04T00:00:00Z",
      branch: "main",
      commit: "abc12345",
      stages: [],
      allRequiredPassed: true,
      verdict: "ready",
      blockers: [],
    }),
  );
}

describe("deploy-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-deploy-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runDeploy dry-run", () => {
    it("shows plan without executing", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO();

      const report = await runDeploy(
        tmpDir,
        "staging",
        { dryRun: true },
        io,
      );

      expect(io.output.some((o) => o.includes("DRY RUN"))).toBe(true);
      expect(io.output.some((o) => o.includes("Deploy Plan"))).toBe(true);
      // Dry run should not save a report
      const deploysDir = path.join(tmpDir, ".framework", "deploys");
      expect(fs.existsSync(deploysDir)).toBe(false);
    });

    it("shows correct version from package.json", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO();

      await runDeploy(tmpDir, "staging", { dryRun: true }, io);

      // Should auto-bump to 1.0.1 from 1.0.0
      expect(io.output.some((o) => o.includes("1.0.1"))).toBe(true);
    });
  });

  describe("runDeploy to staging", () => {
    it("executes deploy with confirmation", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO(["yes"]);

      const report = await runDeploy(
        tmpDir,
        "staging",
        {},
        io,
      );

      expect(report.success).toBe(true);
      expect(report.config.environment).toBe("staging");
      expect(report.steps.length).toBeGreaterThan(0);
      expect(io.output.some((o) => o.includes("DEPLOY SUCCEEDED"))).toBe(true);
    });

    it("cancels deploy when user says no", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO(["no"]);

      const report = await runDeploy(tmpDir, "staging", {}, io);

      expect(report.success).toBe(false);
      expect(io.output.some((o) => o.includes("cancelled"))).toBe(true);
    });

    it("saves deploy report to disk", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO(["yes"]);

      await runDeploy(tmpDir, "staging", {}, io);

      const deploysDir = path.join(tmpDir, ".framework", "deploys");
      expect(fs.existsSync(deploysDir)).toBe(true);
      const files = fs.readdirSync(deploysDir);
      expect(files.some((f) => f.startsWith("staging-"))).toBe(true);
    });
  });

  describe("runDeploy to production", () => {
    it("has 4 steps including monitor", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO(["yes"]);

      const report = await runDeploy(
        tmpDir,
        "production",
        {},
        io,
      );

      expect(report.success).toBe(true);
      expect(report.steps).toHaveLength(4);
      expect(report.steps[3].step).toBe("monitor");
    });
  });

  describe("runDeploy --status", () => {
    it("shows message when no deploy history exists", async () => {
      const io = createMockIO();
      await runDeploy(tmpDir, "staging", { status: true }, io);

      expect(io.output.some((o) => o.includes("No deploy reports"))).toBe(true);
    });

    it("shows deploy history when reports exist", async () => {
      const existing: DeployReport = {
        config: {
          environment: "staging",
          version: "1.0.0",
          branch: "main",
          commit: "abc12345",
        },
        steps: [],
        startedAt: "2026-02-03T12:00:00Z",
        completedAt: "2026-02-03T12:01:00Z",
        success: true,
      };
      saveDeployReport(tmpDir, existing);

      const io = createMockIO();
      const report = await runDeploy(
        tmpDir,
        "staging",
        { status: true },
        io,
      );

      expect(report.config.version).toBe("1.0.0");
      expect(io.output.some((o) => o.includes("DEPLOY HISTORY"))).toBe(true);
      expect(io.output.some((o) => o.includes("SUCCESS"))).toBe(true);
    });
  });

  describe("deploy readiness validation", () => {
    it("fails when CI has not passed", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
      );
      fs.mkdirSync(path.join(tmpDir, "dist"));

      const io = createMockIO();
      const report = await runDeploy(tmpDir, "staging", {}, io);

      expect(report.success).toBe(false);
      expect(io.output.some((o) => o.includes("FAILED"))).toBe(true);
    });

    it("fails when no build output exists", async () => {
      // CI ready but no build
      const auditsDir = path.join(tmpDir, ".framework", "audits");
      fs.mkdirSync(auditsDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditsDir, "ci-1000.json"),
        JSON.stringify({ verdict: "ready" }),
      );
      fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");

      const io = createMockIO();
      const report = await runDeploy(tmpDir, "staging", {}, io);

      expect(report.success).toBe(false);
      expect(io.output.some((o) => o.includes("build output"))).toBe(true);
    });
  });

  describe("version determination", () => {
    it("uses explicit version when provided", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO(["yes"]);

      const report = await runDeploy(
        tmpDir,
        "staging",
        { version: "2.0.0" },
        io,
      );

      expect(report.config.version).toBe("2.0.0");
    });

    it("auto-bumps patch version from package.json", async () => {
      setupDeployableProject(tmpDir);
      const io = createMockIO(["yes"]);

      const report = await runDeploy(tmpDir, "staging", {}, io);

      expect(report.config.version).toBe("1.0.1");
    });
  });

  describe("runDeploy --rollback", () => {
    it("shows rollback procedure", async () => {
      const report1: DeployReport = {
        config: { environment: "staging", version: "1.0.0", branch: "main", commit: "abc" },
        steps: [],
        startedAt: "2026-02-03T00:00:00Z",
        success: true,
      };
      const report2: DeployReport = {
        config: { environment: "staging", version: "1.1.0", branch: "main", commit: "def" },
        steps: [],
        startedAt: "2026-02-04T00:00:00Z",
        success: true,
      };
      // Write files with distinct names to avoid same-millisecond collision
      const deploysDir = path.join(tmpDir, ".framework", "deploys");
      fs.mkdirSync(deploysDir, { recursive: true });
      fs.writeFileSync(
        path.join(deploysDir, "staging-1000.json"),
        JSON.stringify(report1),
      );
      fs.writeFileSync(
        path.join(deploysDir, "staging-2000.json"),
        JSON.stringify(report2),
      );

      const io = createMockIO();
      await runDeploy(tmpDir, "staging", { rollback: true }, io);

      expect(io.output.some((o) => o.includes("ROLLBACK PROCEDURE"))).toBe(true);
      expect(io.output.some((o) => o.includes("Rollback target"))).toBe(true);
    });

    it("shows message when no previous deploy exists", async () => {
      const io = createMockIO();
      await runDeploy(tmpDir, "staging", { rollback: true }, io);

      expect(io.output.some((o) => o.includes("No previous deployment"))).toBe(true);
    });
  });
});
