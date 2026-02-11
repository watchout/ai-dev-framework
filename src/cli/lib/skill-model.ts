/**
 * Skill model - Types and utilities for skill-create command
 * Based on: 09_TOOLCHAIN.md Section 10
 *
 * Skills are reusable patterns extracted from implementations.
 * Stored as markdown files in .claude/skills/ with a JSON index.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SkillCategory =
  | "implementation"
  | "testing"
  | "refactoring"
  | "debugging";

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  confidence: number;
  useCount: number;
  createdAt: string;
  source: string;
  trigger: string;
  steps: string[];
  template?: string;
  checklist: string[];
}

export interface SkillIndex {
  skills: Array<{
    id: string;
    name: string;
    category: SkillCategory;
    confidence: number;
    useCount: number;
  }>;
}

export interface PatternMatch {
  pattern: string;
  occurrences: number;
  files: string[];
  category: SkillCategory;
  confidence: number;
}

// ─────────────────────────────────────────────
// ID Generation
// ─────────────────────────────────────────────

export function generateSkillId(index: SkillIndex): string {
  const maxId = index.skills.reduce((max, s) => {
    const num = parseInt(s.id.replace("SKILL-", ""), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  const nextNum = maxId + 1;
  return `SKILL-${String(nextNum).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────
// Pattern Categorization
// ─────────────────────────────────────────────

export function categorizePattern(files: string[]): SkillCategory {
  const testCount = files.filter(
    (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__"),
  ).length;
  const debugCount = files.filter(
    (f) => f.includes("debug") || f.includes("logger") || f.includes("error"),
  ).length;
  const refactorCount = files.filter(
    (f) => f.includes("util") || f.includes("helper") || f.includes("shared"),
  ).length;

  if (testCount > files.length / 2) return "testing";
  if (debugCount > files.length / 2) return "debugging";
  if (refactorCount > files.length / 2) return "refactoring";
  return "implementation";
}

// ─────────────────────────────────────────────
// Confidence Calculation
// ─────────────────────────────────────────────

export function calculateConfidence(
  occurrences: number,
  fileCount: number,
): number {
  const occurrenceScore = Math.min(occurrences * 10, 50);
  const fileScore = Math.min(fileCount * 15, 50);
  return Math.min(occurrenceScore + fileScore, 100);
}

// ─────────────────────────────────────────────
// Markdown Formatting
// ─────────────────────────────────────────────

export function formatSkillMarkdown(skill: Skill): string {
  const lines: string[] = [];

  lines.push(`# ${skill.id}: ${skill.name}`);
  lines.push("");
  lines.push(`> Category: ${skill.category}`);
  lines.push(`> Confidence: ${skill.confidence}%`);
  lines.push(`> Use Count: ${skill.useCount}`);
  lines.push(`> Created: ${skill.createdAt}`);
  lines.push(`> Source: ${skill.source}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Trigger");
  lines.push("");
  lines.push(skill.trigger);
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  for (let i = 0; i < skill.steps.length; i++) {
    lines.push(`${i + 1}. ${skill.steps[i]}`);
  }
  lines.push("");

  if (skill.template) {
    lines.push("## Template");
    lines.push("");
    lines.push("```typescript");
    lines.push(skill.template);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Checklist");
  lines.push("");
  for (const item of skill.checklist) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const SKILLS_DIR = ".claude/skills";
const INDEX_FILE = "_index.json";

function ensureSkillsDir(projectDir: string): string {
  const dir = path.join(projectDir, SKILLS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function skillFileName(skill: Skill): string {
  const safeName = skill.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${skill.id}_${safeName}.md`;
}

export function saveSkill(projectDir: string, skill: Skill): void {
  const dir = ensureSkillsDir(projectDir);

  // Write markdown file
  const filename = skillFileName(skill);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, formatSkillMarkdown(skill), "utf-8");

  // Update index
  const index = loadSkillIndex(projectDir);
  const existing = index.skills.findIndex((s) => s.id === skill.id);
  const entry = {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    confidence: skill.confidence,
    useCount: skill.useCount,
  };

  if (existing >= 0) {
    index.skills[existing] = entry;
  } else {
    index.skills.push(entry);
  }

  const indexPath = path.join(dir, INDEX_FILE);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

export function loadSkillIndex(projectDir: string): SkillIndex {
  const indexPath = path.join(projectDir, SKILLS_DIR, INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return { skills: [] };
  }
  const content = fs.readFileSync(indexPath, "utf-8");
  return JSON.parse(content) as SkillIndex;
}

export function loadSkill(
  projectDir: string,
  id: string,
): Skill | null {
  const dir = path.join(projectDir, SKILLS_DIR);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((f) => f.startsWith(id));
  if (files.length === 0) return null;

  const content = fs.readFileSync(path.join(dir, files[0]), "utf-8");
  return parseSkillMarkdown(content, id);
}

// ─────────────────────────────────────────────
// Markdown Parsing
// ─────────────────────────────────────────────

function parseSkillMarkdown(content: string, id: string): Skill | null {
  const lines = content.split("\n");
  const titleMatch = lines[0]?.match(/^# (SKILL-\d+): (.+)$/);
  if (!titleMatch) return null;

  const name = titleMatch[2];
  const meta = extractMeta(lines);
  const trigger = extractSection(lines, "## Trigger");
  const steps = extractOrderedList(lines, "## Steps");
  const template = extractCodeBlock(lines, "## Template");
  const checklist = extractChecklist(lines, "## Checklist");

  return {
    id,
    name,
    category: (meta.category ?? "implementation") as SkillCategory,
    confidence: parseInt(meta.confidence ?? "0", 10),
    useCount: parseInt(meta.useCount ?? "0", 10),
    createdAt: meta.created ?? "",
    source: meta.source ?? "",
    trigger,
    steps,
    template: template || undefined,
    checklist,
  };
}

function extractMeta(
  lines: string[],
): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^> (\w[\w\s]*?):\s*(.+)$/);
    if (match) {
      const key = match[1].toLowerCase().replace(/\s+/g, "");
      meta[key] = match[2].replace(/%$/, "");
    }
  }
  return meta;
}

function extractSection(lines: string[], heading: string): string {
  const idx = lines.findIndex((l) => l.startsWith(heading));
  if (idx < 0) return "";
  const content: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    if (lines[i].trim()) content.push(lines[i].trim());
  }
  return content.join("\n");
}

function extractOrderedList(lines: string[], heading: string): string[] {
  const idx = lines.findIndex((l) => l.startsWith(heading));
  if (idx < 0) return [];
  const items: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    const match = lines[i].match(/^\d+\.\s+(.+)$/);
    if (match) items.push(match[1]);
  }
  return items;
}

function extractCodeBlock(lines: string[], heading: string): string {
  const idx = lines.findIndex((l) => l.startsWith(heading));
  if (idx < 0) return "";
  let inBlock = false;
  const content: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    if (lines[i].startsWith("```") && !inBlock) {
      inBlock = true;
      continue;
    }
    if (lines[i].startsWith("```") && inBlock) break;
    if (inBlock) content.push(lines[i]);
  }
  return content.join("\n");
}

function extractChecklist(lines: string[], heading: string): string[] {
  const idx = lines.findIndex((l) => l.startsWith(heading));
  if (idx < 0) return [];
  const items: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    const match = lines[i].match(/^- \[[ x]\]\s+(.+)$/);
    if (match) items.push(match[1]);
  }
  return items;
}
