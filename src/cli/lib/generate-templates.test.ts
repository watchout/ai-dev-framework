import { describe, it, expect } from "vitest";
import {
  generateIdeaCanvas,
  generateUserPersona,
  generateCompetitorAnalysis,
  generateValueProposition,
  generatePRD,
  generateFeatureCatalog,
  TEMPLATE_GENERATORS,
  EXPECTED_COMPLETENESS,
} from "./generate-templates.js";

/** Sample discover answers for testing */
const SAMPLE_ANSWERS: Record<string, string> = {
  "Q1-1": "An AI-powered expense tracker",
  "Q1-2": "Frustrated with manual expense tracking",
  "Q1-4": "Expensify, Freee",
  "Q2-1": "Small business owners aged 30-50",
  "Q2-2": "Spending 3+ hours monthly on expense reports",
  "Q2-3": "a) Struggling every day",
  "Q2-4": "a) Using another tool/service",
  "Q2-5": "Too expensive and complicated",
  "Q2-6": "c) Only my own experience",
  "Q3-1": "AI auto-categorize receipts from photos",
  "Q3-2": "Receipt scanning, Auto-categorize, Monthly reports",
  "Q3-4": "Open app -> Snap receipt -> Auto-categorize -> View report",
  "Q3-5": "a) Web app",
  "Q4-1": "Expensify, Freee, Money Forward",
  "Q4-2": "AI accuracy with minimal setup, zero learning curve",
  "Q4-3": "AI cost reduction, mobile-first trend",
  "Q5-1": "c) Freemium",
  "Q5-3": "b) About 100 users",
  "Q5-4": "a) Myself (including AI tools)",
  "Q5-5": "a) Professional engineer",
  "Q5-6": "Next.js, Supabase, Vercel",
  "Q5-7": "b) 1-3 months",
  "Q5-8": "c) Want to focus on development",
};

