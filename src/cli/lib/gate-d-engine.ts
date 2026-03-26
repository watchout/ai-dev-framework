/**
 * Gate D — Post-Deploy Verification Engine
 *
 * ADR-009 (revised): Verifies deployed environment is functional.
 * Phase 1: D-1 (Health Check) + D-2 (SSL/TLS) + D-3 (Page Display)
 * Phase 2+: D-4 (E2E Smoke), D-5 (Error Monitor) — skipped for now.
 */
import * as tls from "node:tls";
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface GateDCheck {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  warning?: boolean;
  url?: string;
  statusCode?: number;
  pages?: string[];
  screenshot?: string;
}

export type GateDStatus = "passed" | "failed" | "pending" | "skipped";

export interface GateDEntry {
  status: GateDStatus;
  environment: string;
  checks: GateDCheck[];
  checkedAt: string;
  deployedAt?: string;
  deployCommit?: string;
}

export interface GateDOptions {
  baseUrl: string;
  environment?: string;
  healthPath?: string;
  pages?: string[];
  deployCommit?: string;
  skipSsl?: boolean;
}

export interface GateDResult {
  entry: GateDEntry;
  allPassed: boolean;
  errors: string[];
}

// ─────────────────────────────────────────────
// HTTP fetcher (injectable for testing)
// ─────────────────────────────────────────────

export type HttpFetcher = (url: string) => Promise<{ status: number; ok: boolean }>;

let _fetcher: HttpFetcher = defaultFetcher;

async function defaultFetcher(url: string): Promise<{ status: number; ok: boolean }> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, ok: response.ok };
}

export function setHttpFetcher(fetcher: HttpFetcher): () => void {
  const prev = _fetcher;
  _fetcher = fetcher;
  return () => { _fetcher = prev; };
}

// ─────────────────────────────────────────────
// TLS checker (injectable for testing)
// ─────────────────────────────────────────────

export interface TlsCertInfo {
  valid: boolean;
  expiresAt: Date;
  issuer: string;
  selfSigned: boolean;
  error?: string;
}

export type TlsChecker = (hostname: string, port: number) => Promise<TlsCertInfo>;

let _tlsChecker: TlsChecker = defaultTlsChecker;

async function defaultTlsChecker(hostname: string, port: number): Promise<TlsCertInfo> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      socket.destroy();

      if (!cert || !cert.valid_to) {
        resolve({ valid: false, expiresAt: new Date(0), issuer: "", selfSigned: false, error: "No certificate" });
        return;
      }

      const expiresAt = new Date(cert.valid_to);
      const issuer = typeof cert.issuer === "object" ? (cert.issuer.O ?? cert.issuer.CN ?? "") : String(cert.issuer);
      const subject = typeof cert.subject === "object" ? (cert.subject.O ?? cert.subject.CN ?? "") : String(cert.subject);
      const selfSigned = issuer === subject;

      resolve({
        valid: authorized && expiresAt > new Date(),
        expiresAt,
        issuer,
        selfSigned,
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ valid: false, expiresAt: new Date(0), issuer: "", selfSigned: false, error: err.message });
    });

    socket.setTimeout(10_000, () => {
      socket.destroy();
      resolve({ valid: false, expiresAt: new Date(0), issuer: "", selfSigned: false, error: "Connection timeout" });
    });
  });
}

export function setTlsChecker(checker: TlsChecker): () => void {
  const prev = _tlsChecker;
  _tlsChecker = checker;
  return () => { _tlsChecker = prev; };
}

// ─────────────────────────────────────────────
// D-2: SSL/TLS Certificate Check
// ─────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 30;

