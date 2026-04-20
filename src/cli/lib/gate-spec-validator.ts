/**
 * Gate 0: Spec Validation — deterministic checks on spec-layer documents.
 *
 * Part of ADF v1.2.0 (#92, IMPL §3-1).
 *
 * Checks (all deterministic, NO LLM):
 * 1. Required sections exist: §1〜§8
 * 2. §7 (Acceptance Criteria) contains Gherkin (Given/When/Then)
 * 3. §6.3 STRIDE check (profile-dependent)
 * 4. Gate 0 threshold: CRITICAL=0 AND WARNING≤3 → PASS
 *
 * Principle #0: No LLM calls in this module.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type GateSpecResult } from "./trace-engine.js";
import { loadProfileType, type ProfileType } from "./profile-model.js";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Required sections (by number prefix). Order matches spec §1-§8. */
const REQUIRED_SECTIONS: { prefix: string; label: string }[] = [
  { prefix: "1", label: "目的" },
  { prefix: "2", label: "非目的" },
  { prefix: "3", label: "ユーザーストーリー" },
  { prefix: "4", label: "機能要件" },
  { prefix: "5", label: "インターフェース" },
  { prefix: "6", label: "非機能要件" },
  { prefix: "7", label: "受入基準" },
  { prefix: "8", label: "前提・依存" },
];

/** Gherkin keywords that must appear in §7. */
const GHERKIN_KEYWORDS = /\b(Given|When|Then)\b/;

/** STRIDE keyword — appears in §6.3 when STRIDE analysis is present. */
const STRIDE_SECTION_PATTERN = /§?6\.3|STRIDE/i;

/** N/A without a reason — "N/A" alone on a line or "N/A" not followed by reason text. */
const STRIDE_NA_BARE_PATTERN = /^\s*N\/A\s*$/m;

/** Profiles where STRIDE is mandatory. */
const STRIDE_MANDATORY_PROFILES: ProfileType[] = ["app", "api"];

/** WARNING threshold for Gate 0 PASS. */
const WARNING_THRESHOLD = 3;

// ─────────────────────────────────────────────
// Section extraction
// ─────────────────────────────────────────────

/**
 * Extract H2 sections from markdown content.
 * Returns array of { heading, body } for each ## section.
 */
function extractSections(
  content: string,
): { heading: string; body: string }[] {
  const lines = content.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let currentHeading: string | null = null;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (currentHeading !== null) {
        sections.push({ heading: currentHeading, body: bodyLines.join("\n") });
      }
      currentHeading = h2Match[1].trim();
      bodyLines = [];
    } else if (currentHeading !== null) {
      bodyLines.push(line);
    }
  }
  // Push last section
  if (currentHeading !== null) {
    sections.push({ heading: currentHeading, body: bodyLines.join("\n") });
  }

  return sections;
}

/**
 * Check if a heading matches a required section prefix.
 * Matches patterns like "§1", "1.", "1 ", "§1.", etc.
 */
function headingMatchesPrefix(heading: string, prefix: string): boolean {
  // Match §N, N., N followed by space/CJK, etc.
  const patterns = [
    new RegExp(`^§${prefix}\\b`),
    new RegExp(`^${prefix}\\.\\s`),
    new RegExp(`^${prefix}\\s`),
    new RegExp(`^${prefix}[.．]`),
  ];
  return patterns.some((p) => p.test(heading.trim()));
}

// ─────────────────────────────────────────────
// STRIDE check
// ─────────────────────────────────────────────

interface StrideCheckResult {
  found: boolean;
  isNaBare: boolean;
  sectionBody: string;
}

