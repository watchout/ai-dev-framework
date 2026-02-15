import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scaffoldGateCsections } from "./gate-scaffold.js";

describe("gate-scaffold", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-gate-scaffold-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no SSOT files exist", () => {
    const results = scaffoldGateCsections(tmpDir, false);
    expect(results).toHaveLength(0);
  });

  it("reports missing sections in dry-run mode without modifying files", () => {
    const dir = path.join(tmpDir, "docs/design/features/common");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "AUTH-001_login.md");
    const originalContent = [
      "# AUTH-001 Login",
      "",
      "## Overview",
      "Login feature.",
      "",
      "## Scope",
      "User authentication.",
      "",
      "## Details",
      "More details here.",
      "Even more details.",
    ].join("\n");
    fs.writeFileSync(filePath, originalContent, "utf-8");

    const results = scaffoldGateCsections(tmpDir, true);
    expect(results).toHaveLength(1);
    expect(results[0].missingSections).toContain("§3-E");
    expect(results[0].missingSections).toContain("§3-F");
    expect(results[0].missingSections).toContain("§3-G");
    expect(results[0].missingSections).toContain("§3-H");
    expect(results[0].scaffolded).toBe(false);

    // File should NOT be modified
    const afterContent = fs.readFileSync(filePath, "utf-8");
    expect(afterContent).toBe(originalContent);
  });

  it("appends missing section templates when not dry-run", () => {
    const dir = path.join(tmpDir, "docs/design/features/project");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "BOOK-001_booking.md");
    fs.writeFileSync(
      filePath,
      [
        "# BOOK-001 Booking",
        "",
        "## Overview",
        "Booking feature spec.",
        "",
        "## Functional Requirements",
        "FR-001: Create booking.",
        "FR-002: Cancel booking.",
        "",
        "## Details",
        "More info here.",
      ].join("\n"),
      "utf-8",
    );

    const results = scaffoldGateCsections(tmpDir, false);
    expect(results).toHaveLength(1);
    expect(results[0].scaffolded).toBe(true);
    expect(results[0].missingSections).toHaveLength(4);

    // Check that content was appended
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("§3-E 入出力例");
    expect(content).toContain("§3-F 境界値");
    expect(content).toContain("§3-G 例外応答");
    expect(content).toContain("§3-H Gherkin");
    expect(content).toContain("AUTO-GENERATED");
    expect(content).toContain("BOOK-001");
  });

  it("skips sections that already exist", () => {
    const dir = path.join(tmpDir, "docs/design/features/common");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "AUTH-002_logout.md");
    fs.writeFileSync(
      filePath,
      [
        "# AUTH-002 Logout",
        "",
        "## Overview",
        "Logout feature.",
        "",
        "## §3-E 入出力例",
        "| # | 入力 | 条件 | 期待出力 | 備考 |",
        "|---|------|------|---------|------|",
        "| 1 | token | valid | 200 | OK |",
        "",
        "## §3-H Gherkin",
        "Scenario: Logout",
        "  Given logged in",
        "  When click logout",
        "  Then redirected to login",
      ].join("\n"),
      "utf-8",
    );

    const results = scaffoldGateCsections(tmpDir, false);
    expect(results).toHaveLength(1);
    // Only §3-F and §3-G should be missing
    expect(results[0].missingSections).toContain("§3-F");
    expect(results[0].missingSections).toContain("§3-G");
    expect(results[0].missingSections).not.toContain("§3-E");
    expect(results[0].missingSections).not.toContain("§3-H");
  });

  it("reports complete files with no missing sections", () => {
    const dir = path.join(tmpDir, "docs/design/features/common");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "AUTH-001_login.md"),
      [
        "# AUTH-001 Login",
        "",
        "## §3-E 入出力例",
        "| # | 入力 | 条件 | 期待出力 |",
        "| 1 | email | 正常 | 200 |",
        "",
        "## §3-F 境界値",
        "| 項目 | 最小値 | 最大値 |",
        "| email | 5 | 255 |",
        "",
        "## §3-G 例外応答",
        "| # | 例外条件 | HTTPステータス |",
        "| 1 | 不正入力 | 400 |",
        "",
        "## §3-H Gherkin",
        "Scenario: Login success",
        "  Given user exists",
        "  When login",
        "  Then 200",
      ].join("\n"),
      "utf-8",
    );

    const results = scaffoldGateCsections(tmpDir, false);
    expect(results).toHaveLength(1);
    expect(results[0].missingSections).toHaveLength(0);
    expect(results[0].scaffolded).toBe(false);
  });

  it("skips §3-F for api profile", () => {
    const dir = path.join(tmpDir, "docs/design/features/project");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "API-001_users.md"),
      [
        "# API-001 Users",
        "",
        "## Overview",
        "Users endpoint.",
        "",
        "## §3-E 入出力例",
        "| # | Input | Output |",
        "| 1 | GET /users | 200 |",
        "",
        "## Details",
        "More details.",
      ].join("\n"),
      "utf-8",
    );

    const results = scaffoldGateCsections(tmpDir, false, "api");
    expect(results).toHaveLength(1);
    // §3-F should NOT be in missing sections for api profile
    expect(results[0].missingSections).not.toContain("§3-F");
    // But §3-G and §3-H should still be missing
    expect(results[0].missingSections).toContain("§3-G");
    expect(results[0].missingSections).toContain("§3-H");
  });

  it("extracts feature ID from file name", () => {
    const dir = path.join(tmpDir, "docs/design/features/project");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BOOK-042_cancel.md"),
      [
        "# Cancel Booking",
        "",
        "## Overview",
        "Cancel a booking.",
        "",
        "## Scope",
        "Cancellation flow.",
        "",
        "## Details",
        "More details.",
        "More content.",
      ].join("\n"),
      "utf-8",
    );

    const results = scaffoldGateCsections(tmpDir, false);
    expect(results).toHaveLength(1);

    const content = fs.readFileSync(
      path.join(dir, "BOOK-042_cancel.md"),
      "utf-8",
    );
    expect(content).toContain("BOOK-042");
  });
});
