/**
 * Coherence engine — SSOT-Implementation consistency checker
 *
 * Static analysis (no AI required) that checks:
 * - §5 API spec: endpoint paths + HTTP methods matched via grep in code
 * - §4 Data spec: physical column names matched via grep in code
 * - §9 Error handling: error codes matched via grep in code
 *
 * FEAT-201: Auto-ingest on modification
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { discoverSSOTs, parseSSOTSections } from "./modify-engine.js";
import { logger } from "./logger.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Divergence {
  section: string;
  type: "added" | "removed" | "changed";
  detail: string;
  severity: "critical" | "major" | "minor";
}

export interface CoherenceResult {
  featureId: string;
  ssotPath: string;
  status: "ok" | "diverged" | "skipped";
  divergences: Divergence[];
}

export interface CoherenceReport {
  checkedAt: string;
  results: CoherenceResult[];
  status: "coherent" | "diverged";
}

export interface CoherenceIO {
  print(message: string): void;
  printProgress(step: string, detail: string): void;
}

export function createCoherenceTerminalIO(): CoherenceIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    printProgress(step: string, detail: string): void {
      process.stdout.write(`  [${step}] ${detail}\n`);
    },
  };
}

// ─────────────────────────────────────────────
// Report Persistence
// ─────────────────────────────────────────────

const COHERENCE_REPORT_FILE = ".framework/coherence-report.json";

export function saveCoherenceReport(projectDir: string, report: CoherenceReport): void {
  const filePath = path.join(projectDir, COHERENCE_REPORT_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n");
}

export function loadCoherenceReport(projectDir: string): CoherenceReport | null {
  const filePath = path.join(projectDir, COHERENCE_REPORT_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as CoherenceReport;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Pattern Extractors
// ─────────────────────────────────────────────

interface ExtractedEndpoint {
  method: string;
  path: string;
}

/**
 * Extract API endpoints from §5 content.
 * Looks for patterns like: | POST | /api/v1/xxx |
 * or ### POST /api/v1/xxx
 */
export function extractEndpoints(section5Content: string): ExtractedEndpoint[] {
  const endpoints: ExtractedEndpoint[] = [];

  // Table format: | METHOD | /path |
  const tablePattern = /\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*(\/\S+)\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(section5Content)) !== null) {
    endpoints.push({
      method: match[1].toUpperCase(),
      path: match[2].replace(/\s+/g, ""),
    });
  }

  // Header format: #### POST /api/v1/xxx
  const headerPattern = /^#{1,6}\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/gim;
  while ((match = headerPattern.exec(section5Content)) !== null) {
    const ep = {
      method: match[1].toUpperCase(),
      path: match[2].replace(/\s+/g, ""),
    };
    // Avoid duplicates
    if (!endpoints.some((e) => e.method === ep.method && e.path === ep.path)) {
      endpoints.push(ep);
    }
  }

  return endpoints;
}

/**
 * Extract physical column/field names from §4 content.
 * Looks for table rows: | # | 項目名 | 物理名 | 型 | ...
 */
export function extractDataFields(section4Content: string): string[] {
  const fields: string[] = [];

  // Table rows with physical names (3rd column typically)
  const lines = section4Content.split("\n");
  let headerFound = false;
  let physicalNameIndex = -1;

  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;

    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);

    if (!headerFound) {
      // Find the header row with 物理名
      physicalNameIndex = cells.findIndex((c) =>
        c === "物理名" || c.toLowerCase() === "physical" || c.toLowerCase() === "column",
      );
      if (physicalNameIndex >= 0) {
        headerFound = true;
      }
      continue;
    }

    // Skip separator row
    if (cells.every((c) => /^[-:]+$/.test(c))) continue;

    if (physicalNameIndex >= 0 && physicalNameIndex < cells.length) {
      const fieldName = cells[physicalNameIndex].trim();
      if (fieldName && fieldName !== "-" && !fieldName.startsWith("[")) {
        fields.push(fieldName);
      }
    }
  }

  return fields;
}

/**
 * Extract error codes from §9 content.
 * Looks for patterns like: AUTH_001, VAL_001, SYS_001, ERR_xxx
 */
export function extractErrorCodes(section9Content: string): string[] {
  const codes: string[] = [];
  const pattern = /\b([A-Z]{2,}[_-]\d{3}|[A-Z]{2,}[_-][a-z_]+)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(section9Content)) !== null) {
    const code = match[1];
    // Filter out common false positives
    if (!code.startsWith("SS") && !code.startsWith("FR-") && !code.startsWith("TC-")) {
      if (!codes.includes(code)) {
        codes.push(code);
      }
    }
  }

  return codes;
}

// ─────────────────────────────────────────────
// Code Grep
// ─────────────────────────────────────────────

const SOURCE_GLOBS = [
  "src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx",
  "app/**/*.ts", "app/**/*.tsx",
  "pages/**/*.ts", "pages/**/*.tsx",
  "lib/**/*.ts", "lib/**/*.tsx",
  "prisma/**/*.prisma",
  "drizzle/**/*.ts",
];

const EXCLUDE_DIRS = [
  "node_modules", "dist", ".next", "__pycache__", ".git",
  "docs", "coverage", ".framework",
];

/**
 * Search for a pattern in source code files using grep.
 * Returns true if the pattern is found in any source file.
 */