export async function checkSSL(baseUrl: string): Promise<GateDCheck> {
  // HTTP URLs fail immediately
  if (!baseUrl.startsWith("https://")) {
    return {
      id: "D-2",
      name: "SSL/TLS",
      passed: false,
      url: baseUrl,
      message: "URL must use HTTPS",
    };
  }

  const urlObj = new URL(baseUrl);
  const hostname = urlObj.hostname;
  const port = urlObj.port ? parseInt(urlObj.port, 10) : 443;

  try {
    const cert = await _tlsChecker(hostname, port);

    if (cert.error) {
      return {
        id: "D-2",
        name: "SSL/TLS",
        passed: false,
        url: baseUrl,
        message: `TLS error: ${cert.error}`,
      };
    }

    if (cert.selfSigned) {
      return {
        id: "D-2",
        name: "SSL/TLS",
        passed: false,
        url: baseUrl,
        message: "Self-signed certificate detected",
      };
    }

    if (!cert.valid) {
      return {
        id: "D-2",
        name: "SSL/TLS",
        passed: false,
        url: baseUrl,
        message: `Certificate expired or invalid (expires: ${cert.expiresAt.toISOString()})`,
      };
    }

    // Check expiry warning
    const daysUntilExpiry = Math.floor((cert.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
      return {
        id: "D-2",
        name: "SSL/TLS",
        passed: true,
        warning: true,
        url: baseUrl,
        message: `Certificate valid but expires in ${daysUntilExpiry} days (${cert.expiresAt.toISOString()})`,
      };
    }

    return {
      id: "D-2",
      name: "SSL/TLS",
      passed: true,
      url: baseUrl,
      message: `Certificate valid (issuer: ${cert.issuer}, expires: ${cert.expiresAt.toISOString()})`,
    };
  } catch (err) {
    return {
      id: "D-2",
      name: "SSL/TLS",
      passed: false,
      url: baseUrl,
      message: `SSL check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─────────────────────────────────────────────
// D-1: Health Check
// ─────────────────────────────────────────────

export async function checkHealth(
  baseUrl: string,
  healthPath = "/api/health",
): Promise<GateDCheck> {
  const url = `${baseUrl.replace(/\/$/, "")}${healthPath}`;
  try {
    const res = await _fetcher(url);
    return {
      id: "D-1",
      name: "Health Check",
      passed: res.status === 200,
      url,
      statusCode: res.status,
      message: res.status === 200
        ? "Health endpoint returned 200"
        : `Health endpoint returned ${res.status}`,
    };
  } catch (err) {
    return {
      id: "D-1",
      name: "Health Check",
      passed: false,
      url,
      message: `Failed to reach health endpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─────────────────────────────────────────────
// D-3: Page Display
// ─────────────────────────────────────────────

export async function checkPages(
  baseUrl: string,
  pages: string[] = ["/", "/login"],
): Promise<GateDCheck> {
  const base = baseUrl.replace(/\/$/, "");
  const results: { page: string; status: number; ok: boolean }[] = [];
  const failedPages: string[] = [];

  for (const page of pages) {
    const url = `${base}${page}`;
    try {
      const res = await _fetcher(url);
      results.push({ page, status: res.status, ok: res.ok });
      if (!res.ok) {
        failedPages.push(`${page} (${res.status})`);
      }
    } catch (err) {
      results.push({ page, status: 0, ok: false });
      failedPages.push(`${page} (unreachable: ${err instanceof Error ? err.message : "error"})`);
    }
  }

  const allOk = failedPages.length === 0;
  return {
    id: "D-3",
    name: "Page Display",
    passed: allOk,
    pages,
    message: allOk
      ? `All ${pages.length} pages returned 200`
      : `Failed pages: ${failedPages.join(", ")}`,
  };
}

// ─────────────────────────────────────────────
// Main verify function
// ─────────────────────────────────────────────

export async function runGateDVerify(
  options: GateDOptions,
): Promise<GateDResult> {
  const errors: string[] = [];
  const checks: GateDCheck[] = [];

  // D-1: Health Check
  const d1 = await checkHealth(options.baseUrl, options.healthPath);
  checks.push(d1);

  // D-2: SSL/TLS
  if (options.skipSsl) {
    checks.push({
      id: "D-2",
      name: "SSL/TLS",
      passed: true,
      message: "Skipped (--skip-ssl)",
    });
  } else {
    const d2 = await checkSSL(options.baseUrl);
    checks.push(d2);
  }

  // D-3: Page Display
  const d3 = await checkPages(options.baseUrl, options.pages);
  checks.push(d3);

  // D-4: E2E Smoke — Phase 1 skipped
  checks.push({
    id: "D-4",
    name: "E2E Smoke",
    passed: true,
    message: "Skipped (Phase 2)",
  });

  // D-5: Error Monitor — Phase 1 skipped
  checks.push({
    id: "D-5",
    name: "Error Monitor",
    passed: true,
    message: "Skipped (Phase 3)",
  });

  const activeChecks = checks.filter((c) => !c.message.startsWith("Skipped"));
  const allPassed = activeChecks.every((c) => c.passed);

  const entry: GateDEntry = {
    status: allPassed ? "passed" : "failed",
    environment: options.environment ?? "staging",
    checks,
    checkedAt: new Date().toISOString(),
    deployCommit: options.deployCommit,
  };

  if (!allPassed) {
    for (const c of activeChecks.filter((c) => !c.passed)) {
      errors.push(`${c.id} ${c.name}: ${c.message}`);
    }
  }

  return { entry, allPassed, errors };
}

// ─────────────────────────────────────────────
// Persistence (write gateD to gates.json)
// ─────────────────────────────────────────────

const GATE_STATE_FILE = ".framework/gates.json";

export function saveGateDEntry(
  projectDir: string,
  entry: GateDEntry,
): void {
  const filePath = path.join(projectDir, GATE_STATE_FILE);

  let state: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      state = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch { /* start fresh */ }
  } else {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  state.gateD = entry;
  state.updatedAt = new Date().toISOString();

  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

export function loadGateDEntry(
  projectDir: string,
): GateDEntry | null {
  const filePath = path.join(projectDir, GATE_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return (raw.gateD as GateDEntry) ?? null;
  } catch {
    return null;
  }
}
