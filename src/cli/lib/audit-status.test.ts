import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { printAuditStatus } from "./audit-status.js";
import {
  createScorecard,
  saveAuditReport,
  SSOT_CATEGORIES,
  type AuditReport,
} from "./audit-model.js";

function makeReport(
  verdict: AuditReport["verdict"],
  overrides: Partial<AuditReport> = {},
): AuditReport {
  return {
    mode: "ssot",
    target: {
      id: `TEST-${verdict}`,
      name: `${verdict}.md`,
      path: `docs/${verdict}.md`,
      auditDate: "2026-02-03T00:00:00Z",
      iteration: 1,
    },
    scorecard: createScorecard(SSOT_CATEGORIES),
    totalScore: verdict === "pass" ? 100 : verdict === "conditional" ? 92 : 80,
    verdict,
    absoluteConditions: [],
    findings: [],
    ...overrides,
  };
}

describe("printAuditStatus", () => {
  let tmpDir: string;
  let stdout: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-status-"));
    stdout = [];
    vi.spyOn(process.stdout, "write").mockImplementation((data) => {
      stdout.push(String(data));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints guidance when no audit reports exist", () => {
    printAuditStatus(tmpDir);

    expect(stdout.join("")).toContain(
      "No audit reports found. Run 'shirube audit <mode> <target>' to audit.",
    );
  });

  it("renders PASS, WARN, and FAIL verdict states", () => {
    saveAuditReport(
      tmpDir,
      makeReport("pass", {
        target: {
          id: "PASS",
          name: "pass.md",
          path: "docs/pass.md",
          auditDate: "2026-02-05T00:00:00Z",
          iteration: 1,
        },
      }),
    );
    saveAuditReport(
      tmpDir,
      makeReport("conditional", {
        target: {
          id: "WARN",
          name: "warn.md",
          path: "docs/warn.md",
          auditDate: "2026-02-04T00:00:00Z",
          iteration: 1,
        },
      }),
    );
    saveAuditReport(
      tmpDir,
      makeReport("fail", {
        target: {
          id: "FAIL",
          name: "fail.md",
          path: "docs/fail.md",
          auditDate: "2026-02-03T00:00:00Z",
          iteration: 1,
        },
      }),
    );

    printAuditStatus(tmpDir);

    const output = stdout.join("");
    expect(output).toContain("Recent Audit Results");
    expect(output).toContain("[SSOT] pass.md - 100/100 PASS");
    expect(output).toContain("[SSOT] warn.md - 92/100 WARN");
    expect(output).toContain("[SSOT] fail.md - 80/100 FAIL");
  });

  it("filters reports by audit mode", () => {
    saveAuditReport(tmpDir, makeReport("pass"));
    saveAuditReport(
      tmpDir,
      makeReport("fail", {
        mode: "code",
        target: {
          id: "CODE",
          name: "code.ts",
          path: "src/code.ts",
          auditDate: "2026-02-06T00:00:00Z",
          iteration: 1,
        },
      }),
    );

    printAuditStatus(tmpDir, "code");

    const output = stdout.join("");
    expect(output).toContain("[CODE] code.ts - 80/100 FAIL");
    expect(output).not.toContain("pass.md");
  });
});
