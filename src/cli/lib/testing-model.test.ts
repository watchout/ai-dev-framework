/**
 * Tests for testing-model.ts (ADR-010)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  recommendTestTools,
  recommendationToConfig,
  loadTestingConfig,
  saveTestingConfig,
  type TestingConfig,
} from "./testing-model.js";

// ─────────────────────────────────────────────
// recommendTestTools
// ─────────────────────────────────────────────

describe("recommendTestTools", () => {
  it("recommends vitest + docker-postgres + browser-use for Nuxt3 app", () => {
    const rec = recommendTestTools({
      framework: "Nuxt3",
      database: "PostgreSQL",
      language: "TypeScript",
      profileType: "app",
    });
    expect(rec.l1.tool).toBe("vitest");
    expect(rec.l2?.tool).toBe("vitest");
    expect(rec.l2?.database).toBe("docker-postgres");
    expect(rec.l3?.tool).toBe("browser-use");
  });

  it("recommends jest for React Native", () => {
    const rec = recommendTestTools({
      framework: "React Native",
      language: "TypeScript",
      profileType: "app",
    });
    expect(rec.l1.tool).toBe("jest");
    expect(rec.l3?.tool).toBe("detox");
  });

  it("recommends pytest for FastAPI", () => {
    const rec = recommendTestTools({
      framework: "FastAPI",
      language: "Python",
      database: "PostgreSQL",
      profileType: "api",
    });
    expect(rec.l1.tool).toBe("pytest");
    expect(rec.l2?.tool).toBe("pytest");
    expect(rec.l2?.database).toBe("docker-postgres");
    expect(rec.l3).toBeNull();
  });

  it("recommends supabase-test for Supabase projects", () => {
    const rec = recommendTestTools({
      framework: "Next.js",
      database: "Supabase",
      profileType: "app",
    });
    expect(rec.l2?.database).toBe("supabase-test");
  });

  it("skips L2/L3 for lp profile even with framework", () => {
    const rec = recommendTestTools({
      framework: "Next.js",
      profileType: "lp",
    });
    expect(rec.l1.tool).toBe("vitest");
    expect(rec.l2).toBeNull();
    expect(rec.l3).toBeNull();
  });

  it("skips L3 for cli profile", () => {
    const rec = recommendTestTools({
      language: "TypeScript",
      profileType: "cli",
    });
    expect(rec.l1.tool).toBe("vitest");
    expect(rec.l3).toBeNull();
  });

  it("defaults to vitest for unknown stack", () => {
    const rec = recommendTestTools({});
    expect(rec.l1.tool).toBe("vitest");
  });

  it("recommends L2 for Express projects", () => {
    const rec = recommendTestTools({
      framework: "Express",
      profileType: "api",
    });
    expect(rec.l2).not.toBeNull();
  });

  it("recommends browser-use for Next.js app", () => {
    const rec = recommendTestTools({
      framework: "Next.js",
      profileType: "app",
    });
    expect(rec.l3?.tool).toBe("browser-use");
  });
});

// ─────────────────────────────────────────────
// recommendationToConfig
// ─────────────────────────────────────────────

describe("recommendationToConfig", () => {
  it("converts full recommendation to config", () => {
    const config = recommendationToConfig({
      l1: { tool: "vitest" },
      l2: { tool: "vitest", database: "docker-postgres" },
      l3: { tool: "browser-use" },
    });
    expect(config.l1.tool).toBe("vitest");
    expect(config.l1.autoDetected).toBe(true);
    expect(config.l2?.tool).toBe("vitest");
    expect(config.l2?.database).toBe("docker-postgres");
    expect(config.l3?.tool).toBe("browser-use");
  });

  it("omits null layers", () => {
    const config = recommendationToConfig({
      l1: { tool: "vitest" },
      l2: null,
      l3: null,
    });
    expect(config.l1.tool).toBe("vitest");
    expect(config.l2).toBeUndefined();
    expect(config.l3).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

describe("loadTestingConfig / saveTestingConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-model-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    // Create a minimal project.json
    fs.writeFileSync(
      path.join(tmpDir, ".framework/project.json"),
      JSON.stringify({ name: "test", profileType: "app" }, null, 2),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no testing config exists", () => {
    expect(loadTestingConfig(tmpDir)).toBeNull();
  });

  it("saves and loads testing config", () => {
    const config: TestingConfig = {
      l1: { tool: "vitest", autoDetected: true },
      l2: { tool: "vitest", database: "docker-postgres", autoDetected: true },
    };
    saveTestingConfig(tmpDir, config);

    const loaded = loadTestingConfig(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.l1.tool).toBe("vitest");
    expect(loaded!.l2?.database).toBe("docker-postgres");
  });

  it("preserves existing project.json fields", () => {
    saveTestingConfig(tmpDir, {
      l1: { tool: "pytest", autoDetected: true },
    });

    const raw = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".framework/project.json"), "utf-8"),
    );
    expect(raw.name).toBe("test");
    expect(raw.profileType).toBe("app");
    expect(raw.testing.l1.tool).toBe("pytest");
  });

  it("returns null when project.json does not exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-empty-"));
    try {
      expect(loadTestingConfig(emptyDir)).toBeNull();
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("uses atomic write (no .tmp left)", () => {
    saveTestingConfig(tmpDir, {
      l1: { tool: "vitest", autoDetected: true },
    });
    expect(
      fs.existsSync(path.join(tmpDir, ".framework/project.json.tmp")),
    ).toBe(false);
  });
});
