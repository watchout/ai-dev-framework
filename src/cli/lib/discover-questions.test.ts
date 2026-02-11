import { describe, it, expect } from "vitest";
import {
  STAGES,
  getStage,
  getQuestion,
  shouldShowQuestion,
} from "./discover-questions.js";

describe("discover-questions", () => {
  describe("STAGES", () => {
    it("has 5 stages", () => {
      expect(STAGES).toHaveLength(5);
    });

    it("stages are numbered 1-5", () => {
      expect(STAGES.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5]);
    });

    it("each stage has a title and purpose", () => {
      for (const stage of STAGES) {
        expect(stage.title).toBeTruthy();
        expect(stage.purpose).toBeTruthy();
        expect(stage.estimatedMinutes).toBeGreaterThan(0);
      }
    });

    it("each stage has at least one question", () => {
      for (const stage of STAGES) {
        expect(stage.questions.length).toBeGreaterThan(0);
      }
    });

    it("total questions across all stages is approximately 26", () => {
      const total = STAGES.reduce(
        (sum, s) => sum + s.questions.length,
        0,
      );
      expect(total).toBeGreaterThanOrEqual(20);
      expect(total).toBeLessThanOrEqual(30);
    });
  });

  describe("getStage", () => {
    it("returns stage by number", () => {
      const stage = getStage(1);
      expect(stage).toBeDefined();
      expect(stage?.title).toBe("Idea Core");
    });

    it("returns undefined for invalid stage", () => {
      expect(getStage(0)).toBeUndefined();
      expect(getStage(6)).toBeUndefined();
    });
  });

  describe("getQuestion", () => {
    it("finds question by ID", () => {
      const q = getQuestion("Q1-1");
      expect(q).toBeDefined();
      expect(q?.stage).toBe(1);
      expect(q?.required).toBe(true);
    });

    it("finds questions across stages", () => {
      expect(getQuestion("Q2-1")?.stage).toBe(2);
      expect(getQuestion("Q3-1")?.stage).toBe(3);
      expect(getQuestion("Q4-1")?.stage).toBe(4);
      expect(getQuestion("Q5-1")?.stage).toBe(5);
    });

    it("returns undefined for non-existent ID", () => {
      expect(getQuestion("Q99-99")).toBeUndefined();
    });
  });

  describe("shouldShowQuestion", () => {
    it("returns true for questions without conditions", () => {
      const q = getQuestion("Q1-1")!;
      expect(shouldShowQuestion(q, {})).toBe(true);
    });

    it("returns true when condition is met", () => {
      const q = getQuestion("Q2-5")!;
      expect(q.condition).toBeDefined();
      expect(
        shouldShowQuestion(q, { "Q2-4": "a) Using another tool/service" }),
      ).toBe(true);
    });

    it("returns false when condition is not met", () => {
      const q = getQuestion("Q2-5")!;
      expect(
        shouldShowQuestion(q, { "Q2-4": "b) Managing with Excel" }),
      ).toBe(false);
    });

    it("returns false when referenced answer is missing", () => {
      const q = getQuestion("Q2-5")!;
      expect(shouldShowQuestion(q, {})).toBe(false);
    });
  });

  describe("question structure", () => {
    it("all questions have required fields", () => {
      for (const stage of STAGES) {
        for (const q of stage.questions) {
          expect(q.id).toBeTruthy();
          expect(q.stage).toBe(stage.stage);
          expect(typeof q.required).toBe("boolean");
          expect(["free", "select", "confirm"]).toContain(q.type);
          expect(q.mappings).toBeDefined();
        }
      }
    });

    it("select questions have options", () => {
      for (const stage of STAGES) {
        for (const q of stage.questions) {
          if (q.type === "select") {
            expect(
              q.options,
              `${q.id} is select but has no options`,
            ).toBeDefined();
            expect(q.options!.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it("conditional questions reference valid question IDs", () => {
      for (const stage of STAGES) {
        for (const q of stage.questions) {
          if (q.condition) {
            const ref = getQuestion(q.condition.questionId);
            expect(
              ref,
              `${q.id} references non-existent ${q.condition.questionId}`,
            ).toBeDefined();
          }
        }
      }
    });

    it("question IDs follow naming convention", () => {
      for (const stage of STAGES) {
        for (const q of stage.questions) {
          expect(q.id).toMatch(/^Q\d+-\d+$/);
        }
      }
    });
  });
});