export function grepInSource(projectDir: string, pattern: string): boolean {
  const excludeArgs = EXCLUDE_DIRS.flatMap((d) => ["--exclude-dir", d]);

  try {
    execFileSync("grep", [
      "-r", "-l", "-E",
      pattern,
      ...excludeArgs,
      ".",
    ], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    // grep returns exit code 1 when no matches
    return false;
  }
}

/**
 * Search for a pattern and return matching file paths.
 */
export function grepFilesInSource(projectDir: string, pattern: string): string[] {
  const excludeArgs = EXCLUDE_DIRS.flatMap((d) => ["--exclude-dir", d]);

  try {
    const result = execFileSync("grep", [
      "-r", "-l", "-E",
      pattern,
      ...excludeArgs,
      ".",
    ], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Core Pipeline
// ─────────────────────────────────────────────

export interface CoherenceOptions {
  projectDir: string;
  verbose?: boolean;
  io: CoherenceIO;
}

/**
 * Run SSOT-implementation coherence check (no AI needed).
 */
export function runCoherence(options: CoherenceOptions): CoherenceReport {
  const { projectDir, verbose = false, io } = options;

  // Validate .framework exists
  if (!fs.existsSync(path.join(projectDir, ".framework"))) {
    io.print("Error: Not a framework project (.framework not found)");
    return {
      checkedAt: new Date().toISOString(),
      results: [],
      status: "coherent",
    };
  }

  const ssots = discoverSSOTs(projectDir);
  if (ssots.length === 0) {
    io.print("No SSOTs to check in docs/design/features/.");
    return {
      checkedAt: new Date().toISOString(),
      results: [],
      status: "coherent",
    };
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  COHERENCE CHECK");
  io.print("━".repeat(38));
  io.print(`  SSOTs: ${ssots.length}`);
  io.print("");

  const results: CoherenceResult[] = [];

  for (const ssot of ssots) {
    io.printProgress("CHECK", `${ssot.featureId} (${ssot.filePath})`);

    const divergences: Divergence[] = [];

    // Check §5 API Spec
    const section5 = ssot.sections.get("§5");
    if (section5) {
      const endpoints = extractEndpoints(section5);
      if (verbose) {
        io.printProgress("§5", `Found ${endpoints.length} endpoints in SSOT`);
      }

      for (const ep of endpoints) {
        // Build grep pattern for the endpoint path
        const pathPattern = escapeForGrep(ep.path);
        const found = grepInSource(projectDir, pathPattern);

        if (!found) {
          divergences.push({
            section: "§5",
            type: "removed",
            detail: `${ep.method} ${ep.path} defined in SSOT but not found in code`,
            severity: "major",
          });
        }
      }
    }

    // Check §4 Data Spec
    const section4 = ssot.sections.get("§4");
    if (section4) {
      const fields = extractDataFields(section4);
      if (verbose) {
        io.printProgress("§4", `Found ${fields.length} data fields in SSOT`);
      }

      for (const field of fields) {
        // Search for the field name in code (case-sensitive)
        const found = grepInSource(projectDir, `\\b${escapeForGrep(field)}\\b`);

        if (!found) {
          divergences.push({
            section: "§4",
            type: "removed",
            detail: `Field '${field}' defined in SSOT §4 but not found in code`,
            severity: "minor",
          });
        }
      }
    }

    // Check §9 Error Handling
    const section9 = ssot.sections.get("§9");
    if (section9) {
      const errorCodes = extractErrorCodes(section9);
      if (verbose) {
        io.printProgress("§9", `Found ${errorCodes.length} error codes in SSOT`);
      }

      for (const code of errorCodes) {
        const found = grepInSource(projectDir, escapeForGrep(code));

        if (!found) {
          divergences.push({
            section: "§9",
            type: "removed",
            detail: `Error code '${code}' defined in SSOT §9 but not found in code`,
            severity: "minor",
          });
        }
      }
    }

    const status = divergences.length > 0 ? "diverged" as const : "ok" as const;

    if (status === "ok") {
      io.printProgress("OK", `${ssot.featureId}: coherent`);
    } else {
      io.printProgress("DIVERGED", `${ssot.featureId}: ${divergences.length} divergence(s)`);
      for (const d of divergences) {
        io.print(`    [${d.severity}] ${d.section}: ${d.detail}`);
      }
    }

    results.push({
      featureId: ssot.featureId,
      ssotPath: ssot.filePath,
      status,
      divergences,
    });
  }

  const overallStatus = results.some((r) => r.status === "diverged") ? "diverged" as const : "coherent" as const;

  const report: CoherenceReport = {
    checkedAt: new Date().toISOString(),
    results,
    status: overallStatus,
  };

  // Save report
  saveCoherenceReport(projectDir, report);

  // Summary
  io.print("");
  io.print("━".repeat(38));
  io.print("  COHERENCE SUMMARY");
  io.print("━".repeat(38));

  const okCount = results.filter((r) => r.status === "ok").length;
  const divergedCount = results.filter((r) => r.status === "diverged").length;
  const totalDivergences = results.reduce((sum, r) => sum + r.divergences.length, 0);

  if (overallStatus === "coherent") {
    io.print("  All SSOTs are coherent with implementation. ✓");
  } else {
    io.print(`  Coherent: ${okCount} | Diverged: ${divergedCount} | Total divergences: ${totalDivergences}`);
    io.print("");
    io.print("  Run 'framework coherence --auto-fix' to generate SSOT updates.");
  }

  io.print("");

  return report;
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function escapeForGrep(str: string): string {
  // Escape special regex characters for grep -E
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
