import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  extractEndpoints,
  extractDataFields,
  extractErrorCodes,
  grepInSource,
  runCoherence,
  loadCoherenceReport,
  type CoherenceIO,
} from "./coherence-engine.js";

// Mock IO
function createMockIO(): CoherenceIO & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    print(msg: string) { lines.push(msg); },
    printProgress(step: string, detail: string) { lines.push(`[${step}] ${detail}`); },
  };
}

// ─── Pattern Extractors ───

describe("extractEndpoints", () => {
  it("should extract endpoints from table format", () => {
    const content = `
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/v1/login | ログイン |
| GET | /api/v1/users | ユーザー一覧 |
| DELETE | /api/v1/users/:id | ユーザー削除 |
`;
    const endpoints = extractEndpoints(content);
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toEqual({ method: "POST", path: "/api/v1/login" });
    expect(endpoints[1]).toEqual({ method: "GET", path: "/api/v1/users" });
    expect(endpoints[2]).toEqual({ method: "DELETE", path: "/api/v1/users/:id" });
  });

  it("should extract endpoints from header format", () => {
    const content = `
#### POST /api/v1/login

Some description

#### GET /api/v1/users

Another description
`;
    const endpoints = extractEndpoints(content);
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toEqual({ method: "POST", path: "/api/v1/login" });
    expect(endpoints[1]).toEqual({ method: "GET", path: "/api/v1/users" });
  });

  it("should deduplicate between table and header formats", () => {
    const content = `
| メソッド | パス |
|---------|------|
| POST | /api/v1/login |

#### POST /api/v1/login
`;
    const endpoints = extractEndpoints(content);
    expect(endpoints).toHaveLength(1);
  });

  it("should return empty array for content without endpoints", () => {
    const endpoints = extractEndpoints("No API here");
    expect(endpoints).toHaveLength(0);
  });
});

describe("extractDataFields", () => {
  it("should extract physical names from data spec table", () => {
    const content = `
### 4.1 データ項目一覧

| # | 項目名 | 物理名 | 型 | 必須 |
|---|--------|--------|-----|------|
| 1 | メール | email | string | Yes |
| 2 | パスワード | password | string | Yes |
| 3 | 名前 | display_name | string | No |
`;
    const fields = extractDataFields(content);
    expect(fields).toEqual(["email", "password", "display_name"]);
  });

  it("should handle English header", () => {
    const content = `
| # | name | physical | type |
|---|------|----------|------|
| 1 | Email | email | string |
`;
    const fields = extractDataFields(content);
    expect(fields).toEqual(["email"]);
  });

  it("should skip placeholder entries", () => {
    const content = `
| # | 項目名 | 物理名 | 型 |
|---|--------|--------|-----|
| 1 | メール | email | string |
| 2 | - | - | - |
| 3 | TBD | [未定] | TBD |
`;
    const fields = extractDataFields(content);
    expect(fields).toEqual(["email"]);
  });

  it("should return empty for content without data table", () => {
    const fields = extractDataFields("No data here");
    expect(fields).toHaveLength(0);
  });
});

describe("extractErrorCodes", () => {
  it("should extract error codes from content", () => {
    const content = `
| # | エラー条件 | エラーコード |
|---|----------|------------|
| 1 | 認証失敗 | AUTH_001 |
| 2 | バリデーション | VAL_001 |
| 3 | サーバーエラー | SYS_001 |
`;
    const codes = extractErrorCodes(content);
    expect(codes).toContain("AUTH_001");
    expect(codes).toContain("VAL_001");
    expect(codes).toContain("SYS_001");
  });

  it("should not extract SSOT/FR/TC prefixes", () => {
    const content = `
SS3-E examples
FR-001 requirement
TC-N-001 test case
AUTH_001 real error code
`;
    const codes = extractErrorCodes(content);
    expect(codes).toContain("AUTH_001");
    expect(codes).not.toContain("SS3-E");
    expect(codes).not.toContain("FR-001");
    expect(codes).not.toContain("TC-N-001");
  });

  it("should deduplicate codes", () => {
    const content = "AUTH_001 appears here and AUTH_001 again";
    const codes = extractErrorCodes(content);
    expect(codes.filter((c) => c === "AUTH_001")).toHaveLength(1);
  });
});

// ─── Grep ───

