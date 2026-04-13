// pre-commit-allow: skip-only
// (this file contains .skip/.only patterns inside string fixtures that the checker detects)
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  analyzeTestFile,
  evaluateTestQuality,
  findTestFiles,
  checkTests,
  formatTestQualityReport,
} from "./test-quality-checker.js";

describe("analyzeTestFile", () => {
  it("detects .skip as CRITICAL", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./foo.js";
it.skip("bad", () => { expect(foo()).toBe(1); });`,
    );
    expect(r.hasSkipOrOnly).toBe(true);
    expect(r.critical.some((c) => c.includes("TEST-SKIP"))).toBe(true);
  });

  it("detects .only as CRITICAL", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./foo.js";
describe.only("bad", () => { it("x", () => { expect(foo()).toBe(1); }); });`,
    );
    expect(r.hasSkipOrOnly).toBe(true);
  });

  it("detects xdescribe as CRITICAL", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./foo.js";
xdescribe("bad", () => { it("x", () => { expect(foo()).toBe(1); }); });`,
    );
    expect(r.hasSkipOrOnly).toBe(true);
  });

  it("detects empty it() body as CRITICAL", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./foo.js";
it("empty", () => {});`,
    );
    expect(r.emptyDescribeBlocks).toBe(1);
    expect(r.critical.some((c) => c.includes("TEST-EMPTY"))).toBe(true);
  });

  it("detects missing src import as WARNING", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { describe, it, expect } from "vitest";
it("works", () => { expect(1).toBe(1); });`,
    );
    expect(r.importsSrc).toBe(false);
    expect(r.warning.some((w) => w.includes("TEST-NO-SRC"))).toBe(true);
  });

  it("accepts file that imports from ./impl.js", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./impl.js";
it("works", () => { expect(foo()).toBe(1); });`,
    );
    expect(r.importsSrc).toBe(true);
  });

  it("detects mock-only assertions as WARNING", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./impl.js";
import { vi } from "vitest";
it("mock", () => {
  const mockFn = vi.fn();
  foo(mockFn);
  expect(mockFn).toHaveBeenCalled();
});`,
    );
    expect(r.mockOnlyAssertions).toBe(true);
    expect(r.warning.some((w) => w.includes("TEST-MOCK-ONLY"))).toBe(true);
  });

  it("counts expect() calls", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./impl.js";
it("multi", () => {
  expect(foo()).toBe(1);
  expect(foo()).not.toBe(2);
  expect(foo()).toBeDefined();
});`,
    );
    expect(r.expectCount).toBe(3);
  });

  it("flags file with no expects as WARNING", () => {
    const r = analyzeTestFile(
      "x.test.ts",
      `import { foo } from "./impl.js";
it("nothing", () => { foo(); });`,
    );
    expect(r.expectCount).toBe(0);
    expect(r.warning.some((w) => w.includes("TEST-NO-EXPECT"))).toBe(true);
  });
});

describe("evaluateTestQuality", () => {
  it("returns PASS with score 100 for clean reports", () => {
    const reports = [
      analyzeTestFile(
        "a.test.ts",
        `import { foo } from "./impl.js";
it("x", () => { expect(foo()).toBe(1); });`,
      ),
    ];
    const r = evaluateTestQuality(reports);
    expect(r.verdict).toBe("PASS");
    expect(r.score).toBe(100);
  });

  it("returns BLOCK when any CRITICAL finding", () => {
    const reports = [
      analyzeTestFile(
        "a.test.ts",
        `import { foo } from "./impl.js";
it.skip("skipped", () => { expect(foo()).toBe(1); });`,
      ),
    ];
    const r = evaluateTestQuality(reports);
    expect(r.verdict).toBe("BLOCK");
    expect(r.totalCritical).toBeGreaterThan(0);
  });

  it("clamps score to 0 minimum", () => {
    const reports: ReturnType<typeof analyzeTestFile>[] = [];
    for (let i = 0; i < 20; i++) {
      reports.push(
        analyzeTestFile(
          `f${i}.test.ts`,
          `import { foo } from "./impl.js";
it.skip("s", () => { expect(foo()).toBe(1); });`,
        ),
      );
    }
    const r = evaluateTestQuality(reports);
    expect(r.score).toBe(0);
  });
});

describe("findTestFiles + checkTests", () => {
  it("scans a directory and returns test quality result", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tqc-"));
    fs.writeFileSync(
      path.join(tmp, "good.test.ts"),
      `import { foo } from "./foo.js";\nit("x", () => { expect(foo()).toBe(1); });`,
    );
    fs.writeFileSync(
      path.join(tmp, "bad.test.ts"),
      `import { foo } from "./foo.js";\nit.skip("x", () => { expect(foo()).toBe(1); });`,
    );
    const files = findTestFiles(tmp);
    expect(files.length).toBe(2);
    const result = checkTests(tmp);
    expect(result.totalFiles).toBe(2);
    expect(result.verdict).toBe("BLOCK");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("ignores node_modules and dist", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tqc-"));
    fs.mkdirSync(path.join(tmp, "node_modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "node_modules", "x.test.ts"),
      `it.skip("x", () => {});`,
    );
    const files = findTestFiles(tmp);
    expect(files).toHaveLength(0);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("formatTestQualityReport", () => {
  it("produces a markdown report", () => {
    const reports = [
      analyzeTestFile(
        "a.test.ts",
        `import { foo } from "./impl.js";
it("x", () => { expect(foo()).toBe(1); });`,
      ),
    ];
    const result = evaluateTestQuality(reports);
    const md = formatTestQualityReport(result);
    expect(md).toContain("Test Quality Report");
    expect(md).toContain("Score: 100/100");
    expect(md).toContain("PASS");
  });
});
