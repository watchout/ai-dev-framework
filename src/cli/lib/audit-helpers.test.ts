import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  outputJson,
  resolveAuditTarget,
} from "./audit-helpers.js";
import {
  createScorecard,
  SSOT_CATEGORIES,
  type AuditReport,
} from "./audit-model.js";
import type { AuditIO, AuditResult } from "./audit-engine.js";

class ExitError extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

function exitIo(codes: number[]): Pick<AuditIO, "onFatalError"> {
  return {
    onFatalError(code: number): never {
      codes.push(code);
      throw new ExitError(code);
    },
  };
}

function report(verdict: AuditReport["verdict"]): AuditResult {
  return {
    errors: [],
    report: {
      mode: "ssot",
      target: {
        id: "TEST-001",
        name: "test.md",
        path: "docs/test.md",
        auditDate: "2026-02-03T00:00:00Z",
        iteration: 1,
      },
      scorecard: createScorecard(SSOT_CATEGORIES),
      totalScore: verdict === "pass" ? 100 : verdict === "conditional" ? 92 : 80,
      verdict,
      absoluteConditions: [],
      findings: [],
    },
  };
}

describe("audit-helpers", () => {
  let tmpDir: string;
  let stdout: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-helpers-"));
    stdout = [];
    vi.spyOn(process.stdout, "write").mockImplementation((data) => {
      stdout.push(String(data));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves the default SSOT target when no target is supplied", () => {
    const ssotDir = path.join(tmpDir, "ssot");
    fs.mkdirSync(ssotDir, { recursive: true });
    fs.writeFileSync(path.join(ssotDir, "SSOT-0_PRD.md"), "# PRD\n", "utf-8");

    const resolved = resolveAuditTarget(tmpDir, undefined, exitIo([]));

    expect(resolved.target).toBe("ssot/SSOT-0_PRD.md");
    expect(resolved.targetPath).toBe(path.join(ssotDir, "SSOT-0_PRD.md"));
  });

  it("resolves an explicit existing target", () => {
    const targetPath = path.join(tmpDir, "docs", "target.md");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "# Target\n", "utf-8");

    const resolved = resolveAuditTarget(tmpDir, "docs/target.md", exitIo([]));

    expect(resolved.target).toBe("docs/target.md");
    expect(resolved.targetPath).toBe(targetPath);
  });

  it("calls onFatalError when the default target is missing", () => {
    const codes: number[] = [];

    expect(() => resolveAuditTarget(tmpDir, undefined, exitIo(codes))).toThrow(
      "exit 1",
    );
    expect(codes).toEqual([1]);
  });

  it("calls onFatalError when an explicit target is missing", () => {
    const codes: number[] = [];

    expect(() =>
      resolveAuditTarget(tmpDir, "docs/missing.md", exitIo(codes)),
    ).toThrow("exit 1");
    expect(codes).toEqual([1]);
  });

  it("outputs JSON and exits 0 for pass verdicts", () => {
    const codes: number[] = [];

    expect(() => outputJson("ssot", "target.md", report("pass"), exitIo(codes))).toThrow(
      "exit 0",
    );

    expect(codes).toEqual([0]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      mode: "ssot",
      target: "target.md",
      verdict: "pass",
      totalScore: 100,
    });
  });

  it.each(["conditional", "fail"] as const)(
    "outputs JSON and exits 1 for %s verdicts",
    (verdict) => {
      const codes: number[] = [];

      expect(() =>
        outputJson("ssot", "target.md", report(verdict), exitIo(codes)),
      ).toThrow("exit 1");

      expect(codes).toEqual([1]);
      expect(JSON.parse(stdout.join(""))).toMatchObject({
        verdict,
      });
    },
  );
});
