import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type AuditIO,
  runAudit,
  auditSSOT,
  auditPrompt,
  auditCode,
} from "./audit-engine.js";

function createMockIO(): AuditIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("audit-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-audit-engine-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runAudit", () => {
    it("returns error for missing target", async () => {
      const io = createMockIO();
      const result = await runAudit({
        projectDir: tmpDir,
        io,
        mode: "ssot",
        targetPath: "nonexistent.md",
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not found");
    });

    it("runs ssot audit on file", async () => {
      const io = createMockIO();
      const testFile = path.join(tmpDir, "test.md");
      fs.writeFileSync(testFile, "# Test\n\nSome content\n");

      const result = await runAudit({
        projectDir: tmpDir,
        io,
        mode: "ssot",
        targetPath: testFile,
      });
      expect(result.errors).toHaveLength(0);
      expect(result.report.mode).toBe("ssot");
      expect(result.report.totalScore).toBeLessThan(100);
    });

    it("saves report to .framework/audits", async () => {
      const io = createMockIO();
      const testFile = path.join(tmpDir, "test.md");
      fs.writeFileSync(testFile, "# Test\n");

      await runAudit({
        projectDir: tmpDir,
        io,
        mode: "ssot",
        targetPath: testFile,
      });

      const auditsDir = path.join(tmpDir, ".framework", "audits");
      expect(fs.existsSync(auditsDir)).toBe(true);
      const files = fs.readdirSync(auditsDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it("uses custom target ID", async () => {
      const io = createMockIO();
      const testFile = path.join(tmpDir, "test.md");
      fs.writeFileSync(testFile, "# Test\n");

      const result = await runAudit({
        projectDir: tmpDir,
        io,
        mode: "ssot",
        targetPath: testFile,
        targetId: "CUSTOM-ID",
      });
      expect(result.report.target.id).toBe("CUSTOM-ID");
    });

    it("prints scorecard to IO", async () => {
      const io = createMockIO();
      const testFile = path.join(tmpDir, "test.md");
      fs.writeFileSync(testFile, "# Test\n");

      await runAudit({
        projectDir: tmpDir,
        io,
        mode: "ssot",
        targetPath: testFile,
      });

      expect(io.output.some((o) => o.includes("Scorecard"))).toBe(true);
      expect(io.output.some((o) => o.includes("Total Score"))).toBe(true);
      expect(io.output.some((o) => o.includes("Verdict"))).toBe(true);
    });
  });

  describe("auditSSOT", () => {
    it("gives full marks for complete SSOT", () => {
      const content = [
        "# Feature Spec",
        "",
        "§1 Overview §2 Scope §3 Functional Requirements",
        "§4 Data Model §5 API §6 UI",
        "§7 Auth §8 Error §9 Error Handling",
        "§10 Test §11 Migration §12 Checklist",
        "",
        "FR-001 [MUST]: Return 200 on success",
        "FR-002 [SHOULD]: Log the request",
        "SSOT-2 reference, SSOT-3 reference",
        "",
        "| Col | Val |",
        "|-----|-----|",
        "| A   | B   |",
        "",
        "## Test Cases",
      ].join("\n");

      const report = auditSSOT(content, "TEST", "test.md");
      expect(report.totalScore).toBeGreaterThanOrEqual(95);
    });

    it("deducts for missing sections", () => {
      const report = auditSSOT("# Simple doc\n\nNo sections here.", "T", "t.md");
      const completeness = report.scorecard.find(
        (c) => c.category === "Completeness",
      );
      expect(completeness!.earned).toBeLessThan(15);
    });

    it("detects TBD items as critical", () => {
      const content = "§1 §2 §3 §4 §5 §6 §7 §8 §9 §10 §11 §12\nThis is TBD for now. Also TBD here.";
      const report = auditSSOT(content, "T", "t.md");

      const tbdCondition = report.absoluteConditions.find(
        (c) => c.name === "TBD Count = 0",
      );
      expect(tbdCondition!.passed).toBe(false);

      const critical = report.findings.filter((f) => f.severity === "critical");
      expect(critical.length).toBeGreaterThan(0);
    });

    it("deducts for ambiguous phrases", () => {
      const content = "§1 §2 §3 §4 §5 §6 §7 §8 §9 §10 §11 §12\n" +
        "MUST return various items etc. as needed\n" +
        "FR-001 SSOT-2 test";
      const report = auditSSOT(content, "T", "t.md");
      const clarity = report.scorecard.find((c) => c.category === "Clarity");
      expect(clarity!.earned).toBeLessThan(10);
    });

    it("deducts for missing RFC 2119 keywords", () => {
      const content = "§1 §2 §3 §4 §5 §6 §7 §8 §9 §10 §11 §12\nFR-001 SSOT-2 test\nNo keywords here.";
      const report = auditSSOT(content, "T", "t.md");
      const rfc = report.scorecard.find(
        (c) => c.category === "RFC 2119 Compliance",
      );
      expect(rfc!.earned).toBe(0);
    });

    it("fails when absolute conditions not met", () => {
      const content = "This is TBD. No sections.";
      const report = auditSSOT(content, "T", "t.md");
      expect(report.verdict).toBe("fail");
    });
  });

  describe("auditPrompt", () => {
    it("gives full marks for complete prompt", () => {
      const content = [
        "# Prompt: Implement Login Feature",
        "",
        "## Role",
        "You are an expert TypeScript engineer.",
        "",
        "## Context",
        "The SSOT specification for this feature is as follows...",
        "Technology: Next.js 15, TypeScript, React 19",
        "",
        "## Task",
        "Step 1. Create src/components/LoginForm.tsx",
        "Step 2. Create src/api/auth.ts",
        "",
        "## Constraints",
        "Follow naming conventions per CODING_STANDARDS.md.",
        "",
        "## Output",
        "Output format: TypeScript files with proper types.",
        "",
        "## Acceptance Criteria",
        "- MUST handle login errors",
        "- MUST validate input",
        "",
        "## Forbidden",
        "- Do not use any type",
        "- Never skip error handling",
      ].join("\n");

      const report = auditPrompt(content, "T", "t.md");
      expect(report.totalScore).toBe(100);
      expect(report.verdict).toBe("pass");
    });

    it("deducts for missing role", () => {
      const content = "Just a plain task with no persona defined.";
      const report = auditPrompt(content, "T", "t.md");
      const role = report.scorecard.find(
        (c) => c.category === "Role Appropriateness",
      );
      expect(role!.earned).toBe(0);
    });

    it("deducts for missing SSOT reference", () => {
      const content = "Role: expert engineer\nJust some task.";
      const report = auditPrompt(content, "T", "t.md");
      const context = report.scorecard.find(
        (c) => c.category === "Context Completeness",
      );
      expect(context!.earned).toBeLessThan(25);
    });

    it("deducts for missing acceptance criteria", () => {
      const content = "Role: expert\nNo checks or conditions listed.";
      const report = auditPrompt(content, "T", "t.md");
      const ac = report.scorecard.find(
        (c) => c.category === "Acceptance Criteria",
      );
      expect(ac!.earned).toBe(0);
    });

    it("requires 100 to pass", () => {
      const content = "Role: expert\nSome basic prompt content.";
      const report = auditPrompt(content, "T", "t.md");
      expect(report.verdict).not.toBe("pass");
    });

    it("detects vague constraints", () => {
      const content = [
        "Role: expert engineer",
        "SSOT specification reference here with enough content to pass length check",
        "TypeScript Next.js React implementation",
        "Step 1. Create file",
        "src/test.ts",
        "Follow best practices and naming conventions.",
        "Output format: TypeScript",
        "MUST implement correctly",
        "Do not skip validation",
      ].join("\n".repeat(10));
      const report = auditPrompt(content, "T", "t.md");
      const constraint = report.scorecard.find(
        (c) => c.category === "Constraint Coverage",
      );
      expect(constraint!.earned).toBeLessThan(15);
    });
  });

  describe("auditCode", () => {
    it("gives full marks for clean code", () => {
      const content = [
        'import { type User } from "./types.js";',
        "",
        "export function getUser(id: string): User | null {",
        '  if (!id) throw new Error("ID required");',
        "  return { id, name: \"test\" };",
        "}",
      ].join("\n");

      const report = auditCode(content, "T", "t.ts");
      expect(report.totalScore).toBe(100);
      expect(report.verdict).toBe("pass");
    });

    it("detects any type usage", () => {
      const content = "const x: any = 42;\nfunction foo(a: any): any { return a; }";
      const report = auditCode(content, "T", "t.ts");
      const typeSafety = report.scorecard.find(
        (c) => c.category === "Type Safety",
      );
      expect(typeSafety!.earned).toBeLessThan(15);

      const anyFindings = report.findings.filter(
        (f) => f.issue.includes("any"),
      );
      expect(anyFindings.length).toBeGreaterThan(0);
    });

    it("detects empty catch blocks", () => {
      const content = [
        "try {",
        "  doSomething();",
        "} catch (e) {}",
      ].join("\n");

      const report = auditCode(content, "T", "t.ts");
      const errorHandling = report.scorecard.find(
        (c) => c.category === "Error Handling",
      );
      expect(errorHandling!.earned).toBeLessThan(15);

      const catchFindings = report.findings.filter(
        (f) => f.issue.includes("catch"),
      );
      expect(catchFindings.length).toBeGreaterThan(0);
      expect(catchFindings[0].severity).toBe("critical");
    });

    it("detects TODO/FIXME comments", () => {
      const content = "// TODO: implement this\nfunction foo() {}\n// FIXME: broken";
      const report = auditCode(content, "T", "t.ts");
      const completeness = report.scorecard.find(
        (c) => c.category === "Completeness",
      );
      expect(completeness!.earned).toBeLessThan(5);
    });

    it("detects console.log in production code", () => {
      const content = 'console.log("debug");\nconsole.error("oops");';
      const report = auditCode(content, "T", "t.ts");
      const completeness = report.scorecard.find(
        (c) => c.category === "Completeness",
      );
      expect(completeness!.earned).toBeLessThan(5);
    });

    it("allows console.log in test files", () => {
      const content = 'console.log("debug");';
      const report = auditCode(content, "T", "t.test.ts");
      const completeness = report.scorecard.find(
        (c) => c.category === "Completeness",
      );
      expect(completeness!.earned).toBe(5);
    });

    it("detects ellipsis comments as critical", () => {
      const content = "function foo() {\n  // ...\n  return null;\n}";
      const report = auditCode(content, "T", "t.ts");
      const ssot = report.scorecard.find(
        (c) => c.category === "SSOT Compliance",
      );
      expect(ssot!.earned).toBeLessThan(25);

      const ellipsis = report.findings.filter(
        (f) => f.issue.includes("Ellipsis"),
      );
      expect(ellipsis[0].severity).toBe("critical");
    });

    it("detects hardcoded secrets", () => {
      const content = 'const apiKey = "sk-abc123";\nconst password = "secret";';
      const report = auditCode(content, "T", "t.ts");
      const security = report.scorecard.find(
        (c) => c.category === "Security",
      );
      expect(security!.earned).toBeLessThan(15);
    });

    it("fails with critical findings", () => {
      const content = "try { x(); } catch (e) {}\n// ...\nconst x: any = 1;";
      const report = auditCode(content, "T", "t.ts");
      expect(report.verdict).toBe("fail");
      expect(
        report.absoluteConditions.find((c) => c.name === "Critical Findings = 0")?.passed,
      ).toBe(false);
    });

    it("flags long files", () => {
      const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`);
      const report = auditCode(lines.join("\n"), "T", "t.ts");
      const standards = report.scorecard.find(
        (c) => c.category === "Coding Standards",
      );
      expect(standards!.earned).toBeLessThan(10);
    });
  });
});
