/**
 * Tests for gate-d-engine.ts (ADR-009 Gate D Phase 1)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  checkHealth,
  checkPages,
  checkSSL,
  runGateDVerify,
  saveGateDEntry,
  loadGateDEntry,
  setHttpFetcher,
  setTlsChecker,
  type GateDEntry,
  type HttpFetcher,
  type TlsCertInfo,
} from "./gate-d-engine.js";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

let tmpDir: string;
let restoreFetcher: (() => void) | undefined;
let restoreTls: (() => void) | undefined;

function mockFetcher(handler: (url: string) => { status: number; ok: boolean }): void {
  const fetcher: HttpFetcher = async (url: string) => handler(url);
  restoreFetcher = setHttpFetcher(fetcher);
}

function mockFetcherWithErrors(handler: (url: string) => never): void {
  const fetcher: HttpFetcher = async (url: string) => { handler(url); throw new Error("unreachable"); };
  restoreFetcher = setHttpFetcher(fetcher);
}

function mockTls(certInfo: TlsCertInfo): void {
  restoreTls = setTlsChecker(async () => certInfo);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-d-"));
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
});

afterEach(() => {
  if (restoreFetcher) restoreFetcher();
  if (restoreTls) restoreTls();
  restoreFetcher = undefined;
  restoreTls = undefined;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// D-1: Health Check
// ─────────────────────────────────────────────

describe("checkHealth (D-1)", () => {
  it("passes when health endpoint returns 200", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    const result = await checkHealth("https://example.com");
    expect(result.id).toBe("D-1");
    expect(result.passed).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("fails when health endpoint returns 500", async () => {
    mockFetcher(() => ({ status: 500, ok: false }));
    const result = await checkHealth("https://example.com");
    expect(result.passed).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain("500");
  });

  it("fails when health endpoint returns 404", async () => {
    mockFetcher(() => ({ status: 404, ok: false }));
    const result = await checkHealth("https://example.com");
    expect(result.passed).toBe(false);
  });

  it("fails on network error", async () => {
    mockFetcherWithErrors(() => { throw new Error("ECONNREFUSED"); });
    const result = await checkHealth("https://example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("uses custom health path", async () => {
    let capturedUrl = "";
    mockFetcher((url) => { capturedUrl = url; return { status: 200, ok: true }; });
    await checkHealth("https://example.com", "/healthz");
    expect(capturedUrl).toBe("https://example.com/healthz");
  });

  it("strips trailing slash from base URL", async () => {
    let capturedUrl = "";
    mockFetcher((url) => { capturedUrl = url; return { status: 200, ok: true }; });
    await checkHealth("https://example.com/", "/api/health");
    expect(capturedUrl).toBe("https://example.com/api/health");
  });
});

// ─────────────────────────────────────────────
// D-3: Page Display
// ─────────────────────────────────────────────

describe("checkPages (D-3)", () => {
  it("passes when all pages return 200", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    const result = await checkPages("https://example.com", ["/", "/login", "/about"]);
    expect(result.id).toBe("D-3");
    expect(result.passed).toBe(true);
    expect(result.pages).toEqual(["/", "/login", "/about"]);
    expect(result.message).toContain("3 pages");
  });

  it("fails when any page returns non-200", async () => {
    mockFetcher((url) => {
      if (url.includes("/admin")) return { status: 403, ok: false };
      return { status: 200, ok: true };
    });
    const result = await checkPages("https://example.com", ["/", "/admin"]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("/admin");
    expect(result.message).toContain("403");
  });

  it("fails on network error for a page", async () => {
    let count = 0;
    restoreFetcher = setHttpFetcher(async (url) => {
      count++;
      if (count > 1) throw new Error("timeout");
      return { status: 200, ok: true };
    });
    const result = await checkPages("https://example.com", ["/", "/broken"]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("/broken");
  });

  it("uses default pages when none specified", async () => {
    const checkedUrls: string[] = [];
    mockFetcher((url) => { checkedUrls.push(url); return { status: 200, ok: true }; });
    await checkPages("https://example.com");
    expect(checkedUrls).toContain("https://example.com/");
    expect(checkedUrls).toContain("https://example.com/login");
  });
});

// ─────────────────────────────────────────────
// D-2: SSL/TLS
// ─────────────────────────────────────────────

describe("checkSSL (D-2)", () => {
  it("passes with valid certificate", async () => {
    mockTls({
      valid: true,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      issuer: "Let's Encrypt",
      selfSigned: false,
    });
    const result = await checkSSL("https://example.com");
    expect(result.id).toBe("D-2");
    expect(result.passed).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.message).toContain("Let's Encrypt");
  });

  it("fails with expired certificate", async () => {
    mockTls({
      valid: false,
      expiresAt: new Date("2025-01-01"),
      issuer: "DigiCert",
      selfSigned: false,
    });
    const result = await checkSSL("https://example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("expired");
  });

  it("passes with warning when certificate expires within 30 days", async () => {
    mockTls({
      valid: true,
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      issuer: "Let's Encrypt",
      selfSigned: false,
    });
    const result = await checkSSL("https://example.com");
    expect(result.passed).toBe(true);
    expect(result.warning).toBe(true);
    expect(result.message).toContain("15 days");
  });

  it("fails with self-signed certificate", async () => {
    mockTls({
      valid: true,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      issuer: "localhost",
      selfSigned: true,
    });
    const result = await checkSSL("https://example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Self-signed");
  });

  it("fails with HTTP URL", async () => {
    const result = await checkSSL("http://example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("HTTPS");
  });

  it("fails on connection error", async () => {
    mockTls({
      valid: false,
      expiresAt: new Date(0),
      issuer: "",
      selfSigned: false,
      error: "ECONNREFUSED",
    });
    const result = await checkSSL("https://example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });
});

// ─────────────────────────────────────────────
// runGateDVerify
// ─────────────────────────────────────────────

describe("runGateDVerify", () => {
  it("returns passed when health, SSL, and pages all OK", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    mockTls({ valid: true, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), issuer: "LE", selfSigned: false });
    const result = await runGateDVerify({
      baseUrl: "https://example.com",
      environment: "staging",
      pages: ["/"],
    });
    expect(result.allPassed).toBe(true);
    expect(result.entry.status).toBe("passed");
    expect(result.entry.environment).toBe("staging");
    expect(result.entry.checks).toHaveLength(5);
    expect(result.errors).toHaveLength(0);
  });

  it("returns failed when health check fails", async () => {
    mockFetcher((url) => {
      if (url.includes("/api/health")) return { status: 503, ok: false };
      return { status: 200, ok: true };
    });
    mockTls({ valid: true, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), issuer: "LE", selfSigned: false });
    const result = await runGateDVerify({
      baseUrl: "https://example.com",
      pages: ["/"],
    });
    expect(result.allPassed).toBe(false);
    expect(result.entry.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("D-1");
  });

  it("returns failed when SSL check fails", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    mockTls({ valid: false, expiresAt: new Date("2025-01-01"), issuer: "Expired", selfSigned: false });
    const result = await runGateDVerify({
      baseUrl: "https://example.com",
      pages: ["/"],
    });
    expect(result.allPassed).toBe(false);
    expect(result.errors.some((e) => e.includes("D-2"))).toBe(true);
  });

  it("skips SSL check with skipSsl option", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    const result = await runGateDVerify({
      baseUrl: "https://example.com",
      pages: ["/"],
      skipSsl: true,
    });
    expect(result.allPassed).toBe(true);
    const d2 = result.entry.checks.find((c) => c.id === "D-2");
    expect(d2?.message).toContain("Skipped");
  });

  it("marks Phase 2/3 checks as skipped", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    mockTls({ valid: true, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), issuer: "LE", selfSigned: false });
    const result = await runGateDVerify({
      baseUrl: "https://example.com",
      pages: ["/"],
    });
    const d4 = result.entry.checks.find((c) => c.id === "D-4");
    const d5 = result.entry.checks.find((c) => c.id === "D-5");
    expect(d4?.message).toContain("Skipped");
    expect(d5?.message).toContain("Skipped");
  });

  it("includes deploy commit in entry", async () => {
    mockFetcher(() => ({ status: 200, ok: true }));
    mockTls({ valid: true, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), issuer: "LE", selfSigned: false });
    const result = await runGateDVerify({
      baseUrl: "https://example.com",
      pages: ["/"],
      deployCommit: "abc1234",
    });
    expect(result.entry.deployCommit).toBe("abc1234");
  });
});

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

describe("saveGateDEntry / loadGateDEntry", () => {
  it("saves and loads Gate D entry", () => {
    const entry: GateDEntry = {
      status: "passed",
      environment: "staging",
      checks: [
        { id: "D-1", name: "Health Check", passed: true, message: "OK" },
      ],
      checkedAt: new Date().toISOString(),
    };
    saveGateDEntry(tmpDir, entry);

    const loaded = loadGateDEntry(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe("passed");
    expect(loaded!.environment).toBe("staging");
    expect(loaded!.checks).toHaveLength(1);
  });

  it("preserves existing gate A/B/C entries", () => {
    // Pre-populate gates.json with A/B/C
    const gatesPath = path.join(tmpDir, ".framework/gates.json");
    fs.writeFileSync(gatesPath, JSON.stringify({
      gateA: { status: "passed", checks: [], checkedAt: "2026-01-01" },
      gateB: { status: "passed", checks: [], checkedAt: "2026-01-01" },
      gateC: { status: "passed", checks: [], checkedAt: "2026-01-01" },
    }, null, 2));

    const entry: GateDEntry = {
      status: "failed",
      environment: "production",
      checks: [],
      checkedAt: new Date().toISOString(),
    };
    saveGateDEntry(tmpDir, entry);

    const raw = JSON.parse(fs.readFileSync(gatesPath, "utf-8"));
    expect(raw.gateA.status).toBe("passed");
    expect(raw.gateB.status).toBe("passed");
    expect(raw.gateC.status).toBe("passed");
    expect(raw.gateD.status).toBe("failed");
    expect(raw.gateD.environment).toBe("production");
  });

  it("returns null when no gateD entry exists", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".framework/gates.json"),
      JSON.stringify({ gateA: { status: "pending" } }),
    );
    expect(loadGateDEntry(tmpDir)).toBeNull();
  });

  it("creates .framework directory if missing", () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-d-fresh-"));
    try {
      const entry: GateDEntry = {
        status: "passed",
        environment: "staging",
        checks: [],
        checkedAt: new Date().toISOString(),
      };
      saveGateDEntry(freshDir, entry);
      expect(fs.existsSync(path.join(freshDir, ".framework/gates.json"))).toBe(true);
    } finally {
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it("does not leave .tmp file", () => {
    const entry: GateDEntry = {
      status: "passed",
      environment: "staging",
      checks: [],
      checkedAt: new Date().toISOString(),
    };
    saveGateDEntry(tmpDir, entry);
    expect(fs.existsSync(path.join(tmpDir, ".framework/gates.json.tmp"))).toBe(false);
  });
});
