/**
 * Testing configuration model (ADR-010)
 *
 * Defines the 3-layer testing strategy (L1/L2/L3) and
 * smart tool recommendation based on detected tech stack.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface TestingLayerConfig {
  tool: string;
  database?: string;
  autoDetected: boolean;
  userApproved?: boolean;
}

export interface TestingConfig {
  l1: TestingLayerConfig;
  l2?: TestingLayerConfig;
  l3?: TestingLayerConfig;
}

export interface TestToolRecommendation {
  l1: { tool: string };
  l2: { tool: string; database: string } | null;
  l3: { tool: string } | null;
}

// ─────────────────────────────────────────────
// Smart recommendation
// ─────────────────────────────────────────────

interface DetectedStack {
  framework?: string;
  language?: string;
  database?: string;
  profileType?: string;
}

/**
 * Recommend test tools based on detected tech stack.
 */
export function recommendTestTools(stack: DetectedStack): TestToolRecommendation {
  const lang = stack.language?.toLowerCase() ?? "";
  const fw = stack.framework?.toLowerCase() ?? "";
  const db = stack.database?.toLowerCase() ?? "";
  const profile = stack.profileType?.toLowerCase() ?? "app";

  // Determine L1 tool
  let l1Tool = "vitest";
  if (lang.includes("python") || fw.includes("fastapi") || fw.includes("django")) {
    l1Tool = "pytest";
  } else if (fw.includes("react-native") || fw.includes("react native")) {
    l1Tool = "jest";
  }

  // Determine L2
  let l2: TestToolRecommendation["l2"] = null;
  if (profile === "lp" || profile === "hp") {
    // No L2 for landing/home pages
  } else if (lang.includes("python") || fw.includes("fastapi")) {
    l2 = { tool: "pytest", database: db.includes("supabase") ? "supabase-test" : "docker-postgres" };
  } else if (db || fw.includes("nuxt") || fw.includes("next") || fw.includes("express") || fw.includes("hono") || fw.includes("fastify")) {
    const database = db.includes("supabase") ? "supabase-test" : "docker-postgres";
    l2 = { tool: l1Tool, database };
  } else if (profile === "api" || profile === "app") {
    l2 = { tool: l1Tool, database: "docker-postgres" };
  }

  // Determine L3 (no L3 for cli, api, lp, hp, script profiles)
  let l3: TestToolRecommendation["l3"] = null;
  if (profile !== "lp" && profile !== "hp" && profile !== "cli" && profile !== "api") {
    if (fw.includes("react-native") || fw.includes("react native")) {
      l3 = { tool: "detox" };
    } else if (profile === "app" || fw.includes("nuxt") || fw.includes("next")) {
      l3 = { tool: "browser-use" };
    }
  }

  return { l1: { tool: l1Tool }, l2, l3 };
}

/**
 * Convert recommendation to TestingConfig.
 */
export function recommendationToConfig(rec: TestToolRecommendation): TestingConfig {
  const config: TestingConfig = {
    l1: { tool: rec.l1.tool, autoDetected: true },
  };

  if (rec.l2) {
    config.l2 = {
      tool: rec.l2.tool,
      database: rec.l2.database,
      autoDetected: true,
    };
  }

  if (rec.l3) {
    config.l3 = {
      tool: rec.l3.tool,
      autoDetected: true,
    };
  }

  return config;
}

// ─────────────────────────────────────────────
// Persistence (read/write testing section in project.json)
// ─────────────────────────────────────────────

const PROJECT_JSON = ".framework/project.json";

export function loadTestingConfig(projectDir: string): TestingConfig | null {
  const filePath = path.join(projectDir, PROJECT_JSON);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return (raw.testing as TestingConfig) ?? null;
  } catch {
    return null;
  }
}

export function saveTestingConfig(projectDir: string, config: TestingConfig): void {
  const filePath = path.join(projectDir, PROJECT_JSON);
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    raw.testing = config;
    raw.updatedAt = new Date().toISOString();
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(raw, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.rmSync(filePath + ".tmp", { force: true }); } catch { /* ignore */ }
    throw err;
  }
}
