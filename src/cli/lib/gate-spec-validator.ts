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

/**
 * STRIDE keyword — used to test H2 headings like "§6.3 STRIDE" or "STRIDE Analysis".
 * Negative lookahead on §?6\.3 prevents a match against §6.3.2 (OWASP).
 */
const STRIDE_SECTION_PATTERN = /§?6\.3(?!\.\d)|\bSTRIDE\b/i;

/**
 * STRIDE H3 subsection pattern — used to detect a STRIDE subsection inside the
 * body of a §6 (or similar) H2 section. Must NOT match `### §6.3.2 OWASP`, which
 * is why the §?6\.3 alternative carries a negative lookahead and the STRIDE
 * alternative requires the keyword in the heading line itself (`### ... STRIDE`).
 */
const STRIDE_H3_HEADING_PATTERN = /^###\s*(?:§?6\.3(?!\.\d)|[^\n]*\bSTRIDE\b)/im;

/** OWASP keyword — appears in §6.3.2 when OWASP analysis is present. */
const OWASP_SECTION_PATTERN = /§?6\.3\.2|OWASP/i;

/** §6.3 section pattern — matches the entire security analysis section. */
const SECURITY_SECTION_63_PATTERN = /§?6\.3\b/;

/** N/A without a reason — "N/A" alone on a line or "N/A" not followed by reason text. */
const STRIDE_NA_BARE_PATTERN = /^\s*N\/A\s*$/m;

/** OWASP Top 10 items (A01-A10). */
const OWASP_ITEMS = [
  "A01", "A02", "A03", "A04", "A05",
  "A06", "A07", "A08", "A09", "A10",
];

/**
 * Pattern for an OWASP item marked N/A without reason.
 * Matches lines like "A01: N/A" or "- A01: N/A" but NOT "A01: N/A — reason here".
 * Also matches "A01: N/A" not followed by colon + text (i.e., bare N/A after item).
 */
const OWASP_NA_WITHOUT_REASON_PATTERN = /^\s*[-*]?\s*A\d{2}[^:]*:\s*N\/A\s*$/;

