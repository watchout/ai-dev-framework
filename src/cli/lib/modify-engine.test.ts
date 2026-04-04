import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverSSOTs,
  parseSSOTSections,
  replaceSSOTSection,
  runModify,
  approveModify,
  printModifyStatus,
  setModifyClaudeRunner,
  loadModifyState,
  type ModifyIO,
} from "./modify-engine.js";

// Mock IO
function createMockIO(): ModifyIO & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    print(msg: string) { lines.push(msg); },
    printProgress(step: string, detail: string) { lines.push(`[${step}] ${detail}`); },
  };
}

// Sample SSOT content
const SAMPLE_SSOT = `# FEAT-101 ログイン機能 - SSOT

> Version: 1.0

## §1 文書情報

| 項目 | 内容 |
|------|------|
| 機能ID | FEAT-101 |

## §2 機能概要 [CORE]

### 2.1 目的
ユーザーがログインできること

## §3 機能要件

| 要件ID | レベル | 要件 |
|--------|--------|------|
| FR-001 | MUST | ログインできる |

## §4 データ仕様

### 4.1 データ項目一覧

| # | 項目名 | 物理名 | 型 | 必須 |
|---|--------|--------|-----|------|
| 1 | メール | email | string | Yes |
| 2 | パスワード | password | string | Yes |

## §5 API仕様 [CONTRACT]

### 5.1 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/v1/login | ログイン |
| POST | /api/v1/logout | ログアウト |

#### POST /api/v1/login

レスポンス:
\`\`\`json
{ "token": "string" }
\`\`\`

## §7 ビジネスルール [CORE]

| ルールID | ルール名 |
|---------|---------|
| BR-001 | パスワード最低8文字 |

## §9 エラーハンドリング

| # | エラー条件 | エラーコード |
|---|----------|------------|
| 1 | 認証失敗 | AUTH_001 |
| 2 | アカウントロック | AUTH_002 |
`;

// Mock AI response for modify
const MOCK_MODIFY_RESPONSE = JSON.stringify({
  matches: [
    {
      featureId: "FEAT-101",
      confidence: 0.95,
      affectedSections: ["§5"],
      coreLayerChanged: false,
      diffs: [
        {
          section: "§5",
          reason: "APIレスポンスにrefresh_tokenフィールドを追加",
          updatedContent: "## §5 API仕様 [CONTRACT]\n\n### 5.1 エンドポイント一覧\n\n| メソッド | パス | 説明 |\n|---------|------|------|\n| POST | /api/v1/login | ログイン |\n| POST | /api/v1/logout | ログアウト |\n\n#### POST /api/v1/login\n\nレスポンス: { token: string, refreshToken: string }",
        },
      ],
    },
  ],
});

// Mock AI response with CORE layer change
const MOCK_CORE_CHANGE_RESPONSE = JSON.stringify({
  matches: [
    {
      featureId: "FEAT-101",
      confidence: 0.90,
      affectedSections: ["§2", "§5"],
      coreLayerChanged: true,
      diffs: [
        {
          section: "§2",
          reason: "purpose change",
          updatedContent: "## §2 overview [CORE]\n\n### 2.1 Purpose\nOAuth2 login",
        },
        {
          section: "§5",
          reason: "OAuth2 endpoint added",
          updatedContent: "## §5 API [CONTRACT]\n\n| Method | Path |\n| POST | /api/v1/oauth/login |",
        },
      ],
    },
  ],
});

