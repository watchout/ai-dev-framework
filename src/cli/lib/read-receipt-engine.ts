/**
 * Read-receipt engine — 3-layer verification for spec read proof.
 *
 * Part of #64 (09_ENFORCEMENT §6).
 *
 * Layers:
 *   1. File hash: SHA-256 match
 *   2. Grounding: specific values extracted from spec
 *   3. Challenge: factual Q&A from spec middle sections
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types: required-reading.json schema
// ─────────────────────────────────────────────

export interface GroundingQuestion {
  question: string;
  expectedAnswer: string;
  matchType: "exact" | "contains" | "regex";
}

export interface Challenge {
  question: string;
  answerKey: string;
  matchType: "exact" | "contains" | "regex";
  sourceSection: string;
}

export interface RequiredReading {
  specFile: string;
  expectedHash: string;
  groundingQuestions: GroundingQuestion[];
  challenges: Challenge[];
}

export interface RequiredReadingConfig {
  version: string;
  generatedAt: string;
  readings: RequiredReading[];
}

// ─────────────────────────────────────────────
// Types: verification result
// ─────────────────────────────────────────────

export interface LayerResult {
  layer: 1 | 2 | 3;
  passed: boolean;
  details: string;
}

export interface ReceiptVerification {
  specFile: string;
  allPassed: boolean;
  layers: LayerResult[];
}

export interface ReadReceiptResult {
  allPassed: boolean;
  verifications: ReceiptVerification[];
}

// ─────────────────────────────────────────────
// Layer 1: File hash
// ─────────────────────────────────────────────

export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

function verifyFileHash(
  projectDir: string,
  reading: RequiredReading,
): LayerResult {
  const fullPath = path.join(projectDir, reading.specFile);
  if (!fs.existsSync(fullPath)) {
    return { layer: 1, passed: false, details: `File not found: ${reading.specFile}` };
  }
  const actualHash = computeFileHash(fullPath);
  const passed = actualHash === reading.expectedHash;
  return {
    layer: 1,
    passed,
    details: passed
      ? "Hash match"
      : `Hash mismatch: expected ${reading.expectedHash.slice(0, 8)}..., got ${actualHash.slice(0, 8)}...`,
  };
}

// ─────────────────────────────────────────────
// Layer 2: Grounding verification
// ─────────────────────────────────────────────

export function matchAnswer(
  actual: string,
  expected: string,
  matchType: "exact" | "contains" | "regex",
): boolean {
  switch (matchType) {
    case "exact":
      return actual.trim() === expected.trim();
    case "contains":
      return actual.toLowerCase().includes(expected.toLowerCase());
    case "regex":
      return new RegExp(expected, "i").test(actual);
  }
}

/**
 * Layer 2 verification — grounding text matching.
 *
 * Limitation: answers are matched against pre-computed expected values
 * from a config snapshot. If the spec has changed since config generation,
 * expected answers may be stale. Regenerate config when spec hash changes
 * (auto-update wired in sub-PR 2+ via read-receipts workflow).
 */
function verifyGrounding(
  answers: Map<string, string>,
  reading: RequiredReading,
): LayerResult {
  if (reading.groundingQuestions.length === 0) {
    return { layer: 2, passed: false, details: "No grounding questions defined — config must include questions" };
  }

  const failures: string[] = [];
  for (const q of reading.groundingQuestions) {
    const answer = answers.get(q.question);
    if (!answer) {
      failures.push(`Unanswered: "${q.question}"`);
      continue;
    }
    if (!matchAnswer(answer, q.expectedAnswer, q.matchType)) {
      failures.push(`Wrong answer for "${q.question}": got "${answer}", expected "${q.expectedAnswer}" (${q.matchType})`);
    }
  }

  return {
    layer: 2,
    passed: failures.length === 0,
    details: failures.length === 0
      ? `${reading.groundingQuestions.length} grounding questions passed`
      : failures.join("; "),
  };
}

// ─────────────────────────────────────────────
// Layer 3: Challenge verification
// ─────────────────────────────────────────────

function verifyChallenges(
  answers: Map<string, string>,
  reading: RequiredReading,
): LayerResult {
  if (reading.challenges.length === 0) {
    return { layer: 3, passed: false, details: "No challenges defined — config must include challenges" };
  }

  const failures: string[] = [];
  for (const c of reading.challenges) {
    const answer = answers.get(c.question);
    if (!answer) {
      failures.push(`Unanswered: "${c.question}"`);
      continue;
    }
    if (!matchAnswer(answer, c.answerKey, c.matchType)) {
      failures.push(`Wrong answer for "${c.question}" (source: ${c.sourceSection})`);
    }
  }

  return {
    layer: 3,
    passed: failures.length === 0,
    details: failures.length === 0
      ? `${reading.challenges.length} challenges passed`
      : failures.join("; "),
  };
}

