import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { type CIIO, runCI } from "./ci-engine.js";
import { type CIReport, saveCIReport } from "./ci-model.js";

function createMockIO(): CIIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

/**
 * Set up a project directory that passes all CI stages.
 */
function setupHealthyProject(dir: string): void {
  // tsconfig + eslint for lint stage
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");
  fs.writeFileSync(path.join(dir, "eslint.config.js"), "");

  // package.json with build script
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "test", version: "1.0.0", scripts: { build: "tsc" } }),
  );

  // Build output
  fs.mkdirSync(path.join(dir, "dist"));

  // .gitignore with .env
  fs.writeFileSync(path.join(dir, ".gitignore"), ".env\nnode_modules\n");

  // Source and test files
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(
    path.join(dir, "src", "index.ts"),
    'export const greeting: string = "hello";\n',
  );
  fs.writeFileSync(
    path.join(dir, "src", "index.test.ts"),
    'import { describe, it, expect } from "vitest";\ndescribe("test", () => { it("works", () => { expect(true).toBe(true); }); });\n',
  );
}

describe("ci-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-ci-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runCI pipeline", () => {
    it("returns ready verdict for healthy project", () => {
      setupHealthyProject(tmpDir);
      const io = createMockIO();

      const report = runCI(tmpDir, {}, io);

      expect(report.verdict).toBe("ready");
      expect(report.allRequiredPassed).toBe(true);
      expect(report.blockers).toHaveLength(0);
    });

    it("returns not_ready when tests are missing", () => {
      // Only set up partial project (no test files)
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      fs.writeFileSync(path.join(tmpDir, "eslint.config.js"), "");
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".env\n");
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "export const x = 1;\n");

      const io = createMockIO();
      const report = runCI(tmpDir, {}, io);

      expect(report.verdict).toBe("not_ready");
      expect(report.blockers.length).toBeGreaterThan(0);
    });

    it("saves report to .framework/audits", () => {
      setupHealthyProject(tmpDir);
      const io = createMockIO();

      runCI(tmpDir, {}, io);

      const auditsDir = path.join(tmpDir, ".framework", "audits");
      expect(fs.existsSync(auditsDir)).toBe(true);
      const files = fs.readdirSync(auditsDir);
      expect(files.some((f) => f.startsWith("ci-"))).toBe(true);
    });

    it("prints stage results to IO", () => {
      setupHealthyProject(tmpDir);
      const io = createMockIO();

      runCI(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("CI PIPELINE"))).toBe(true);
      expect(io.output.some((o) => o.includes("Lint & Type Check"))).toBe(true);
      expect(io.output.some((o) => o.includes("Verdict"))).toBe(true);
    });

    it("runs only specified stage", () => {
      setupHealthyProject(tmpDir);
      const io = createMockIO();

      const report = runCI(tmpDir, { stage: "lint" }, io);

      const lintStage = report.stages.find((s) => s.stage === "lint");
      const buildStage = report.stages.find((s) => s.stage === "build");
      expect(lintStage?.status).toBe("pass");
      expect(buildStage?.status).toBe("pending");
    });
  });

  describe("runCI --status", () => {
    it("shows message when no reports exist", () => {
      const io = createMockIO();
      const report = runCI(tmpDir, { status: true }, io);

      expect(report.verdict).toBe("not_ready");
      expect(io.output.some((o) => o.includes("No CI reports"))).toBe(true);
    });

    it("shows recent reports when they exist", () => {
      const existingReport: CIReport = {
        timestamp: "2026-02-03T12:00:00Z",
        branch: "main",
        commit: "abc12345",
        stages: [],
        allRequiredPassed: true,
        verdict: "ready",
        blockers: [],
      };
      saveCIReport(tmpDir, existingReport);

      const io = createMockIO();
      const report = runCI(tmpDir, { status: true }, io);

      expect(report.verdict).toBe("ready");
      expect(io.output.some((o) => o.includes("CI HISTORY"))).toBe(true);
      expect(io.output.some((o) => o.includes("READY"))).toBe(true);
    });
  });

  describe("runCI --checklist", () => {
    it("shows message when no reports exist", () => {
      const io = createMockIO();
      runCI(tmpDir, { checklist: true }, io);

      expect(io.output.some((o) => o.includes("No CI reports"))).toBe(true);
    });

    it("shows PR checklist from latest report", () => {
      // Run CI first to create a report
      setupHealthyProject(tmpDir);
      const io1 = createMockIO();
      runCI(tmpDir, {}, io1);

      // Then check the checklist
      const io2 = createMockIO();
      runCI(tmpDir, { checklist: true }, io2);

      expect(io2.output.some((o) => o.includes("PR CHECKLIST"))).toBe(true);
      expect(io2.output.some((o) => o.includes("Type check passed"))).toBe(true);
      expect(io2.output.some((o) => o.includes("[x]"))).toBe(true);
    });
  });

  describe("individual stage evaluation", () => {
    it("lint detects any type usage in source", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      fs.writeFileSync(path.join(tmpDir, "eslint.config.js"), "");
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(
        path.join(tmpDir, "src", "bad.ts"),
        "const x: any = 42;\n",
      );

      const io = createMockIO();
      const report = runCI(tmpDir, { stage: "lint" }, io);

      const lint = report.stages.find((s) => s.stage === "lint");
      expect(lint?.status).toBe("fail");
      expect(lint?.details.some((d) => d.includes("any"))).toBe(true);
    });

    it("security detects missing env in gitignore", () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules\n");

      const io = createMockIO();
      const report = runCI(tmpDir, { stage: "security" }, io);

      const security = report.stages.find((s) => s.stage === "security");
      expect(security?.status).toBe("fail");
      expect(security?.details.some((d) => d.includes(".env not in .gitignore"))).toBe(true);
    });
  });
});
