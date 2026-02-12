import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  checkGateA,
  checkGateB,
  checkGateC,
  checkAllGates,
  checkSingleGate,
} from "./gate-engine.js";
import { loadGateState } from "./gate-model.js";

describe("gate-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-gate-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("checkGateA", () => {
    it("fails when no files exist", () => {
      const checks = checkGateA(tmpDir);
      expect(checks.length).toBeGreaterThan(0);
      const passed = checks.filter((c) => c.passed);
      // Nothing should pass in an empty directory
      expect(passed.length).toBe(0);
    });

    it("passes package.json check when file exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        "{}",
        "utf-8",
      );
      const checks = checkGateA(tmpDir);
      const pkgCheck = checks.find((c) => c.name.includes("package.json"));
      expect(pkgCheck?.passed).toBe(true);
    });

    it("passes node_modules check when dir exists", () => {
      fs.mkdirSync(path.join(tmpDir, "node_modules"));
      const checks = checkGateA(tmpDir);
      const nmCheck = checks.find((c) => c.name.includes("node_modules"));
      expect(nmCheck?.passed).toBe(true);
    });

    it("passes env check when .env exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".env"),
        "PORT=3000",
        "utf-8",
      );
      const checks = checkGateA(tmpDir);
      const envCheck = checks.find((c) => c.name.includes("Environment config"));
      expect(envCheck?.passed).toBe(true);
    });

    it("passes env check when .env.example exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".env.example"),
        "PORT=3000",
        "utf-8",
      );
      const checks = checkGateA(tmpDir);
      const envCheck = checks.find((c) => c.name.includes("Environment config"));
      expect(envCheck?.passed).toBe(true);
    });

    it("passes docker check when docker-compose.yml exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, "docker-compose.yml"),
        "version: '3'",
        "utf-8",
      );
      const checks = checkGateA(tmpDir);
      const dockerCheck = checks.find((c) => c.name.includes("Docker"));
      expect(dockerCheck?.passed).toBe(true);
    });

    it("passes CI check when .github/workflows exists", () => {
      fs.mkdirSync(path.join(tmpDir, ".github/workflows"), {
        recursive: true,
      });
      const checks = checkGateA(tmpDir);
      const ciCheck = checks.find((c) => c.name.includes("CI"));
      expect(ciCheck?.passed).toBe(true);
    });

    it("passes framework check when .framework/ exists", () => {
      fs.mkdirSync(path.join(tmpDir, ".framework"));
      const checks = checkGateA(tmpDir);
      const fwCheck = checks.find((c) => c.name.includes("Framework"));
      expect(fwCheck?.passed).toBe(true);
    });
  });

  describe("checkGateB", () => {
    it("fails when no plan exists", () => {
      const checks = checkGateB(tmpDir);
      const planCheck = checks.find((c) => c.name.includes("plan"));
      expect(planCheck?.passed).toBe(false);
    });

    it("passes when plan.json exists with waves", () => {
      const frameworkDir = path.join(tmpDir, ".framework");
      fs.mkdirSync(frameworkDir, { recursive: true });
      fs.writeFileSync(
        path.join(frameworkDir, "plan.json"),
        JSON.stringify({
          status: "generated",
          generatedAt: "2024-01-01",
          updatedAt: "2024-01-01",
          waves: [
            {
              number: 1,
              phase: "common",
              title: "Wave 1",
              features: [
                {
                  id: "F1",
                  name: "Feature 1",
                  priority: "P0",
                  size: "M",
                  type: "common",
                  dependencies: [],
                  dependencyCount: 0,
                },
              ],
            },
          ],
          circularDependencies: [],
        }),
        "utf-8",
      );

      const checks = checkGateB(tmpDir);
      const planCheck = checks.find((c) =>
        c.name.includes("Implementation plan"),
      );
      expect(planCheck?.passed).toBe(true);

      const featCheck = checks.find((c) =>
        c.name.includes("features"),
      );
      expect(featCheck?.passed).toBe(true);
    });

    it("passes project profile check when project.json exists", () => {
      const frameworkDir = path.join(tmpDir, ".framework");
      fs.mkdirSync(frameworkDir, { recursive: true });
      fs.writeFileSync(
        path.join(frameworkDir, "project.json"),
        JSON.stringify({ profileType: "app" }),
        "utf-8",
      );

      const checks = checkGateB(tmpDir);
      const profileCheck = checks.find((c) =>
        c.name.includes("Project profile"),
      );
      expect(profileCheck?.passed).toBe(true);
    });
  });

  describe("checkGateC", () => {
    it("fails when no SSOT files found", () => {
      const checks = checkGateC(tmpDir);
      expect(checks).toHaveLength(1);
      expect(checks[0].passed).toBe(false);
      expect(checks[0].message).toContain("No SSOT files found");
    });

    it("passes for SSOT with all required sections", () => {
      const ssotDir = path.join(tmpDir, "docs/design/features/common");
      fs.mkdirSync(ssotDir, { recursive: true });
      fs.writeFileSync(
        path.join(ssotDir, "AUTH-001_login.md"),
        [
          "# AUTH-001 Login",
          "",
          "## §3-E 入出力例",
          "### 正常系1",
          "Input: email, password",
          "Output: JWT token",
          "",
          "### 正常系2",
          "Input: valid email, password",
          "Output: user session",
          "",
          "### 異常系1",
          "Input: wrong password",
          "Output: 401 AUTH_INVALID",
          "",
          "## §3-F 境界値",
          "| Field | Min | Max |",
          "| email | 5 | 255 |",
          "| password | 8 | 128 |",
          "",
          "## §3-G 例外応答",
          "| Error | Code | Status |",
          "| AUTH_INVALID | 401 | Unauthorized |",
          "",
          "## §3-H Gherkin",
          "Scenario: Successful login",
          "  Given user exists",
          "  When login with correct credentials",
          "  Then receive JWT token",
        ].join("\n"),
        "utf-8",
      );

      const checks = checkGateC(tmpDir);
      expect(checks).toHaveLength(1);
      expect(checks[0].passed).toBe(true);
    });

    it("fails for SSOT missing required sections", () => {
      const ssotDir = path.join(tmpDir, "docs/design/features/common");
      fs.mkdirSync(ssotDir, { recursive: true });
      fs.writeFileSync(
        path.join(ssotDir, "AUTH-001_login.md"),
        [
          "# AUTH-001 Login",
          "",
          "## §3-E 入出力例",
          "Input: email",
          "Output: token",
          "",
          "## Scope",
          "Login functionality",
        ].join("\n"),
        "utf-8",
      );

      const checks = checkGateC(tmpDir);
      expect(checks).toHaveLength(1);
      expect(checks[0].passed).toBe(false);
      expect(checks[0].missingSections.length).toBeGreaterThan(0);
      // Should be missing §3-F, §3-G, §3-H
      expect(
        checks[0].missingSections.some((s) => s.includes("§3-F")),
      ).toBe(true);
    });

    it("scans multiple SSOT directories", () => {
      // Create files in different paths
      const paths = [
        "docs/design/features/common/AUTH-001.md",
        "docs/design/core/SSOT-2_UI.md",
      ];

      for (const relPath of paths) {
        const fullPath = path.join(tmpDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(
          fullPath,
          "# Minimal SSOT\n\n## §3-E 入出力例\nExample\n## §3-F 境界値\nBoundary\n## §3-G 例外応答\nException\n## §3-H Gherkin\nScenario: Test",
          "utf-8",
        );
      }

      const checks = checkGateC(tmpDir);
      expect(checks).toHaveLength(2);
    });

    it("ignores index and template files", () => {
      const ssotDir = path.join(tmpDir, "docs/design/features");
      fs.mkdirSync(ssotDir, { recursive: true });
      fs.writeFileSync(
        path.join(ssotDir, "_INDEX.md"),
        "# Index",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(ssotDir, "_TEMPLATE.md"),
        "# Template",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(ssotDir, "README.md"),
        "# README",
        "utf-8",
      );

      const checks = checkGateC(tmpDir);
      expect(checks).toHaveLength(1);
      expect(checks[0].passed).toBe(false);
      expect(checks[0].message).toContain("No SSOT files found");
    });
  });

  describe("checkAllGates", () => {
    it("saves state after checking all gates", () => {
      const result = checkAllGates(tmpDir);
      expect(result.allPassed).toBe(false);

      const loaded = loadGateState(tmpDir);
      expect(loaded).not.toBeNull();
    });

    it("returns allPassed false for empty project", () => {
      const result = checkAllGates(tmpDir);
      expect(result.allPassed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });

  describe("checkSingleGate", () => {
    it("checks only Gate A", () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        "{}",
        "utf-8",
      );
      const result = checkSingleGate(tmpDir, "A");
      const loaded = loadGateState(tmpDir);
      expect(loaded).not.toBeNull();
      // Gate A should have been checked
      expect(loaded!.gateA.checks.length).toBeGreaterThan(0);
      // Gate B should still be pending
      expect(loaded!.gateB.status).toBe("pending");
    });

    it("checks only Gate B", () => {
      const result = checkSingleGate(tmpDir, "B");
      const loaded = loadGateState(tmpDir);
      expect(loaded!.gateB.checks.length).toBeGreaterThan(0);
      expect(loaded!.gateA.status).toBe("pending");
    });

    it("checks only Gate C", () => {
      const result = checkSingleGate(tmpDir, "C");
      const loaded = loadGateState(tmpDir);
      expect(loaded!.gateC.checks.length).toBeGreaterThan(0);
      expect(loaded!.gateA.status).toBe("pending");
    });
  });
});