describe("generate-templates", () => {
  describe("TEMPLATE_GENERATORS", () => {
    it("has generators for all 6 documents", () => {
      expect(Object.keys(TEMPLATE_GENERATORS)).toHaveLength(6);
    });

    it("keys match EXPECTED_COMPLETENESS keys", () => {
      const genKeys = Object.keys(TEMPLATE_GENERATORS).sort();
      const compKeys = Object.keys(EXPECTED_COMPLETENESS).sort();
      expect(genKeys).toEqual(compKeys);
    });
  });

  describe("generateIdeaCanvas", () => {
    it("includes elevator pitch from Q1-1", () => {
      const result = generateIdeaCanvas(SAMPLE_ANSWERS);
      expect(result).toContain("An AI-powered expense tracker");
    });

    it("includes origin from Q1-2", () => {
      const result = generateIdeaCanvas(SAMPLE_ANSWERS);
      expect(result).toContain("Frustrated with manual expense tracking");
    });

    it("includes target users from Q2-1", () => {
      const result = generateIdeaCanvas(SAMPLE_ANSWERS);
      expect(result).toContain("Small business owners aged 30-50");
    });

    it("maps severity correctly", () => {
      const result = generateIdeaCanvas(SAMPLE_ANSWERS);
      expect(result).toContain("High (daily pain)");
    });

    it("maps validation correctly", () => {
      const result = generateIdeaCanvas(SAMPLE_ANSWERS);
      expect(result).toContain("Own experience only");
    });

    it("includes references from Q1-4", () => {
      const result = generateIdeaCanvas(SAMPLE_ANSWERS);
      expect(result).toContain("Expensify, Freee");
    });

    it("uses TBD for missing answers", () => {
      const result = generateIdeaCanvas({});
      expect(result).toContain("TBD");
    });
  });

  describe("generateUserPersona", () => {
    it("includes target user from Q2-1", () => {
      const result = generateUserPersona(SAMPLE_ANSWERS);
      expect(result).toContain("Small business owners aged 30-50");
    });

    it("includes pain point from Q2-2", () => {
      const result = generateUserPersona(SAMPLE_ANSWERS);
      expect(result).toContain(
        "Spending 3+ hours monthly on expense reports",
      );
    });

    it("includes current workaround from Q2-4", () => {
      const result = generateUserPersona(SAMPLE_ANSWERS);
      expect(result).toContain("a) Using another tool/service");
    });

    it("has sections for secondary persona and anti-persona", () => {
      const result = generateUserPersona(SAMPLE_ANSWERS);
      expect(result).toContain("Secondary Persona");
      expect(result).toContain("Anti-Persona");
    });
  });

  describe("generateCompetitorAnalysis", () => {
    it("includes competitors from Q4-1", () => {
      const result = generateCompetitorAnalysis(SAMPLE_ANSWERS);
      expect(result).toContain("Expensify, Freee, Money Forward");
    });

    it("includes differentiator from Q4-2", () => {
      const result = generateCompetitorAnalysis(SAMPLE_ANSWERS);
      expect(result).toContain("AI accuracy with minimal setup");
    });

    it("includes reference services from Q1-4", () => {
      const result = generateCompetitorAnalysis(SAMPLE_ANSWERS);
      expect(result).toContain("Expensify, Freee");
    });

    it("has feature comparison matrix placeholder", () => {
      const result = generateCompetitorAnalysis(SAMPLE_ANSWERS);
      expect(result).toContain("Feature Comparison Matrix");
    });
  });

  describe("generateValueProposition", () => {
    it("includes customer jobs from Q2-1 and Q2-2", () => {
      const result = generateValueProposition(SAMPLE_ANSWERS);
      expect(result).toContain("Small business owners");
      expect(result).toContain("Spending 3+ hours");
    });

    it("includes solution approach from Q3-1", () => {
      const result = generateValueProposition(SAMPLE_ANSWERS);
      expect(result).toContain("AI auto-categorize");
    });

    it("includes competitive comparison from Q4-2", () => {
      const result = generateValueProposition(SAMPLE_ANSWERS);
      expect(result).toContain("AI accuracy with minimal setup");
    });

    it("has fit analysis section", () => {
      const result = generateValueProposition(SAMPLE_ANSWERS);
      expect(result).toContain("Fit Analysis");
    });
  });

  describe("generatePRD", () => {
    it("includes product vision from Q1-1", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("An AI-powered expense tracker");
    });

    it("includes MVP features from Q3-2", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("Receipt scanning");
    });

    it("maps platform correctly", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("Web app (browser)");
    });

    it("maps timeline correctly", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("1-3 months (standard MVP)");
    });

    it("maps team structure correctly", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("Solo (with AI tools)");
    });

    it("includes user flow from Q3-4", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("Snap receipt");
    });

    it("has out of scope section", () => {
      const result = generatePRD(SAMPLE_ANSWERS);
      expect(result).toContain("Out of Scope");
    });
  });

  describe("generateFeatureCatalog", () => {
    it("includes features from Q3-2", () => {
      const result = generateFeatureCatalog(SAMPLE_ANSWERS);
      expect(result).toContain("Receipt scanning");
    });

    it("has classification criteria section", () => {
      const result = generateFeatureCatalog(SAMPLE_ANSWERS);
      expect(result).toContain("Classification Criteria");
    });

    it("has dependency graph section", () => {
      const result = generateFeatureCatalog(SAMPLE_ANSWERS);
      expect(result).toContain("Dependency Graph");
    });

    it("has implementation order section", () => {
      const result = generateFeatureCatalog(SAMPLE_ANSWERS);
      expect(result).toContain("Implementation Order");
    });
  });

  describe("empty answers handling", () => {
    it("all generators handle empty answers without throwing", () => {
      for (const [, generator] of Object.entries(TEMPLATE_GENERATORS)) {
        expect(() => generator({})).not.toThrow();
      }
    });

    it("all generators produce TBD for missing data", () => {
      for (const [, generator] of Object.entries(TEMPLATE_GENERATORS)) {
        const result = generator({});
        expect(result).toContain("TBD");
      }
    });
  });
});
