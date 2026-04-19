import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  computeFileHash,
  matchAnswer,
  verifyReadReceipt,
  verifyAllReceipts,
  generateReadingConfig,
  loadRequiredReading,
  saveRequiredReading,
  type RequiredReading,
  type RequiredReadingConfig,
} from "./read-receipt-engine.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-receipt-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSpec(name: string, content: string): string {
  const specPath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, content, "utf-8");
  return name;
}

// ─────────────────────────────────────────────
// computeFileHash
// ─────────────────────────────────────────────

describe("computeFileHash", () => {
  it("returns consistent SHA-256 hash", () => {
    const specPath = path.join(tmpDir, "test.md");
    fs.writeFileSync(specPath, "hello world");
    const hash1 = computeFileHash(specPath);
    const hash2 = computeFileHash(specPath);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("changes when file content changes", () => {
    const specPath = path.join(tmpDir, "test.md");
    fs.writeFileSync(specPath, "version 1");
    const hash1 = computeFileHash(specPath);
    fs.writeFileSync(specPath, "version 2");
    const hash2 = computeFileHash(specPath);
    expect(hash1).not.toBe(hash2);
  });
});

// ─────────────────────────────────────────────
// matchAnswer
// ─────────────────────────────────────────────

describe("matchAnswer", () => {
  it("exact match", () => {
    expect(matchAnswer("80%", "80%", "exact")).toBe(true);
    expect(matchAnswer("80%", "90%", "exact")).toBe(false);
  });

  it("contains match (case-insensitive)", () => {
    expect(matchAnswer("The threshold is 80% for L1", "80%", "contains")).toBe(true);
    expect(matchAnswer("auto-rollback is triggered", "auto-rollback", "contains")).toBe(true);
    expect(matchAnswer("something else", "80%", "contains")).toBe(false);
  });

  it("regex match", () => {
    expect(matchAnswer("exit code 2", "exit.*2", "regex")).toBe(true);
    expect(matchAnswer("exit code 0", "exit.*2", "regex")).toBe(false);
  });
});

// ─────────────────────────────────────────────
// verifyReadReceipt
// ─────────────────────────────────────────────

describe("verifyReadReceipt", () => {
  it("passes all 3 layers with correct data", () => {
    const specFile = writeSpec("docs/spec.md", "# Test Spec\ncontent here");
    const hash = computeFileHash(path.join(tmpDir, specFile));

    const reading: RequiredReading = {
      specFile,
      expectedHash: hash,
      groundingQuestions: [
        { question: "What is the title?", expectedAnswer: "Test Spec", matchType: "contains" },
      ],
      challenges: [
        { question: "What follows the title?", answerKey: "content here", matchType: "contains", sourceSection: "§1" },
      ],
    };

    const answers = new Map([
      ["What is the title?", "Test Spec"],
      ["What follows the title?", "content here"],
    ]);

    const result = verifyReadReceipt(tmpDir, reading, answers, answers);
    expect(result.allPassed).toBe(true);
    expect(result.layers).toHaveLength(3);
    expect(result.layers.every((l) => l.passed)).toBe(true);
  });

  it("fails Layer 1 on hash mismatch", () => {
    writeSpec("docs/spec.md", "original");

    const reading: RequiredReading = {
      specFile: "docs/spec.md",
      expectedHash: "wrong-hash",
      groundingQuestions: [],
      challenges: [],
    };

    const result = verifyReadReceipt(tmpDir, reading, new Map(), new Map());
    expect(result.allPassed).toBe(false);
    expect(result.layers[0].passed).toBe(false);
    expect(result.layers[0].details).toContain("mismatch");
  });

  it("fails Layer 1 on missing file", () => {
    const reading: RequiredReading = {
      specFile: "nonexistent.md",
      expectedHash: "abc",
      groundingQuestions: [],
      challenges: [],
    };

    const result = verifyReadReceipt(tmpDir, reading, new Map(), new Map());
    expect(result.layers[0].passed).toBe(false);
    expect(result.layers[0].details).toContain("not found");
  });

  it("fails Layer 2 on wrong grounding answer", () => {
    const specFile = writeSpec("docs/spec.md", "content");
    const hash = computeFileHash(path.join(tmpDir, specFile));

    const reading: RequiredReading = {
      specFile,
      expectedHash: hash,
      groundingQuestions: [
        { question: "Q1", expectedAnswer: "correct", matchType: "exact" },
      ],
      challenges: [],
    };

    const answers = new Map([["Q1", "wrong"]]);
    const result = verifyReadReceipt(tmpDir, reading, answers, new Map());
    expect(result.layers[1].passed).toBe(false);
  });

  it("fails Layer 3 on unanswered challenge", () => {
    const specFile = writeSpec("docs/spec.md", "content");
    const hash = computeFileHash(path.join(tmpDir, specFile));

    const reading: RequiredReading = {
      specFile,
      expectedHash: hash,
      groundingQuestions: [],
      challenges: [
        { question: "Hard question", answerKey: "answer", matchType: "contains", sourceSection: "§1" },
      ],
    };

    const result = verifyReadReceipt(tmpDir, reading, new Map(), new Map());
    expect(result.layers[2].passed).toBe(false);
    expect(result.layers[2].details).toContain("Unanswered");
  });
});

// ─────────────────────────────────────────────
// generateReadingConfig
// ─────────────────────────────────────────────

describe("generateReadingConfig", () => {
  it("generates config from spec files with table data", () => {
    writeSpec("docs/specs/test.md", `# Quality Check

## 1. Checklist

| Category | Threshold |
|---|---|
| Coverage | 80% |
| Lint | 0 errors |
| Type check | clean |

## 2. Details

- Maximum retry: 3 times
- Timeout: 30 seconds
- Mode: strict

## 3. Notes

Some notes here.
`);

    const config = generateReadingConfig(tmpDir, ["docs/specs/test.md"]);
    expect(config.version).toBe("1.0");
    expect(config.readings).toHaveLength(1);

    const reading = config.readings[0];
    expect(reading.specFile).toBe("docs/specs/test.md");
    expect(reading.expectedHash).toHaveLength(64);
    expect(reading.groundingQuestions.length).toBeGreaterThan(0);
  });

  it("skips nonexistent files", () => {
    const config = generateReadingConfig(tmpDir, ["nonexistent.md"]);
    expect(config.readings).toHaveLength(0);
  });

  it("generates challenges from middle sections", () => {
    const lines = [];
    lines.push("# Spec");
    for (let i = 0; i < 20; i++) {
      lines.push(`## Section ${i}`);
      lines.push(`| Key${i} | Value${i} |`);
    }
    writeSpec("docs/big.md", lines.join("\n"));

    const config = generateReadingConfig(tmpDir, ["docs/big.md"]);
    const reading = config.readings[0];
    // Should have both grounding (from edges) and challenges (from middle)
    expect(reading.groundingQuestions.length).toBeGreaterThan(0);
    expect(reading.challenges.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Config persistence
// ─────────────────────────────────────────────

describe("config persistence", () => {
  it("saves and loads required-reading.json", () => {
    const config: RequiredReadingConfig = {
      version: "1.0",
      generatedAt: "2026-04-20T00:00:00Z",
      readings: [
        {
          specFile: "docs/test.md",
          expectedHash: "abc123",
          groundingQuestions: [],
          challenges: [],
        },
      ],
    };

    saveRequiredReading(tmpDir, config);
    const loaded = loadRequiredReading(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.readings).toHaveLength(1);
    expect(loaded!.readings[0].specFile).toBe("docs/test.md");
  });

  it("returns null for missing config", () => {
    expect(loadRequiredReading(tmpDir)).toBeNull();
  });
});
