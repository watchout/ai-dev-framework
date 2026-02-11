/**
 * Skill engine - Pattern detection and skill creation
 * Based on: 09_TOOLCHAIN.md Section 10
 *
 * Scans project files to detect reusable patterns,
 * presents them for confirmation, and generates SKILL.md files.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Skill,
  type SkillCategory,
  type SkillIndex,
  type PatternMatch,
  generateSkillId,
  categorizePattern,
  calculateConfidence,
  saveSkill,
  loadSkillIndex,
} from "./skill-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface SkillIO {
  print(message: string): void;
  ask(prompt: string): Promise<string>;
}

export interface SkillCreateOptions {
  from?: string;
  category?: SkillCategory;
  pattern?: string;
  instincts?: boolean;
}

export function createSkillTerminalIO(): SkillIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    async ask(prompt: string): Promise<string> {
      process.stdout.write(`${prompt} `);
      return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.once("data", (chunk: string) => {
          data = chunk.trim();
          resolve(data);
        });
      });
    },
  };
}

// ─────────────────────────────────────────────
// Pattern Detection
// ─────────────────────────────────────────────

interface FileInfo {
  relativePath: string;
  content: string;
}

function collectSourceFiles(
  projectDir: string,
  subdir: string = "src",
): FileInfo[] {
  const srcDir = path.join(projectDir, subdir);
  if (!fs.existsSync(srcDir)) return [];

  const files: FileInfo[] = [];
  walkDir(srcDir, projectDir, files);
  return files;
}

function walkDir(
  dir: string,
  rootDir: string,
  results: FileInfo[],
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, rootDir, results);
    } else if (isSourceFile(entry.name)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        results.push({
          relativePath: path.relative(rootDir, fullPath),
          content,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }
}

function isSourceFile(name: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(name) && !name.endsWith(".d.ts");
}

export function detectStructurePatterns(
  files: FileInfo[],
): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const suffixGroups = groupBySuffix(files);

  for (const [suffix, group] of Object.entries(suffixGroups)) {
    if (group.length >= 2) {
      const filePaths = group.map((f) => f.relativePath);
      patterns.push({
        pattern: `${suffix} file pattern`,
        occurrences: group.length,
        files: filePaths,
        category: categorizePattern(filePaths),
        confidence: calculateConfidence(group.length, group.length),
      });
    }
  }

  return patterns;
}

function groupBySuffix(
  files: FileInfo[],
): Record<string, FileInfo[]> {
  const groups: Record<string, FileInfo[]> = {};

  for (const file of files) {
    const basename = path.basename(file.relativePath);
    const suffixMatch = basename.match(
      /[-.](\w+)\.(ts|tsx|js|jsx)$/,
    );
    if (suffixMatch) {
      const suffix = suffixMatch[1];
      if (!groups[suffix]) groups[suffix] = [];
      groups[suffix].push(file);
    }
  }

  return groups;
}

export function detectImportPatterns(
  files: FileInfo[],
): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const importCounts: Record<string, string[]> = {};

  for (const file of files) {
    const imports = file.content.match(
      /^import\s+.*from\s+["']([^"']+)["']/gm,
    );
    if (!imports) continue;

    for (const imp of imports) {
      const moduleMatch = imp.match(/from\s+["']([^"']+)["']/);
      if (!moduleMatch) continue;
      const moduleName = moduleMatch[1];
      if (moduleName.startsWith(".")) continue;

      if (!importCounts[moduleName]) importCounts[moduleName] = [];
      importCounts[moduleName].push(file.relativePath);
    }
  }

  for (const [moduleName, usedIn] of Object.entries(importCounts)) {
    if (usedIn.length >= 3) {
      patterns.push({
        pattern: `Common import: ${moduleName}`,
        occurrences: usedIn.length,
        files: usedIn,
        category: categorizePattern(usedIn),
        confidence: calculateConfidence(usedIn.length, usedIn.length),
      });
    }
  }

  return patterns;
}

export function detectCodePatterns(
  files: FileInfo[],
): PatternMatch[] {
  const patterns: PatternMatch[] = [];

  // Detect error handling patterns
  const errorHandlingFiles = files.filter(
    (f) => f.content.includes("try {") || f.content.includes("catch ("),
  );
  if (errorHandlingFiles.length >= 2) {
    patterns.push({
      pattern: "Error handling pattern (try/catch)",
      occurrences: errorHandlingFiles.length,
      files: errorHandlingFiles.map((f) => f.relativePath),
      category: "debugging",
      confidence: calculateConfidence(
        errorHandlingFiles.length,
        errorHandlingFiles.length,
      ),
    });
  }

  // Detect validation patterns
  const validationFiles = files.filter(
    (f) =>
      f.content.includes("if (!") ||
      f.content.includes("throw new Error"),
  );
  if (validationFiles.length >= 2) {
    patterns.push({
      pattern: "Input validation pattern",
      occurrences: validationFiles.length,
      files: validationFiles.map((f) => f.relativePath),
      category: "implementation",
      confidence: calculateConfidence(
        validationFiles.length,
        validationFiles.length,
      ),
    });
  }

  return patterns;
}

// ─────────────────────────────────────────────
// Instinct Generation
// ─────────────────────────────────────────────

interface InstinctEntry {
  id: string;
  trigger: string;
  action: string;
  source: string;
}

function saveInstincts(
  projectDir: string,
  instincts: InstinctEntry[],
): void {
  const memoryDir = path.join(projectDir, ".claude", "memory");
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  const filePath = path.join(memoryDir, "instincts.json");
  let existing: InstinctEntry[] = [];
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    existing = JSON.parse(raw) as InstinctEntry[];
  }

  const merged = [...existing, ...instincts];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
}

// ─────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────

export async function runSkillCreate(
  projectDir: string,
  options: SkillCreateOptions,
  io: SkillIO,
): Promise<Skill[]> {
  io.print("\n  Skill Create");
  io.print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  io.print("  Scanning project for patterns...\n");

  const files = collectSourceFiles(projectDir);
  if (files.length === 0) {
    io.print("  No source files found in src/");
    return [];
  }
  io.print(`  Found ${files.length} source files`);

  // Detect patterns
  let allPatterns: PatternMatch[] = [];

  if (options.pattern) {
    const matchingFiles = files.filter(
      (f) => f.content.includes(options.pattern!) || f.relativePath.includes(options.pattern!),
    );
    if (matchingFiles.length > 0) {
      allPatterns.push({
        pattern: `Custom: ${options.pattern}`,
        occurrences: matchingFiles.length,
        files: matchingFiles.map((f) => f.relativePath),
        category: options.category ?? categorizePattern(matchingFiles.map((f) => f.relativePath)),
        confidence: calculateConfidence(matchingFiles.length, matchingFiles.length),
      });
    }
  } else {
    const structurePatterns = detectStructurePatterns(files);
    const importPatterns = detectImportPatterns(files);
    const codePatterns = detectCodePatterns(files);
    allPatterns = [...structurePatterns, ...importPatterns, ...codePatterns];
  }

  if (options.category) {
    allPatterns = allPatterns.filter((p) => p.category === options.category);
  }

  // Sort by confidence descending
  allPatterns.sort((a, b) => b.confidence - a.confidence);

  if (allPatterns.length === 0) {
    io.print("  No patterns detected.");
    return [];
  }

  io.print(`\n  Detected ${allPatterns.length} pattern(s):\n`);

  const index = loadSkillIndex(projectDir);
  const createdSkills: Skill[] = [];
  const instincts: InstinctEntry[] = [];

  for (const pattern of allPatterns) {
    io.print(`  Pattern: ${pattern.pattern}`);
    io.print(`    Files: ${pattern.files.length}`);
    io.print(`    Category: ${pattern.category}`);
    io.print(`    Confidence: ${pattern.confidence}%`);

    const answer = await io.ask("  Create skill? (y/n)");
    if (answer.toLowerCase() !== "y") continue;

    const skillId = generateSkillId(index);
    const skill: Skill = {
      id: skillId,
      name: pattern.pattern,
      category: pattern.category,
      confidence: pattern.confidence,
      useCount: 0,
      createdAt: new Date().toISOString(),
      source: pattern.files.slice(0, 3).join(", "),
      trigger: `When working with ${pattern.category} involving ${pattern.pattern}`,
      steps: [
        `Identify the ${pattern.pattern} in the codebase`,
        "Apply the established pattern consistently",
        "Verify the implementation follows project conventions",
      ],
      checklist: [
        "Pattern applied correctly",
        "Consistent with existing code",
        "Tests updated if needed",
      ],
    };

    saveSkill(projectDir, skill);
    index.skills.push({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      confidence: skill.confidence,
      useCount: skill.useCount,
    });
    createdSkills.push(skill);

    io.print(`  Created: ${skillId}\n`);

    if (options.instincts) {
      instincts.push({
        id: skillId,
        trigger: skill.trigger,
        action: skill.steps.join("; "),
        source: skill.source,
      });
    }
  }

  if (options.instincts && instincts.length > 0) {
    saveInstincts(projectDir, instincts);
    io.print(`  Saved ${instincts.length} instinct(s) to memory`);
  }

  io.print(`\n  Done: ${createdSkills.length} skill(s) created`);
  return createdSkills;
}
