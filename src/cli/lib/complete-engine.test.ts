/**
 * Tests for complete-engine.ts
 * Ref: #367 — merge-vs-complete separation
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadCompleteEvidence,
  saveCompleteEvidence,
  loadShirubeProfile,
  buildRecord,
  isCompleted,
  renderStatus,
} from "./complete-engine.js";
import type { CompleteEvidenceStore, ShirubeProfile } from "./complete-model.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "complete-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// loadCompleteEvidence
// ─────────────────────────────────────────────

describe("loadCompleteEvidence", () => {
  it("returns empty store when file missing", () => {
    const store = loadCompleteEvidence(tmpDir);
    expect(store.records).toEqual([]);
  });

  it("returns empty store on corrupt JSON", () => {
    const dir = path.join(tmpDir, ".framework");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "complete-evidence.json"), "not-json", "utf-8");
    const store = loadCompleteEvidence(tmpDir);
    expect(store.records).toEqual([]);
  });

  it("round-trips saved evidence", () => {
    const store: CompleteEvidenceStore = {
      records: [
        buildRecord({
          prNumber: "42",
          sha: "abc123",
          checks: [{ name: "deploy-confirmed", passed: true }],
          forced: false,
        }),
      ],
    };
    saveCompleteEvidence(tmpDir, store);
    const loaded = loadCompleteEvidence(tmpDir);
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0].prNumber).toBe("42");
    expect(loaded.records[0].sha).toBe("abc123");
  });
});

// ─────────────────────────────────────────────
// saveCompleteEvidence
// ─────────────────────────────────────────────

describe("saveCompleteEvidence", () => {
  it("creates directories and file", () => {
    saveCompleteEvidence(tmpDir, { records: [] });
    expect(
      fs.existsSync(path.join(tmpDir, ".framework/complete-evidence.json")),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────
// loadShirubeProfile
// ─────────────────────────────────────────────

describe("loadShirubeProfile", () => {
  it("returns null when profile missing", () => {
    expect(loadShirubeProfile(tmpDir)).toBeNull();
  });

  it("loads runtime profile", () => {
    const profile: ShirubeProfile = {
      repo_id: "watchout/agent-comms-mcp",
      repo_type: "mcp-core",
      runtime: true,
      protected_surfaces: ["routing"],
      allowed_tier: "all",
      ci_gate_0: { required_checks: ["test"] },
      complete_evidence: {
        types: ["health-check"],
        health_endpoint: "/health",
        smoke_command: "npm run smoke",
      },
    };
    const dir = path.join(tmpDir, ".shirube");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(profile), "utf-8");

    const loaded = loadShirubeProfile(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.runtime).toBe(true);
    expect(loaded!.complete_evidence?.health_endpoint).toBe("/health");
  });

  it("loads non-runtime profile", () => {
    const profile: ShirubeProfile = {
      repo_id: "watchout/ai-dev-framework",
      repo_type: "framework",
      runtime: false,
      protected_surfaces: ["governance"],
      allowed_tier: "all",
      ci_gate_0: { required_checks: ["test"] },
    };
    const dir = path.join(tmpDir, ".shirube");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.json"), JSON.stringify(profile), "utf-8");

    const loaded = loadShirubeProfile(tmpDir);
    expect(loaded!.runtime).toBe(false);
  });
});

// ─────────────────────────────────────────────
// buildRecord
// ─────────────────────────────────────────────

describe("buildRecord", () => {
  it("builds a record with all fields", () => {
    const record = buildRecord({
      prNumber: "99",
      sha: "deadbeef",
      checks: [
        { name: "deploy-confirmed", passed: true },
        { name: "health-check", passed: false, detail: "timeout" },
      ],
      forced: true,
    });

    expect(record.prNumber).toBe("99");
    expect(record.sha).toBe("deadbeef");
    expect(record.forced).toBe(true);
    expect(record.checks).toHaveLength(2);
    expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─────────────────────────────────────────────
// isCompleted
// ─────────────────────────────────────────────

describe("isCompleted", () => {
  it("returns null for unknown PR", () => {
    const store: CompleteEvidenceStore = { records: [] };
    expect(isCompleted("999", store)).toBeNull();
  });

  it("returns the record for a known PR", () => {
    const record = buildRecord({
      prNumber: "42",
      sha: "abc",
      checks: [],
      forced: false,
    });
    const store: CompleteEvidenceStore = { records: [record] };
    expect(isCompleted("42", store)).not.toBeNull();
    expect(isCompleted("42", store)!.prNumber).toBe("42");
  });
});

// ─────────────────────────────────────────────
// renderStatus
// ─────────────────────────────────────────────

describe("renderStatus", () => {
  it("shows 'No complete records' when empty", () => {
    const output = renderStatus({ records: [] }, null);
    expect(output).toContain("No complete records");
  });

  it("shows repo type when profile present", () => {
    const profile: ShirubeProfile = {
      repo_id: "watchout/agent-comms-mcp",
      repo_type: "mcp-core",
      runtime: true,
      protected_surfaces: [],
      allowed_tier: "all",
      ci_gate_0: { required_checks: [] },
    };
    const output = renderStatus({ records: [] }, profile);
    expect(output).toContain("watchout/agent-comms-mcp");
    expect(output).toContain("runtime");
  });

  it("shows forced warning", () => {
    const record = buildRecord({
      prNumber: "7",
      sha: "abc",
      checks: [{ name: "deploy-confirmed", passed: false }],
      forced: true,
    });
    const output = renderStatus({ records: [record] }, null);
    expect(output).toContain("--force");
    expect(output).toContain("⚠");
  });

  it("shows checkmark for all-passed record", () => {
    const record = buildRecord({
      prNumber: "8",
      sha: "abc",
      checks: [{ name: "deploy-confirmed", passed: true }],
      forced: false,
    });
    const output = renderStatus({ records: [record] }, null);
    expect(output).toContain("✓ PR #8");
  });
});
