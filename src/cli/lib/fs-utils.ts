import * as fs from "node:fs";
import * as path from "node:path";

export const DEFAULT_IGNORED_DIRS = [
  "node_modules",
  "dist",
  ".framework",
  ".git",
];

export function walkDir(
  dir: string,
  pattern: RegExp,
  ignoredDirs: string[] = DEFAULT_IGNORED_DIRS,
): string[] {
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, pattern, ignoredDirs));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

export function walkJsonFiles(dir: string): string[] {
  return walkDir(dir, /\.json$/);
}

export function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path.basename(filePath));
}
