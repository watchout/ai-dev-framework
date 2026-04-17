import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseAdfMeta,
  loadPlanFromGitHub,
  loadRunStateFromGitHub,
  warnLocalReadDeprecated,
  resetDeprecationWarning,
} from "./state-reader.js";
import { setGhExecutor } from "./github-engine.js";

// ─────────────────────────────────────────────
// parseAdfMeta tests
// ─────────────────────────────────────────────

describe("parseAdfMeta", () => {
  it("extracts valid adf-meta from Issue body", () => {
    const body = `## FEAT-001: Login

Some description

<!-- adf-meta:begin
{
  "version": "1.0",
  "type": "feature",
  "id": "FEAT-001",
  "migratedFrom": "plan.json",
  "migratedAt": "2026-04-17T00:00:00Z"
}
adf-meta:end -->`;

    const meta = parseAdfMeta(body);
    expect(meta).not.toBeNull();
    expect(meta!.version).toBe("1.0");
    expect(meta!.type).toBe("feature");
    expect(meta!.id).toBe("FEAT-001");
    expect(meta!.migratedFrom).toBe("plan.json");
  });

  it("returns null when no marker present", () => {
    expect(parseAdfMeta("Just a regular Issue body")).toBeNull();
  });

  it("returns null for malformed JSON in marker", () => {
    const body = `<!-- adf-meta:begin
{ invalid json }
adf-meta:end -->`;
    expect(parseAdfMeta(body)).toBeNull();
  });

  it("handles marker with extra whitespace", () => {
    const body = `<!--  adf-meta:begin
{"version":"1.0","type":"task","id":"T-1"}
adf-meta:end  -->`;
    const meta = parseAdfMeta(body);
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe("T-1");
  });
});

// ─────────────────────────────────────────────
// loadPlanFromGitHub tests
// ─────────────────────────────────────────────

describe("loadPlanFromGitHub", () => {
  let restoreGh: () => void;

  afterEach(() => {
    if (restoreGh) restoreGh();
  });

  it("returns null when no feature Issues exist", async () => {
    restoreGh = setGhExecutor(async () => "[]");
    const plan = await loadPlanFromGitHub();
    expect(plan).toBeNull();
  });

  it("converts feature Issues to PlanState", async () => {
    const issues = [
      {
        number: 100,
        title: "[FEAT-001] User Login",
        state: "open",
        labels: [{ name: "feature" }, { name: "P0" }],
        assignees: [],
        body: `## FEAT-001: User Login

| Field | Value |
|---|---|
| Priority | P0 |
| Size | M |
| Type | common |
| Dependencies | none |

<!-- adf-meta:begin
{"version":"1.0","type":"feature","id":"FEAT-001","migratedFrom":"plan.json","migratedAt":"2026-04-17T00:00:00Z"}
adf-meta:end -->`,
        url: "https://github.com/test/repo/issues/100",
      },
      {
        number: 101,
        title: "[FEAT-002] Dashboard",
        state: "open",
        labels: [{ name: "feature" }, { name: "P1" }],
        assignees: [],
        body: `## FEAT-002: Dashboard

| Field | Value |
|---|---|
| Priority | P1 |
| Size | L |
| Type | proprietary |
| Dependencies | FEAT-001 |

<!-- adf-meta:begin
{"version":"1.0","type":"feature","id":"FEAT-002","migratedFrom":"plan.json","migratedAt":"2026-04-17T00:00:00Z"}
adf-meta:end -->`,
        url: "https://github.com/test/repo/issues/101",
      },
    ];

    restoreGh = setGhExecutor(async (args: string[]) => {
      if (args.includes("feature")) {
        return JSON.stringify(issues);
      }
      return "[]";
    });

    const plan = await loadPlanFromGitHub();
    expect(plan).not.toBeNull();
    expect(plan!.status).toBe("generated");
    expect(plan!.waves).toHaveLength(1);
    expect(plan!.waves[0].features).toHaveLength(2);

    const feat1 = plan!.waves[0].features[0];
    expect(feat1.id).toBe("FEAT-001");
    expect(feat1.name).toBe("User Login");
    expect(feat1.priority).toBe("P0");
    expect(feat1.size).toBe("M");
    expect(feat1.type).toBe("common");
    expect(feat1.dependencies).toEqual([]);

    const feat2 = plan!.waves[0].features[1];
    expect(feat2.id).toBe("FEAT-002");
    expect(feat2.dependencies).toEqual(["FEAT-001"]);
  });

  it("extracts feature data from table when no adf-meta", async () => {
    const issues = [
      {
        number: 200,
        title: "[FEAT-X] Manual Feature",
        state: "open",
        labels: [{ name: "feature" }],
        assignees: [],
        body: `## FEAT-X: Manual Feature

| Field | Value |
|---|---|
| Priority | P2 |
| Size | S |
| Type | proprietary |
| Dependencies | none |`,
        url: "https://github.com/test/repo/issues/200",
      },
    ];

    restoreGh = setGhExecutor(async () => JSON.stringify(issues));

    const plan = await loadPlanFromGitHub();
    expect(plan).not.toBeNull();
    const feat = plan!.waves[0].features[0];
    expect(feat.id).toBe("FEAT-X");
    expect(feat.priority).toBe("P2");
    expect(feat.size).toBe("S");
  });
});

// ─────────────────────────────────────────────
// loadRunStateFromGitHub tests
// ─────────────────────────────────────────────

describe("loadRunStateFromGitHub", () => {
  let restoreGh: () => void;

  afterEach(() => {
    if (restoreGh) restoreGh();
  });

  it("returns no active task when none in-progress", async () => {
    restoreGh = setGhExecutor(async () => "[]");

    const state = await loadRunStateFromGitHub();
    expect(state.hasActiveTask).toBe(false);
    expect(state.activeTask).toBeNull();
    expect(state.openIssueCount).toBe(0);
  });

  it("returns active task when one exists", async () => {
    const activeIssue = {
      number: 50,
      title: "[FEAT-001-DB] Database",
      state: "open",
      labels: [{ name: "status:in-progress" }],
      assignees: [{ login: "bot" }],
      body: "task body",
      url: "https://github.com/test/repo/issues/50",
    };

    let callCount = 0;
    restoreGh = setGhExecutor(async (args: string[]) => {
      callCount++;
      if (args.includes("status:in-progress")) {
        return JSON.stringify([activeIssue]);
      }
      return JSON.stringify([activeIssue]);
    });

    const state = await loadRunStateFromGitHub();
    expect(state.hasActiveTask).toBe(true);
    expect(state.activeTask).not.toBeNull();
    expect(state.activeTask!.number).toBe(50);
  });
});

// ─────────────────────────────────────────────
// Deprecation warning tests
// ─────────────────────────────────────────────

describe("warnLocalReadDeprecated", () => {
  beforeEach(() => {
    resetDeprecationWarning();
  });

  it("warns once then suppresses", () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    warnLocalReadDeprecated("test-caller");
    warnLocalReadDeprecated("test-caller-2");

    console.warn = origWarn;

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("deprecated");
    expect(warnings[0]).toContain("test-caller");
  });
});
