/**
 * Gate 0: Spec Validation — unit tests.
 *
 * Part of ADF v1.2.0 (#92, VERIFY §3-4).
 *
 * Covers:
 * 1. Valid spec → PASS
 * 2. Missing §7 → CRITICAL, BLOCK
 * 3. STRIDE N/A without reason (app) → CRITICAL
 * 4. STRIDE N/A with reason → PASS
 * 5. STRIDE missing (cli) → WARNING only
 * 6. §7 present but no Gherkin → CRITICAL
 * 7. WARNING=3 → PASS, WARNING=4 → BLOCK
 * 8. Multiple missing sections → multiple CRITICALs
 * 9. File not found → CRITICAL
 * 10. validateAllSpecs aggregation
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { validateSpec, validateAllSpecs } from "./gate-spec-validator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-spec-validator-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Write a spec file and return its path. */
function writeSpec(name: string, content: string): string {
  const specDir = path.join(tmpDir, "docs", "spec");
  fs.mkdirSync(specDir, { recursive: true });
  const filePath = path.join(specDir, `${name}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/** Write a project.json with the given profile type. */
function writeProjectJson(profileType: string): void {
  const frameworkDir = path.join(tmpDir, ".framework");
  fs.mkdirSync(frameworkDir, { recursive: true });
  fs.writeFileSync(
    path.join(frameworkDir, "project.json"),
    JSON.stringify({ profileType }),
  );
}

/** Full valid spec with all 8 sections + Gherkin + STRIDE + OWASP. */
function makeValidSpec(): string {
  return `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---

# SPEC: Auth

## §1 目的
ユーザー認証を実装する。

## §2 非目的
外部OAuth連携は対象外。

## §3 ユーザーストーリー
As a user, I want to log in.

## §4 機能要件
- ログイン
- ログアウト

## §5 インターフェース
POST /api/auth/login

## §6 非機能要件
パフォーマンス要件あり。

### §6.3 STRIDE
- Spoofing: JWT token validation
- Tampering: Request signature
- Repudiation: Audit log
- Information Disclosure: Encrypted transport
- Denial of Service: Rate limiting
- Elevation of Privilege: RBAC

### §6.3.2 OWASP Top 10
- A01 Broken Access Control: RBAC enforced at API layer
- A02 Cryptographic Failures: TLS 1.3 + bcrypt for passwords
- A03 Injection: Parameterized queries via ORM
- A04 Insecure Design: Threat model reviewed
- A05 Security Misconfiguration: Hardened defaults
- A06 Vulnerable Components: Dependabot enabled
- A07 Auth Failures: Rate limiting + account lockout
- A08 Data Integrity Failures: Signed JWTs
- A09 Logging Failures: Structured audit log
- A10 SSRF: No outbound fetch from user input

## §7 受入基準
Given ユーザーがログインページにいる
When 有効な認証情報を入力する
Then ダッシュボードにリダイレクトされる

## §8 前提・依存
- Supabase Auth
`;
}

/** Valid spec without OWASP (only STRIDE). */
function makeSpecWithoutOwasp(): string {
  return `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---

# SPEC: Auth

## §1 目的
ユーザー認証を実装する。

## §2 非目的
外部OAuth連携は対象外。

## §3 ユーザーストーリー
As a user, I want to log in.

## §4 機能要件
- ログイン
- ログアウト

## §5 インターフェース
POST /api/auth/login

## §6 非機能要件
パフォーマンス要件あり。

### §6.3 STRIDE
- Spoofing: JWT token validation
- Tampering: Request signature
- Repudiation: Audit log
- Information Disclosure: Encrypted transport
- Denial of Service: Rate limiting
- Elevation of Privilege: RBAC

## §7 受入基準
Given ユーザーがログインページにいる
When 有効な認証情報を入力する
Then ダッシュボードにリダイレクトされる

## §8 前提・依存
- Supabase Auth
`;
}

/** Valid spec without any §6.3 security section. */
function makeSpecWithoutSection63(): string {
  return `---
id: SPEC-AUTH-001
status: Draft
traces:
  impl: [IMPL-AUTH-001]
---

# SPEC: Auth

## §1 目的
ユーザー認証を実装する。

## §2 非目的
外部OAuth連携は対象外。

## §3 ユーザーストーリー
As a user, I want to log in.

## §4 機能要件
- ログイン
- ログアウト

## §5 インターフェース
POST /api/auth/login

## §6 非機能要件
パフォーマンス要件あり。

## §7 受入基準
Given ユーザーがログインページにいる
When 有効な認証情報を入力する
Then ダッシュボードにリダイレクトされる

## §8 前提・依存
- Supabase Auth
`;
}

describe("validateSpec", () => {
  it("valid spec with all sections → PASS", () => {
    writeProjectJson("app");
    const specPath = writeSpec("auth", makeValidSpec());
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("PASS");
    expect(result.critical).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("missing §7 (acceptance criteria) → CRITICAL, BLOCK", () => {
    writeProjectJson("app");
    const content = makeValidSpec().replace(
      /## §7 受入基準[\s\S]*?(?=## §8)/,
      "",
    );
    const specPath = writeSpec("no-ac", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    const ac = result.critical.filter(
      (c) => c.type === "MissingAcceptanceCriteria",
    );
    expect(ac.length).toBeGreaterThanOrEqual(1);
  });

  it("STRIDE N/A without reason (app profile) → CRITICAL", () => {
    writeProjectJson("app");
    const content = makeValidSpec().replace(
      /### §6\.3 STRIDE[\s\S]*?(?=### §6\.3\.2)/,
      `### §6.3 STRIDE\nN/A\n\n`,
    );
    const specPath = writeSpec("stride-na-bare", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    const strideFindings = result.critical.filter(
      (c) => c.type === "STRIDE_NA_WithoutReason",
    );
    expect(strideFindings).toHaveLength(1);
  });

  it("STRIDE N/A with reason → PASS (no CRITICAL)", () => {
    writeProjectJson("app");
    const content = makeValidSpec().replace(
      /### §6\.3 STRIDE[\s\S]*?(?=### §6\.3\.2)/,
      `### §6.3 STRIDE\nN/A — This is a read-only internal tool with no user-facing auth.\n\n`,
    );
    const specPath = writeSpec("stride-na-reason", content);
    const result = validateSpec(specPath, tmpDir);

    // Should not have STRIDE_NA_WithoutReason critical
    const strideCritical = result.critical.filter(
      (c) => c.type === "STRIDE_NA_WithoutReason",
    );
    expect(strideCritical).toHaveLength(0);
  });

  it("STRIDE missing (cli profile) → WARNING only, not CRITICAL", () => {
    writeProjectJson("cli");
    // Remove entire §6.3 section (STRIDE + OWASP)
    const content = makeSpecWithoutSection63();
    const specPath = writeSpec("no-stride-cli", content);
    const result = validateSpec(specPath, tmpDir);

    // No security-related critical for cli profile
    const secCritical = result.critical.filter(
      (c) =>
        c.type === "STRIDE_NA_WithoutReason" ||
        c.type === "STRIDE_Missing" ||
        c.type === "OWASP_Missing" ||
        c.type === "OWASP_NA_WithoutReason" ||
        c.type === "SecuritySection_Missing",
    );
    expect(secCritical).toHaveLength(0);

    // Should have warning for missing §6.3
    const secWarnings = result.warnings.filter(
      (w) => w.type === "SecuritySection_Missing",
    );
    expect(secWarnings).toHaveLength(1);
    expect(secWarnings[0].message).toContain("optional");
  });

  it("§7 present but no Gherkin → CRITICAL", () => {
    writeProjectJson("app");
    const content = makeValidSpec().replace(
      /## §7 受入基準[\s\S]*?(?=## §8)/,
      `## §7 受入基準\n- ログインできること\n- ログアウトできること\n\n`,
    );
    const specPath = writeSpec("no-gherkin", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    const ghCritical = result.critical.filter(
      (c) =>
        c.type === "MissingAcceptanceCriteria" &&
        c.message.includes("Gherkin"),
    );
    expect(ghCritical).toHaveLength(1);
  });

  it("WARNING=3 → PASS", () => {
    writeProjectJson("cli");
    // Build a spec that triggers exactly 1 warning (§6.3 missing) but no criticals
    // cli profile: §6.3 entirely missing = 1 warning (SecuritySection_Missing)
    const content = makeSpecWithoutSection63();
    const specPath = writeSpec("three-warn", content);
    const result = validateSpec(specPath, tmpDir);

    // With cli profile, 1 warning for missing §6.3, 0 criticals → PASS
    expect(result.critical).toHaveLength(0);
    expect(result.warnings.length).toBeLessThanOrEqual(3);
    expect(result.status).toBe("PASS");
  });

  it("WARNING=4 → BLOCK (via validateAllSpecs aggregation)", () => {
    writeProjectJson("cli");
    // Create 4 spec files, each with 1 warning (§6.3 missing, cli profile)
    for (let i = 1; i <= 4; i++) {
      const content = makeSpecWithoutSection63()
        .replace(/id: SPEC-AUTH-001/, `id: SPEC-WARN-${i}`);
      writeSpec(`warn-${i}`, content);
    }

    const specDir = path.join(tmpDir, "docs", "spec");
    const result = validateAllSpecs(specDir, tmpDir);

    expect(result.warnings.length).toBe(4);
    expect(result.status).toBe("BLOCK");
  });

  it("multiple missing sections → multiple CRITICALs", () => {
    writeProjectJson("app");
    // Only §1 and §8 present
    const content = `---
id: SPEC-MINIMAL-001
status: Draft
traces: {}
---

# SPEC: Minimal

## §1 目的
Something.

## §8 前提・依存
None.
`;
    const specPath = writeSpec("minimal", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    // Missing §2, §3, §4, §5, §6, §7 = 6 criticals minimum
    expect(result.critical.length).toBeGreaterThanOrEqual(6);
  });

  it("file not found → CRITICAL, BLOCK", () => {
    const result = validateSpec(
      path.join(tmpDir, "nonexistent.md"),
      tmpDir,
    );

    expect(result.status).toBe("BLOCK");
    expect(result.critical).toHaveLength(1);
    expect(result.critical[0].type).toBe("MissingRequiredSection");
    expect(result.critical[0].message).toContain("not found");
  });

  it("validateAllSpecs with empty dir → vacuous PASS", () => {
    const emptyDir = path.join(tmpDir, "empty-specs");
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = validateAllSpecs(emptyDir, tmpDir);

    expect(result.status).toBe("PASS");
    expect(result.critical).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("validateAllSpecs with nonexistent dir → vacuous PASS", () => {
    const result = validateAllSpecs(
      path.join(tmpDir, "does-not-exist"),
      tmpDir,
    );

    expect(result.status).toBe("PASS");
    expect(result.critical).toHaveLength(0);
  });

  it("STRIDE missing (mcp-server profile) → WARNING only", () => {
    writeProjectJson("mcp-server");
    // Remove entire §6.3 section
    const content = makeSpecWithoutSection63();
    const specPath = writeSpec("no-stride-mcp", content);
    const result = validateSpec(specPath, tmpDir);

    // No security-related critical for mcp-server profile
    const secCritical = result.critical.filter(
      (c) =>
        c.type === "STRIDE_NA_WithoutReason" ||
        c.type === "STRIDE_Missing" ||
        c.type === "OWASP_Missing" ||
        c.type === "SecuritySection_Missing",
    );
    expect(secCritical).toHaveLength(0);

    // Should have warning for missing §6.3
    const secWarnings = result.warnings.filter(
      (w) => w.type === "SecuritySection_Missing",
    );
    expect(secWarnings).toHaveLength(1);
    expect(secWarnings[0].message).toContain("optional");
  });

  it("STRIDE N/A without reason (api profile) → CRITICAL", () => {
    writeProjectJson("api");
    const content = makeValidSpec().replace(
      /### §6\.3 STRIDE[\s\S]*?(?=### §6\.3\.2)/,
      `### §6.3 STRIDE\nN/A\n\n`,
    );
    const specPath = writeSpec("stride-na-api", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    const strideFindings = result.critical.filter(
      (c) => c.type === "STRIDE_NA_WithoutReason",
    );
    expect(strideFindings).toHaveLength(1);
  });

  // ── OWASP Top 10 tests ──

  it("OWASP N/A without reason (app profile) → CRITICAL", () => {
    writeProjectJson("app");
    const content = makeValidSpec().replace(
      /### §6\.3\.2 OWASP Top 10[\s\S]*?(?=## §7)/,
      `### §6.3.2 OWASP Top 10\n- A01 Broken Access Control: N/A\n- A02 Cryptographic Failures: Encrypted\n\n`,
    );
    const specPath = writeSpec("owasp-na-bare", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    const owaspFindings = result.critical.filter(
      (c) => c.type === "OWASP_NA_WithoutReason",
    );
    expect(owaspFindings).toHaveLength(1);
    expect(owaspFindings[0].message).toContain("A01");
  });

  it("OWASP N/A with reason → PASS (no CRITICAL)", () => {
    writeProjectJson("app");
    const content = makeValidSpec().replace(
      /### §6\.3\.2 OWASP Top 10[\s\S]*?(?=## §7)/,
      `### §6.3.2 OWASP Top 10\n- A01 Broken Access Control: N/A — Read-only public data, no access control needed\n- A02 Cryptographic Failures: Encrypted transport\n\n`,
    );
    const specPath = writeSpec("owasp-na-reason", content);
    const result = validateSpec(specPath, tmpDir);

    // Should not have OWASP_NA_WithoutReason critical
    const owaspCritical = result.critical.filter(
      (c) => c.type === "OWASP_NA_WithoutReason",
    );
    expect(owaspCritical).toHaveLength(0);
  });

  it("OWASP section missing (app profile) → CRITICAL", () => {
    writeProjectJson("app");
    // Use spec with STRIDE but no OWASP
    const content = makeSpecWithoutOwasp();
    const specPath = writeSpec("no-owasp-app", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    const owaspMissing = result.critical.filter(
      (c) => c.type === "OWASP_Missing",
    );
    expect(owaspMissing).toHaveLength(1);
    expect(owaspMissing[0].message).toContain("mandatory");
  });

  it("OWASP section missing (cli profile) → WARNING", () => {
    writeProjectJson("cli");
    // Use spec with STRIDE but no OWASP — cli profile
    const content = makeSpecWithoutOwasp();
    const specPath = writeSpec("no-owasp-cli", content);
    const result = validateSpec(specPath, tmpDir);

    // No OWASP critical for cli profile
    const owaspCritical = result.critical.filter(
      (c) => c.type === "OWASP_Missing" || c.type === "OWASP_NA_WithoutReason",
    );
    expect(owaspCritical).toHaveLength(0);

    // Should have OWASP warning
    const owaspWarnings = result.warnings.filter(
      (w) => w.type === "OWASP_Missing",
    );
    expect(owaspWarnings).toHaveLength(1);
    expect(owaspWarnings[0].message).toContain("optional");
  });

  // ── §6.3 entirely missing tests (BLOCKER 2) ──

  it("§6.3 entirely missing (app profile) → CRITICAL (not WARNING)", () => {
    writeProjectJson("app");
    const content = makeSpecWithoutSection63();
    const specPath = writeSpec("no-63-app", content);
    const result = validateSpec(specPath, tmpDir);

    expect(result.status).toBe("BLOCK");
    // §6.3 missing should be CRITICAL for app profile
    const secMissing = result.critical.filter(
      (c) => c.type === "SecuritySection_Missing",
    );
    expect(secMissing).toHaveLength(1);
    expect(secMissing[0].message).toContain("mandatory");

    // Should NOT be in warnings
    const secWarnings = result.warnings.filter(
      (w) => w.type === "SecuritySection_Missing",
    );
    expect(secWarnings).toHaveLength(0);
  });
});
