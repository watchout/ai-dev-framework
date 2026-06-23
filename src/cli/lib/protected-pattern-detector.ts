/**
 * Protected pattern detector for CI Gate 0 tier auto-promotion.
 *
 * Scans git diff content (file paths + code) for protected categories
 * and upgrades the declared tier to Full when any match is found.
 * Ref: #363, #366
 */

export type ProtectedCategory =
  | "auth"
  | "db"
  | "public-api"
  | "routing"
  | "runtime"
  | "deploy"
  | "governance";

export interface DetectionResult {
  hasProtectedPatterns: boolean;
  categories: ProtectedCategory[];
  matchedLines: string[];
}

interface CategoryRule {
  category: ProtectedCategory;
  pathPatterns: RegExp[];
  codePatterns: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "auth",
    pathPatterns: [/auth/i, /session/i, /credential/i, /permission/i, /token/i],
    codePatterns: [
      /password/i,
      /token/i,
      /secret/i,
      /credential/i,
      /encrypt/i,
      /auth[^o]/i,
      /permission/i,
      /session/i,
    ],
  },
  {
    category: "db",
    pathPatterns: [/migration/i, /schema/i, /database/i],
    codePatterns: [
      /ALTER\s+TABLE/i,
      /DROP\s+TABLE/i,
      /DROP\s+COLUMN/i,
      /CREATE\s+TABLE/i,
      /migration/i,
    ],
  },
  {
    category: "public-api",
    pathPatterns: [/public[_/-]api/i, /mcp[_/-]tool/i, /external[_/-]protocol/i],
    codePatterns: [/mcp.*tool/i, /public.*api/i, /external.*protocol/i],
  },
  {
    category: "routing",
    pathPatterns: [/router/i, /routes?/i, /queue/i, /dispatcher/i],
    codePatterns: [/agent.*rout/i, /queue.*lifecycle/i, /recovery.complete/i],
  },
  {
    category: "runtime",
    pathPatterns: [/process[_/-]lifecycle/i, /runtime[_/-]adapter/i, /transport/i],
    codePatterns: [/process\.lifecycle/i, /runtime.*adapter/i, /live.*transport/i],
  },
  {
    category: "deploy",
    pathPatterns: [/deploy/i, /billing/i, /pricing/i],
    codePatterns: [/production.*deploy/i, /billing/i, /pricing/i],
  },
  {
    category: "governance",
    pathPatterns: [/governance/i, /branch[_-]protection/i, /gate[_-]bypass/i],
    codePatterns: [
      /governance[-_.]?flow/i,
      /branch[-_.]?protection/i,
      /gate[-_.]?bypass/i,
      /merge[-_.]?authority/i,
    ],
  },
];

/**
 * Scans a unified diff string (as produced by `git diff`) for protected patterns.
 * Checks both file path headers (+++ lines) and changed code lines (+ lines).
 */
export function detectProtectedPatterns(diff: string): DetectionResult {
  const lines = diff.split("\n");
  const detectedCategories = new Set<ProtectedCategory>();
  const matchedLines: string[] = [];

  for (const line of lines) {
    const isFilePath = line.startsWith("+++") || line.startsWith("---");
    const isAddedLine = line.startsWith("+") && !line.startsWith("+++");
    const isRemovedLine = line.startsWith("-") && !line.startsWith("---");

    if (!isFilePath && !isAddedLine && !isRemovedLine) continue;

    const content = isFilePath ? line.replace(/^[+-]{3}\s+[ab]\//, "") : line.slice(1);

    for (const rule of CATEGORY_RULES) {
      const patterns = isFilePath ? rule.pathPatterns : rule.codePatterns;
      if (patterns.some((p) => p.test(content))) {
        if (!detectedCategories.has(rule.category)) {
          matchedLines.push(line.slice(0, 120));
        }
        detectedCategories.add(rule.category);
      }
    }
  }

  const categories = Array.from(detectedCategories);
  return {
    hasProtectedPatterns: categories.length > 0,
    categories,
    matchedLines,
  };
}

/**
 * Formats a detection result as a human-readable warning block.
 * Emits "WARNING: protected pattern detected → upgrading to Full tier" when triggered.
 */
export function formatDetectionWarning(result: DetectionResult): string {
  if (!result.hasProtectedPatterns) return "";

  const lines: string[] = [
    "WARNING: protected pattern detected → upgrading to Full tier",
    `Categories: ${result.categories.join(", ")}`,
  ];

  if (result.matchedLines.length > 0) {
    lines.push("Matched lines:");
    for (const ml of result.matchedLines.slice(0, 5)) {
      lines.push(`  ${ml}`);
    }
    if (result.matchedLines.length > 5) {
      lines.push(`  ... and ${result.matchedLines.length - 5} more`);
    }
  }

  return lines.join("\n");
}