describe("modify-engine", () => {
  let tmpDir: string;
  let restoreRunner: () => void;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "modify-engine-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "docs/design/features"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "docs/inbox"), { recursive: true });

    // Write sample SSOT
    fs.writeFileSync(
      path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
      SAMPLE_SSOT,
    );

    // Mock Claude runner
    restoreRunner = setModifyClaudeRunner(async () => MOCK_MODIFY_RESPONSE);
  });

  afterEach(() => {
    restoreRunner();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── parseSSOTSections ───

  describe("parseSSOTSections", () => {
    it("should parse all sections from SSOT content", () => {
      const sections = parseSSOTSections(SAMPLE_SSOT);
      expect(sections.has("§1")).toBe(true);
      expect(sections.has("§2")).toBe(true);
      expect(sections.has("§3")).toBe(true);
      expect(sections.has("§4")).toBe(true);
      expect(sections.has("§5")).toBe(true);
      expect(sections.has("§7")).toBe(true);
      expect(sections.has("§9")).toBe(true);
    });

    it("should capture section content", () => {
      const sections = parseSSOTSections(SAMPLE_SSOT);
      const s5 = sections.get("§5");
      expect(s5).toContain("POST");
      expect(s5).toContain("/api/v1/login");
    });
  });

  // ─── discoverSSOTs ───

  describe("discoverSSOTs", () => {
    it("should discover SSOT files with feature IDs", () => {
      const ssots = discoverSSOTs(tmpDir);
      expect(ssots).toHaveLength(1);
      expect(ssots[0].featureId).toBe("FEAT-101");
      expect(ssots[0].sections.size).toBeGreaterThan(0);
    });

    it("should return empty array when no features dir", () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-"));
      const ssots = discoverSSOTs(emptyDir);
      expect(ssots).toHaveLength(0);
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  // ─── replaceSSOTSection ───

  describe("replaceSSOTSection", () => {
    it("should replace a section preserving other sections", () => {
      const newSection = "## §5 API仕様 [CONTRACT]\n\nUpdated content here";
      const result = replaceSSOTSection(SAMPLE_SSOT, "§5", newSection);

      expect(result).toContain("Updated content here");
      expect(result).toContain("## §7 ビジネスルール");
      expect(result).toContain("## §4 データ仕様");
      expect(result).not.toContain("/api/v1/login");
    });

    it("should append section if not found", () => {
      const newSection = "## §10 テストケース\n\nNew test cases";
      const result = replaceSSOTSection(SAMPLE_SSOT, "§10", newSection);

      expect(result).toContain("New test cases");
      // Original content should be preserved
      expect(result).toContain("FEAT-101");
    });
  });

  // ─── runModify ───

  describe("runModify", () => {
    it("should reject when .framework not found", async () => {
      const noFrameworkDir = fs.mkdtempSync(path.join(os.tmpdir(), "no-fw-"));
      const io = createMockIO();

      const result = await runModify({
        projectDir: noFrameworkDir,
        inputPath: "some-file.md",
        io,
      });

      expect(result.errors).toContain("Not a framework project (.framework not found)");
      fs.rmSync(noFrameworkDir, { recursive: true, force: true });
    });

    it("should reject when no SSOTs exist", async () => {
      const noSsotsDir = fs.mkdtempSync(path.join(os.tmpdir(), "no-ssots-"));
      fs.mkdirSync(path.join(noSsotsDir, ".framework"), { recursive: true });
      const io = createMockIO();

      const result = await runModify({
        projectDir: noSsotsDir,
        inputPath: "some-file.md",
        io,
      });

      expect(result.errors[0]).toContain("No SSOTs found");
      fs.rmSync(noSsotsDir, { recursive: true, force: true });
    });

    it("should reject empty instruction file", async () => {
      fs.writeFileSync(path.join(tmpDir, "docs/inbox/empty.md"), "");
      const io = createMockIO();

      const result = await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/empty.md"),
        io,
      });

      expect(result.errors.some((e) => e.includes("empty or unparseable"))).toBe(true);
    });

    it("should process modification instruction and create record", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/fix-api.md"),
        "# 修正指示\nログインAPIのレスポンスにrefresh_tokenを追加してください。",
      );
      const io = createMockIO();

      const result = await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/fix-api.md"),
        io,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.modifications).toHaveLength(1);
      expect(result.modifications[0].id).toBe("MOD-001");
      expect(result.modifications[0].status).toBe("review");
      expect(result.modifications[0].targetSSOTs).toContain("FEAT-101");
      expect(result.modifications[0].affectedSections).toContain("§5");
      expect(result.modifications[0].coreLayerChanged).toBe(false);
    });

    it("should detect CORE layer changes", async () => {
      restoreRunner();
      restoreRunner = setModifyClaudeRunner(async () => MOCK_CORE_CHANGE_RESPONSE);

      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/change-purpose.md"),
        "# 修正指示\n機能の目的をOAuth2ベースに変更",
      );
      const io = createMockIO();

      const result = await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/change-purpose.md"),
        io,
      });

      expect(result.modifications[0].coreLayerChanged).toBe(true);
      expect(io.lines.some((l) => l.includes("CORE layer"))).toBe(true);
    });

    it("should save state file", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/fix.md"),
        "# 修正指示\nAPI修正",
      );
      const io = createMockIO();

      await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/fix.md"),
        io,
      });

      const state = loadModifyState(tmpDir);
      expect(state).not.toBeNull();
      expect(state!.modifications).toHaveLength(1);
    });

    it("should not write files in dry-run mode", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/fix.md"),
        "# 修正指示\nAPI修正",
      );
      const io = createMockIO();

      await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/fix.md"),
        dryRun: true,
        io,
      });

      const state = loadModifyState(tmpDir);
      expect(state).toBeNull();
    });

    it("should reject file over 10MB", async () => {
      const largePath = path.join(tmpDir, "docs/inbox/large.md");
      // Create a file just over 10MB
      const buf = Buffer.alloc(10 * 1024 * 1024 + 1, "a");
      fs.writeFileSync(largePath, buf);
      const io = createMockIO();

      const result = await runModify({
        projectDir: tmpDir,
        inputPath: largePath,
        io,
      });

      expect(result.errors.some((e) => e.includes("File too large"))).toBe(true);
    });
  });

  // ─── approveModify ───

  describe("approveModify", () => {
    it("should apply diffs to SSOT files on approve", async () => {
      // First create a modification
      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/fix.md"),
        "# 修正\nrefresh_token追加",
      );
      const io = createMockIO();
      await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/fix.md"),
        io,
      });

      // Then approve
      const approveResult = await approveModify({
        projectDir: tmpDir,
        io,
      });

      expect(approveResult.errors).toHaveLength(0);
      expect(approveResult.approved).toHaveLength(1);
      expect(approveResult.approved[0].status).toBe("approved");

      // Check SSOT was updated
      const updatedSSoT = fs.readFileSync(
        path.join(tmpDir, "docs/design/features/FEAT-101_login.md"),
        "utf-8",
      );
      expect(updatedSSoT).toContain("refreshToken");
    });

    it("should error when no modifications in review", async () => {
      const io = createMockIO();

      const result = await approveModify({
        projectDir: tmpDir,
        io,
      });

      expect(result.errors[0]).toContain("No modifications in review status");
    });

    it("should approve specific modification by ID", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/fix.md"),
        "# 修正\nAPI修正",
      );
      const io = createMockIO();
      await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/fix.md"),
        io,
      });

      const result = await approveModify({
        projectDir: tmpDir,
        modificationId: "MOD-001",
        io,
      });

      expect(result.approved).toHaveLength(1);
    });
  });

  // ─── printModifyStatus ───

  describe("printModifyStatus", () => {
    it("should show 'no records' when empty", () => {
      const io = createMockIO();
      printModifyStatus(tmpDir, io);
      expect(io.lines.some((l) => l.includes("No modification records"))).toBe(true);
    });

    it("should show records after modify", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "docs/inbox/fix.md"),
        "# 修正\nAPI修正",
      );
      const io = createMockIO();
      await runModify({
        projectDir: tmpDir,
        inputPath: path.join(tmpDir, "docs/inbox/fix.md"),
        io,
      });

      const statusIo = createMockIO();
      printModifyStatus(tmpDir, statusIo);
      expect(statusIo.lines.some((l) => l.includes("MOD-001"))).toBe(true);
    });
  });
});