// ─────────────────────────────────────────────
// Full verification
// ─────────────────────────────────────────────

export function verifyReadReceipt(
  projectDir: string,
  reading: RequiredReading,
  groundingAnswers: Map<string, string>,
  challengeAnswers: Map<string, string>,
): ReceiptVerification {
  const layer1 = verifyFileHash(projectDir, reading);
  const layer2 = verifyGrounding(groundingAnswers, reading);
  const layer3 = verifyChallenges(challengeAnswers, reading);

  return {
    specFile: reading.specFile,
    allPassed: layer1.passed && layer2.passed && layer3.passed,
    layers: [layer1, layer2, layer3],
  };
}

export function verifyAllReceipts(
  projectDir: string,
  config: RequiredReadingConfig,
  allAnswers: Map<string, Map<string, string>>,
): ReadReceiptResult {
  const verifications: ReceiptVerification[] = [];

  for (const reading of config.readings) {
    const answers = allAnswers.get(reading.specFile) ?? new Map();
    const v = verifyReadReceipt(projectDir, reading, answers, answers);
    verifications.push(v);
  }

  return {
    allPassed: verifications.every((v) => v.allPassed),
    verifications,
  };
}

// ─────────────────────────────────────────────
// Config persistence
// ─────────────────────────────────────────────

const CONFIG_FILE = ".framework/required-reading.json";

export function loadRequiredReading(
  projectDir: string,
): RequiredReadingConfig | null {
  const filePath = path.join(projectDir, CONFIG_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as RequiredReadingConfig;
  } catch {
    return null;
  }
}

export function saveRequiredReading(
  projectDir: string,
  config: RequiredReadingConfig,
): void {
  const filePath = path.join(projectDir, CONFIG_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

// ─────────────────────────────────────────────
// Challenge auto-generation from spec content
// ─────────────────────────────────────────────

interface ExtractedFact {
  section: string;
  question: string;
  answer: string;
}

function extractFactsFromSpec(content: string, specFile: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const lines = content.split("\n");
  let currentSection = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track section headers
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }

    // Extract table row facts (| key | value |)
    const tableMatch = line.match(/^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
    if (tableMatch && !line.includes("---") && !line.includes("Field")) {
      const key = tableMatch[1].trim();
      const value = tableMatch[2].trim();
      if (key && value && value !== "Value" && value !== "---") {
        facts.push({
          section: currentSection || specFile,
          question: `What is the ${key} defined in "${currentSection}"?`,
          answer: value,
        });
      }
    }

    // Extract definition patterns (key: value, key = value)
    const defMatch = line.match(/^[-*]\s*\*?\*?([^:=]+)\*?\*?\s*[:=]\s*(.+)/);
    if (defMatch) {
      const key = defMatch[1].trim().replace(/\*+/g, "");
      const value = defMatch[2].trim();
      if (key.length > 3 && key.length < 50 && value.length > 1 && value.length < 100) {
        facts.push({
          section: currentSection || specFile,
          question: `What is "${key}" in "${currentSection}"?`,
          answer: value,
        });
      }
    }
  }

  return facts;
}

export function generateReadingConfig(
  projectDir: string,
  specFiles: string[],
): RequiredReadingConfig {
  const readings: RequiredReading[] = [];

  for (const specFile of specFiles) {
    const fullPath = path.join(projectDir, specFile);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex");
    const facts = extractFactsFromSpec(content, specFile);

    // Pick grounding questions from first/last quarter (easily verifiable)
    const quarterLen = Math.floor(facts.length / 4);
    const groundingFacts = [
      ...facts.slice(0, Math.min(2, quarterLen || 1)),
      ...facts.slice(-Math.min(2, quarterLen || 1)),
    ].slice(0, 4);

    // Pick challenges from middle half (lost-in-middle mitigation)
    const middleStart = Math.floor(facts.length / 4);
    const middleEnd = Math.floor((facts.length * 3) / 4);
    const middleFacts = facts.slice(middleStart, middleEnd);
    const challengeFacts = middleFacts.slice(0, Math.min(3, middleFacts.length));

    readings.push({
      specFile,
      expectedHash: hash,
      groundingQuestions: groundingFacts.map((f) => ({
        question: f.question,
        expectedAnswer: f.answer,
        matchType: "contains" as const,
      })),
      challenges: challengeFacts.map((f) => ({
        question: f.question,
        answerKey: f.answer,
        matchType: "contains" as const,
        sourceSection: f.section,
      })),
    });
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    readings,
  };
}