/** Profiles where STRIDE/OWASP is mandatory. */
const SECURITY_MANDATORY_PROFILES: ProfileType[] = ["app", "api"];

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
      const hasStrideSubsection = STRIDE_H3_HEADING_PATTERN.test(section.body);
      if (hasStrideSubsection) {
        // Extract STRIDE subsection body. The leading anchor mirrors
        // STRIDE_H3_HEADING_PATTERN so that "### §6.3.2 OWASP" is NOT classified
        // as a STRIDE subsection (auditor cycle X+1 fix).
        const strideMatch = section.body.match(
          /###\s*(?:§?6\.3(?!\.\d)|[^\n]*\bSTRIDE\b)[^\n]*\n([\s\S]*?)(?=\n###|\n##|$)/i,
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
// OWASP check
// ─────────────────────────────────────────────

interface OwaspCheckResult {
  found: boolean;
  bareNaItems: string[];
  sectionBody: string;
}

function checkOwasp(sections: { heading: string; body: string }[]): OwaspCheckResult {
  // Look for §6.3.2 or OWASP in heading
  for (const section of sections) {
    if (OWASP_SECTION_PATTERN.test(section.heading)) {
      return {
        found: true,
        bareNaItems: findBareNaOwaspItems(section.body),
        sectionBody: section.body,
      };
    }
  }

  // Also check inside §6 or §6.3 body for ### 6.3.2 or OWASP subsection
  for (const section of sections) {
    if (
      headingMatchesPrefix(section.heading, "6") ||
      STRIDE_SECTION_PATTERN.test(section.heading)
    ) {
      const hasOwaspSubsection = OWASP_SECTION_PATTERN.test(section.body);
      if (hasOwaspSubsection) {
        // Extract OWASP subsection body
        const owaspMatch = section.body.match(
          /(?:###\s*(?:§?6\.3\.2|.*OWASP.*))\n([\s\S]*?)(?=\n###|\n##|$)/i,
        );
        const owaspBody = owaspMatch ? owaspMatch[1] : section.body;
        return {
          found: true,
          bareNaItems: findBareNaOwaspItems(owaspBody),
          sectionBody: owaspBody,
        };
      }
    }
  }

  return { found: false, bareNaItems: [], sectionBody: "" };
}

/**
 * Find OWASP items (A01-A10) that are marked N/A without a reason.
 */
function findBareNaOwaspItems(body: string): string[] {
  const bareItems: string[] = [];
  const lines = body.split("\n");
  for (const line of lines) {
    if (OWASP_NA_WITHOUT_REASON_PATTERN.test(line)) {
      // Extract the item ID (A01-A10)
      const itemMatch = line.match(/A(\d{2})/);
      if (itemMatch) {
        const itemId = `A${itemMatch[1]}`;
        if (OWASP_ITEMS.includes(itemId)) {
          bareItems.push(itemId);
        }
      }
    }
  }
  return bareItems;
}

// ─────────────────────────────────────────────
// §6.3 section existence check
// ─────────────────────────────────────────────

function hasSection63(sections: { heading: string; body: string }[]): boolean {
  // Check for §6.3 in headings
  for (const section of sections) {
    if (SECURITY_SECTION_63_PATTERN.test(section.heading)) {
      return true;
    }
  }
  // Check inside §6 body for ### 6.3
  for (const section of sections) {
    if (headingMatchesPrefix(section.heading, "6")) {
      if (SECURITY_SECTION_63_PATTERN.test(section.body)) {
        return true;
      }
      // Also check if STRIDE or OWASP keywords exist in body (implies §6.3 content)
      if (STRIDE_SECTION_PATTERN.test(section.body) || OWASP_SECTION_PATTERN.test(section.body)) {
        return true;
      }
    }
  }
  return false;
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

  // ── Check 3: §6.3 Security section (profile-dependent) ──
  const effectiveProjectDir = projectDir ?? process.cwd();
  const profileType = loadProfileType(effectiveProjectDir);
  const isMandatory = profileType
    ? SECURITY_MANDATORY_PROFILES.includes(profileType)
    : true; // Default: mandatory if no profile

  // ── Check 3a: §6.3 section existence (BLOCKER 2) ──
  const section63Exists = hasSection63(sections);
  if (!section63Exists) {
    if (isMandatory) {
      result.critical.push({
        docId,
        type: "SecuritySection_Missing",
        message: "§6.3 security section is entirely absent (mandatory for app/api profile)",
      });
    } else {
      result.warnings.push({
        docId,
        type: "SecuritySection_Missing",
        message: "§6.3 security section not found (optional for this profile)",
      });
    }
  }

  // ── Check 3b: STRIDE (profile-dependent) ──
  const stride = checkStride(sections);

  if (!stride.found) {
    // Only add STRIDE_Missing if we didn't already flag the entire §6.3 as missing
    if (section63Exists) {
      if (isMandatory) {
        result.critical.push({
          docId,
          type: "STRIDE_Missing",
          message: "§6.3 STRIDE table not found (mandatory for app/api profile)",
        });
      } else {
        result.warnings.push({
          docId,
          type: "STRIDE_Missing",
          message: "§6.3 STRIDE section not found (optional for this profile)",
        });
      }
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

  // ── Check 3c: OWASP Top 10 (profile-dependent) ──
  const owasp = checkOwasp(sections);

  if (!owasp.found) {
    // Only add OWASP_Missing if we didn't already flag the entire §6.3 as missing
    if (section63Exists) {
      if (isMandatory) {
        result.critical.push({
          docId,
          type: "OWASP_Missing",
          message: "§6.3.2 OWASP Top 10 section not found (mandatory for app/api profile)",
        });
      } else {
        result.warnings.push({
          docId,
          type: "OWASP_Missing",
          message: "§6.3.2 OWASP Top 10 section not found (optional for this profile)",
        });
      }
    }
  } else if (owasp.bareNaItems.length > 0) {
    if (isMandatory) {
      result.critical.push({
        docId,
        type: "OWASP_NA_WithoutReason",
        message: `§6.3.2 OWASP items marked "N/A" without reason: ${owasp.bareNaItems.join(", ")}`,
      });
    } else {
      result.warnings.push({
        docId,
        type: "OWASP_NA_WithoutReason",
        message: `§6.3.2 OWASP items marked "N/A" without reason: ${owasp.bareNaItems.join(", ")} (non-critical for this profile)`,
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
