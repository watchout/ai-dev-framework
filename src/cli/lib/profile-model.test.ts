import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type ProfileType,
  PROFILE_TYPES,
  getProfile,
  isValidProfileType,
  isTemplateEnabled,
  isAuditEnabled,
  getDiscoveryStages,
  inferProfileType,
  loadProfileType,
  loadProjectProfile,
} from "./profile-model.js";

describe("profile-model", () => {
  // ─────────────────────────────────────────────
  // Profile Access
  // ─────────────────────────────────────────────

  describe("PROFILE_TYPES", () => {
    it("contains exactly 5 types", () => {
      expect(PROFILE_TYPES).toHaveLength(5);
      expect(PROFILE_TYPES).toEqual(["app", "lp", "hp", "api", "cli"]);
    });
  });

  describe("getProfile", () => {
    it("returns app profile", () => {
      const profile = getProfile("app");
      expect(profile.id).toBe("app");
      expect(profile.name).toBe("Full-stack Application");
      expect(profile.enabledSsot).toHaveLength(6);
      expect(profile.discoveryStages).toEqual([1, 2, 3, 4, 5]);
    });

    it("returns lp profile", () => {
      const profile = getProfile("lp");
      expect(profile.id).toBe("lp");
      expect(profile.name).toBe("Landing Page");
      expect(profile.enabledSsot).toEqual(["SSOT-0_PRD", "SSOT-2_UI_STATE"]);
      expect(profile.discoveryStages).toEqual([1, 2, 3]);
      expect(profile.marketing).toBe("required");
    });

    it("returns hp profile", () => {
      const profile = getProfile("hp");
      expect(profile.id).toBe("hp");
      expect(profile.discoveryStages).toEqual([1, 2]);
      expect(profile.defaultTechStack.backend).toBeNull();
    });

    it("returns api profile", () => {
      const profile = getProfile("api");
      expect(profile.id).toBe("api");
      expect(profile.enabledSsot).toContain("SSOT-3_API_CONTRACT");
      expect(profile.enabledSsot).toContain("SSOT-4_DATA_MODEL");
      expect(profile.enabledSsot).not.toContain("SSOT-2_UI_STATE");
      expect(profile.marketing).toBe("none");
    });

    it("returns cli profile", () => {
      const profile = getProfile("cli");
      expect(profile.id).toBe("cli");
      expect(profile.enabledAudit).toEqual(["code", "test"]);
      expect(profile.defaultTechStack.cli_framework).toBeDefined();
    });

    it("all profiles have required fields", () => {
      for (const type of PROFILE_TYPES) {
        const profile = getProfile(type);
        expect(profile.id).toBe(type);
        expect(profile.name).toBeTruthy();
        expect(profile.description).toBeTruthy();
        expect(Array.isArray(profile.enabledSsot)).toBe(true);
        expect(Array.isArray(profile.enabledAudit)).toBe(true);
        expect(Array.isArray(profile.discoveryStages)).toBe(true);
        expect(Array.isArray(profile.freezeRequired)).toBe(true);
        expect(Array.isArray(profile.requiredTemplates)).toBe(true);
        expect(Array.isArray(profile.skipTemplates)).toBe(true);
        expect(Array.isArray(profile.directories)).toBe(true);
        expect(profile.defaultTechStack).toBeDefined();
      }
    });
  });

  describe("isValidProfileType", () => {
    it("returns true for valid types", () => {
      for (const type of PROFILE_TYPES) {
        expect(isValidProfileType(type)).toBe(true);
      }
    });

    it("returns false for invalid types", () => {
      expect(isValidProfileType("invalid")).toBe(false);
      expect(isValidProfileType("")).toBe(false);
      expect(isValidProfileType("APP")).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // Template Filtering
  // ─────────────────────────────────────────────

  describe("isTemplateEnabled", () => {
    it("app profile enables all templates", () => {
      const profile = getProfile("app");
      expect(
        isTemplateEnabled(profile, "docs/idea/IDEA_CANVAS.md"),
      ).toBe(true);
      expect(
        isTemplateEnabled(profile, "docs/requirements/SSOT-0_PRD.md"),
      ).toBe(true);
      expect(
        isTemplateEnabled(profile, "docs/design/core/SSOT-2_UI_STATE.md"),
      ).toBe(true);
      expect(
        isTemplateEnabled(profile, "docs/management/PROJECT_PLAN.md"),
      ).toBe(true);
    });

    it("lp profile skips SSOT-1 through SSOT-5 (except SSOT-2)", () => {
      const profile = getProfile("lp");
      expect(
        isTemplateEnabled(
          profile,
          "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
        ),
      ).toBe(false);
      expect(
        isTemplateEnabled(
          profile,
          "docs/design/core/SSOT-3_API_CONTRACT.md",
        ),
      ).toBe(false);
      expect(
        isTemplateEnabled(
          profile,
          "docs/design/core/SSOT-4_DATA_MODEL.md",
        ),
      ).toBe(false);
      expect(
        isTemplateEnabled(
          profile,
          "docs/design/core/SSOT-5_CROSS_CUTTING.md",
        ),
      ).toBe(false);
    });

    it("lp profile enables required templates", () => {
      const profile = getProfile("lp");
      expect(
        isTemplateEnabled(profile, "docs/idea/IDEA_CANVAS.md"),
      ).toBe(true);
      expect(
        isTemplateEnabled(profile, "docs/requirements/SSOT-0_PRD.md"),
      ).toBe(true);
      expect(
        isTemplateEnabled(profile, "docs/design/core/SSOT-2_UI_STATE.md"),
      ).toBe(true);
      expect(
        isTemplateEnabled(profile, "docs/marketing/LP_SPEC.md"),
      ).toBe(true);
    });

    it("lp profile skips operations/ and growth/", () => {
      const profile = getProfile("lp");
      expect(
        isTemplateEnabled(profile, "docs/operations/DEPLOYMENT.md"),
      ).toBe(false);
      expect(
        isTemplateEnabled(profile, "docs/growth/GROWTH_STRATEGY.md"),
      ).toBe(false);
    });

    it("hp profile skips USER_PERSONA and COMPETITOR_ANALYSIS", () => {
      const profile = getProfile("hp");
      expect(
        isTemplateEnabled(profile, "docs/idea/USER_PERSONA.md"),
      ).toBe(false);
      expect(
        isTemplateEnabled(profile, "docs/idea/COMPETITOR_ANALYSIS.md"),
      ).toBe(false);
      expect(
        isTemplateEnabled(profile, "docs/idea/VALUE_PROPOSITION.md"),
      ).toBe(false);
    });

    it("api profile skips SSOT-2_UI_STATE", () => {
      const profile = getProfile("api");
      expect(
        isTemplateEnabled(
          profile,
          "docs/design/core/SSOT-2_UI_STATE.md",
        ),
      ).toBe(false);
    });

    it("api profile enables SSOT-3 and SSOT-4", () => {
      const profile = getProfile("api");
      expect(
        isTemplateEnabled(
          profile,
          "docs/design/core/SSOT-3_API_CONTRACT.md",
        ),
      ).toBe(true);
      expect(
        isTemplateEnabled(
          profile,
          "docs/design/core/SSOT-4_DATA_MODEL.md",
        ),
      ).toBe(true);
    });

    it("cli profile skips marketing/ and growth/", () => {
      const profile = getProfile("cli");
      expect(
        isTemplateEnabled(profile, "docs/marketing/LP_SPEC.md"),
      ).toBe(false);
      expect(
        isTemplateEnabled(profile, "docs/growth/GROWTH_STRATEGY.md"),
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // Audit Filtering
  // ─────────────────────────────────────────────

  describe("isAuditEnabled", () => {
    it("app profile enables all audit modes", () => {
      const profile = getProfile("app");
      expect(isAuditEnabled(profile, "ssot")).toBe(true);
      expect(isAuditEnabled(profile, "prompt")).toBe(true);
      expect(isAuditEnabled(profile, "code")).toBe(true);
      expect(isAuditEnabled(profile, "test")).toBe(true);
      expect(isAuditEnabled(profile, "visual")).toBe(true);
      expect(isAuditEnabled(profile, "acceptance")).toBe(true);
    });

    it("lp profile only enables code and visual", () => {
      const profile = getProfile("lp");
      expect(isAuditEnabled(profile, "code")).toBe(true);
      expect(isAuditEnabled(profile, "visual")).toBe(true);
      expect(isAuditEnabled(profile, "ssot")).toBe(false);
      expect(isAuditEnabled(profile, "prompt")).toBe(false);
    });

    it("api profile only enables code and test", () => {
      const profile = getProfile("api");
      expect(isAuditEnabled(profile, "code")).toBe(true);
      expect(isAuditEnabled(profile, "test")).toBe(true);
      expect(isAuditEnabled(profile, "visual")).toBe(false);
      expect(isAuditEnabled(profile, "ssot")).toBe(false);
    });

    it("cli profile only enables code and test", () => {
      const profile = getProfile("cli");
      expect(isAuditEnabled(profile, "code")).toBe(true);
      expect(isAuditEnabled(profile, "test")).toBe(true);
      expect(isAuditEnabled(profile, "visual")).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // Discovery Stages
  // ─────────────────────────────────────────────

  describe("getDiscoveryStages", () => {
    it("app has all 5 stages", () => {
      expect(getDiscoveryStages(getProfile("app"))).toEqual([1, 2, 3, 4, 5]);
    });

    it("lp has stages 1-3", () => {
      expect(getDiscoveryStages(getProfile("lp"))).toEqual([1, 2, 3]);
    });

    it("hp has stages 1-2", () => {
      expect(getDiscoveryStages(getProfile("hp"))).toEqual([1, 2]);
    });

    it("api has stages 1-3", () => {
      expect(getDiscoveryStages(getProfile("api"))).toEqual([1, 2, 3]);
    });

    it("cli has stages 1-3", () => {
      expect(getDiscoveryStages(getProfile("cli"))).toEqual([1, 2, 3]);
    });
  });

  // ─────────────────────────────────────────────
  // Auto-detection
  // ─────────────────────────────────────────────

  describe("inferProfileType", () => {
    it("detects CLI from description", () => {
      expect(inferProfileType("A CLI tool for managing tasks")).toBe("cli");
      expect(inferProfileType("command line interface")).toBe("cli");
      expect(inferProfileType("コマンドラインツール")).toBe("cli");
    });

    it("detects API from description", () => {
      expect(inferProfileType("REST API for user management")).toBe("api");
      expect(inferProfileType("Backend service")).toBe("api");
      expect(inferProfileType("バックエンドサービス")).toBe("api");
      expect(inferProfileType("Server-side application")).toBe("api");
    });

    it("detects landing page from description", () => {
      expect(inferProfileType("Landing page for product launch")).toBe("lp");
      expect(inferProfileType("LP for pre-launch campaign")).toBe("lp");
      expect(inferProfileType("ランディングページ")).toBe("lp");
    });

    it("detects homepage from description", () => {
      expect(inferProfileType("Corporate homepage")).toBe("hp");
      expect(inferProfileType("Company website homepage")).toBe("hp");
      expect(inferProfileType("コーポレートサイト")).toBe("hp");
      expect(inferProfileType("ホームページ作成")).toBe("hp");
    });

    it("defaults to app for generic descriptions", () => {
      expect(inferProfileType("A web application for task management")).toBe(
        "app",
      );
      expect(inferProfileType("SaaS platform")).toBe("app");
      expect(inferProfileType("E-commerce store")).toBe("app");
      expect(inferProfileType("")).toBe("app");
    });

    it("is case-insensitive", () => {
      expect(inferProfileType("CLI Tool")).toBe("cli");
      expect(inferProfileType("REST API")).toBe("api");
      expect(inferProfileType("Landing Page")).toBe("lp");
    });
  });

  // ─────────────────────────────────────────────
  // State Persistence
  // ─────────────────────────────────────────────

  describe("loadProfileType / loadProjectProfile", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-profile-"));
      fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns null when no project.json exists", () => {
      expect(loadProfileType(tmpDir)).toBeNull();
      expect(loadProjectProfile(tmpDir)).toBeNull();
    });

    it("loads profileType from project.json", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework/project.json"),
        JSON.stringify({ profileType: "cli" }),
        "utf-8",
      );

      expect(loadProfileType(tmpDir)).toBe("cli");
    });

    it("loads full profile from project.json", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework/project.json"),
        JSON.stringify({ profileType: "api" }),
        "utf-8",
      );

      const profile = loadProjectProfile(tmpDir);
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe("api");
      expect(profile?.name).toBe("API / Backend Service");
    });

    it("returns null for invalid profileType in project.json", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework/project.json"),
        JSON.stringify({ profileType: "invalid" }),
        "utf-8",
      );

      expect(loadProfileType(tmpDir)).toBeNull();
    });

    it("returns null for missing profileType field", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework/project.json"),
        JSON.stringify({ name: "test" }),
        "utf-8",
      );

      expect(loadProfileType(tmpDir)).toBeNull();
    });

    it("handles corrupted JSON gracefully", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework/project.json"),
        "not json",
        "utf-8",
      );

      expect(loadProfileType(tmpDir)).toBeNull();
    });

    it("loads each profile type correctly", () => {
      for (const type of PROFILE_TYPES) {
        fs.writeFileSync(
          path.join(tmpDir, ".framework/project.json"),
          JSON.stringify({ profileType: type }),
          "utf-8",
        );

        expect(loadProfileType(tmpDir)).toBe(type);
        const profile = loadProjectProfile(tmpDir);
        expect(profile?.id).toBe(type);
      }
    });
  });

  // ─────────────────────────────────────────────
  // Profile Data Integrity
  // ─────────────────────────────────────────────

  describe("profile data integrity", () => {
    it("all enabledSsot entries are valid SSOT names", () => {
      const validSsots = [
        "SSOT-0_PRD",
        "SSOT-1_FEATURE_CATALOG",
        "SSOT-2_UI_STATE",
        "SSOT-3_API_CONTRACT",
        "SSOT-4_DATA_MODEL",
        "SSOT-5_CROSS_CUTTING",
      ];

      for (const type of PROFILE_TYPES) {
        const profile = getProfile(type);
        for (const ssot of profile.enabledSsot) {
          expect(validSsots).toContain(ssot);
        }
      }
    });

    it("all discoveryStages are between 1 and 5", () => {
      for (const type of PROFILE_TYPES) {
        const profile = getProfile(type);
        for (const stage of profile.discoveryStages) {
          expect(stage).toBeGreaterThanOrEqual(1);
          expect(stage).toBeLessThanOrEqual(5);
        }
      }
    });

    it("freezeRequired is a subset of discoveryStages", () => {
      for (const type of PROFILE_TYPES) {
        const profile = getProfile(type);
        for (const freeze of profile.freezeRequired) {
          expect(profile.discoveryStages).toContain(freeze);
        }
      }
    });

    it("marketing field is valid", () => {
      for (const type of PROFILE_TYPES) {
        const profile = getProfile(type);
        expect(["required", "optional", "none"]).toContain(profile.marketing);
      }
    });

    it("directories are non-empty for all profiles", () => {
      for (const type of PROFILE_TYPES) {
        const profile = getProfile(type);
        expect(profile.directories.length).toBeGreaterThan(0);
      }
    });
  });
});