describe("grepInSource", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grep-test-"));
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should find pattern in source files", () => {
    fs.writeFileSync(
      path.join(tmpDir, "src/routes.ts"),
      'app.post("/api/v1/login", handler);',
    );
    expect(grepInSource(tmpDir, "/api/v1/login")).toBe(true);
  });

  it("should return false when pattern not found", () => {
    fs.writeFileSync(
      path.join(tmpDir, "src/routes.ts"),
      'app.post("/api/v1/login", handler);',
    );
    expect(grepInSource(tmpDir, "/api/v1/nonexistent")).toBe(false);
  });

  it("should exclude node_modules", () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules/pkg"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "node_modules/pkg/index.js"),
      'const UNIQUE_PATTERN = "xyz123";',
    );
    expect(grepInSource(tmpDir, "UNIQUE_PATTERN")).toBe(false);
  });
});

// ─── Full Pipeline ───

describe("runCoherence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-test-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "docs/design/features"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should report error when .framework not found", () => {
    const noFwDir = fs.mkdtempSync(path.join(os.tmpdir(), "no-fw-"));
    const io = createMockIO();

    const report = runCoherence({ projectDir: noFwDir, io });
    expect(io.lines.some((l) => l.includes("Not a framework project"))).toBe(true);
    fs.rmSync(noFwDir, { recursive: true, force: true });
  });

  it("should report coherent when SSOT matches implementation", () => {
    // Write SSOT with API endpoint
    fs.writeFileSync(
      path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
      `# FEAT-101 Login

## §5 API仕様

| メソッド | パス |
|---------|------|
| POST | /api/v1/login |
`,
    );

    // Write matching implementation
    fs.writeFileSync(
      path.join(tmpDir, "src/routes.ts"),
      'app.post("/api/v1/login", loginHandler);',
    );

    const io = createMockIO();
    const report = runCoherence({ projectDir: tmpDir, io });

    expect(report.status).toBe("coherent");
    expect(report.results[0].status).toBe("ok");
  });

  it("should detect divergence when endpoint missing from code", () => {
    // Write SSOT with API endpoint
    fs.writeFileSync(
      path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
      `# FEAT-101 Login

## §5 API仕様

| メソッド | パス |
|---------|------|
| POST | /api/v1/login |
| POST | /api/v1/refresh |
`,
    );

    // Only implement one endpoint
    fs.writeFileSync(
      path.join(tmpDir, "src/routes.ts"),
      'app.post("/api/v1/login", loginHandler);',
    );

    const io = createMockIO();
    const report = runCoherence({ projectDir: tmpDir, io });

    expect(report.status).toBe("diverged");
    expect(report.results[0].divergences.length).toBeGreaterThan(0);
    expect(report.results[0].divergences.some(
      (d) => d.detail.includes("/api/v1/refresh"),
    )).toBe(true);
  });

  it("should detect missing data fields", () => {
    fs.writeFileSync(
      path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
      `# FEAT-101 Login

## §4 データ仕様

| # | 項目名 | 物理名 | 型 |
|---|--------|--------|-----|
| 1 | メール | email | string |
| 2 | リフレッシュトークン | refresh_token_xyz_unique | string |
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "src/model.ts"),
      'const user = { email: "test@example.com" };',
    );

    const io = createMockIO();
    const report = runCoherence({ projectDir: tmpDir, io });

    // refresh_token_xyz_unique should be missing
    const divergences = report.results[0]?.divergences ?? [];
    expect(divergences.some(
      (d) => d.detail.includes("refresh_token_xyz_unique"),
    )).toBe(true);
  });

  it("should detect missing error codes", () => {
    fs.writeFileSync(
      path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
      `# FEAT-101 Login

## §9 エラーハンドリング

| # | エラー条件 | エラーコード |
|---|----------|------------|
| 1 | 認証失敗 | AUTH_001 |
| 2 | 不明エラー | XYZUNIQUE_999 |
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "src/errors.ts"),
      'export const AUTH_001 = "Authentication failed";',
    );

    const io = createMockIO();
    const report = runCoherence({ projectDir: tmpDir, io });

    const divergences = report.results[0]?.divergences ?? [];
    expect(divergences.some(
      (d) => d.detail.includes("XYZUNIQUE_999"),
    )).toBe(true);
  });

  it("should save coherence report", () => {
    fs.writeFileSync(
      path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
      "# FEAT-101 Login\n\n## §5 API仕様\n\nNo endpoints\n",
    );

    const io = createMockIO();
    runCoherence({ projectDir: tmpDir, io });

    const report = loadCoherenceReport(tmpDir);
    expect(report).not.toBeNull();
    expect(report!.checkedAt).toBeTruthy();
  });

  it("should handle no SSOTs gracefully", () => {
    const io = createMockIO();
    const report = runCoherence({ projectDir: tmpDir, io });

    expect(report.status).toBe("coherent");
    expect(io.lines.some((l) => l.includes("No SSOTs to check"))).toBe(true);
  });
});