function checkStride(sections: { heading: string; body: string }[]): StrideCheckResult {
  // Look for §6.3 or STRIDE in heading or in §6 body
  for (const section of sections) {
    if (STRIDE_SECTION_PATTERN.test(section.heading)) {
      return {
        found: true,
        isNaBare: STRIDE_NA_BARE_PATTERN.test(section.body),
        sectionBody: section.body,
      };
    }
  }

  // Also check inside §6 body for ### 6.3 or STRIDE subsection
  for (const section of sections) {
    if (headingMatchesPrefix(section.heading, "6")) {
      const hasStrideSubsection =
        STRIDE_SECTION_PATTERN.test(section.body);
      if (hasStrideSubsection) {
        // Extract STRIDE subsection body
        const strideMatch = section.body.match(
          /(?:###\s*(?:§?6\.3|.*STRIDE.*))\n([\s\S]*?)(?=\n###|\n##|$)/i,
        );
        const strideBody = strideMatch ? strideMatch[1] : section.body;
        return {
          found: true,
          isNaBare: STRIDE_NA_BARE_PATTERN.test(strideBody),
          sectionBody: strideBody,
        };
      }
    }
  }

  return { found: false, isNaBare: false, sectionBody: "" };
}

// ─────────────────────────────────────────────
// Main validation
// ─────────────────────────────────────────────

/**
 * Validate a single spec-layer document against Gate 0 checks.
 *
 * @param specPath - Absolute path to a spec markdown file.
 * @param projectDir - Project root (for profile detection). Optional; defaults to cwd.
 * @returns GateSpecResult with status, critical findings, and warnings.
 */
export function validateSpec(
  specPath: string,
  projectDir?: string,
): GateSpecResult {
  const result: GateSpecResult = {
    status: "PASS",
    critical: [],
    warnings: [],
  };

  // Read file
  if (!fs.existsSync(specPath)) {
    result.critical.push({
      docId: path.basename(specPath),
      type: "MissingRequiredSection",
      message: `File not found: ${specPath}`,
    });
    result.status = "BLOCK";
    return result;
  }

  const content = fs.readFileSync(specPath, "utf-8");
  const docId = path.basename(specPath, ".md");
  const sections = extractSections(content);

  // ── Check 1: Required sections ──
  for (const req of REQUIRED_SECTIONS) {
    const found = sections.some((s) =>
      headingMatchesPrefix(s.heading, req.prefix),
    );
    if (!found) {
      // §7 missing is CRITICAL (separate type)
      if (req.prefix === "7") {
        result.critical.push({
          docId,
          type: "MissingAcceptanceCriteria",
          message: `§${req.prefix} ${req.label} is missing`,
        });
      } else {
        result.critical.push({
          docId,
          type: "MissingRequiredSection",
          message: `§${req.prefix} ${req.label} is missing`,
        });
      }
    }
  }

  // ── Check 2: §7 Gherkin content ──
  const section7 = sections.find((s) => headingMatchesPrefix(s.heading, "7"));
  if (section7) {
    if (!GHERKIN_KEYWORDS.test(section7.body)) {
      result.critical.push({
        docId,
        type: "MissingAcceptanceCriteria",
        message: "§7 受入基準 lacks Gherkin content (Given/When/Then)",
      });
    }
  }

  // ── Check 3: §6.3 STRIDE (profile-dependent) ──
  const effectiveProjectDir = projectDir ?? process.cwd();
  const profileType = loadProfileType(effectiveProjectDir);
  const isMandatory = profileType
    ? STRIDE_MANDATORY_PROFILES.includes(profileType)
    : true; // Default: mandatory if no profile

  const stride = checkStride(sections);

  if (!stride.found) {
    if (isMandatory) {
      result.warnings.push({
        docId,
        type: "STRIDE_Missing",
        message: "§6.3 STRIDE section not found (mandatory for this profile)",
      });
    } else {
      result.warnings.push({
        docId,
        type: "STRIDE_Missing",
        message: "§6.3 STRIDE section not found (optional for this profile)",
      });
    }
  } else if (stride.isNaBare) {
    if (isMandatory) {
      result.critical.push({
        docId,
        type: "STRIDE_NA_WithoutReason",
        message: '§6.3 STRIDE marked "N/A" without providing a reason',
      });
    } else {
      result.warnings.push({
        docId,
        type: "STRIDE_NA_WithoutReason",
        message: '§6.3 STRIDE marked "N/A" without reason (non-critical for this profile)',
      });
    }
  }

  // ── Check 4: Threshold ──
  if (result.critical.length > 0 || result.warnings.length > WARNING_THRESHOLD) {
    result.status = "BLOCK";
  }

  return result;
}

/**
 * Validate all spec documents in a directory.
 *
 * @param docsDir - Path to the docs/spec/ directory.
 * @param projectDir - Project root for profile detection.
 * @returns Aggregated GateSpecResult.
 */
export function validateAllSpecs(
  docsDir: string,
  projectDir?: string,
): GateSpecResult {
  const aggregated: GateSpecResult = {
    status: "PASS",
    critical: [],
    warnings: [],
  };

  if (!fs.existsSync(docsDir)) {
    return aggregated; // No spec dir → vacuous pass
  }

  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const specPath = path.join(docsDir, file);
    const result = validateSpec(specPath, projectDir);
    aggregated.critical.push(...result.critical);
    aggregated.warnings.push(...result.warnings);
  }

  // Aggregate threshold
  if (
    aggregated.critical.length > 0 ||
    aggregated.warnings.length > WARNING_THRESHOLD
  ) {
    aggregated.status = "BLOCK";
  }

  return aggregated;
}
