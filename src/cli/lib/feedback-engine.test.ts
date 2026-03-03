/**
 * Tests for feedback-engine.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Proposal, ProposalStore } from "./feedback-model.js";
import {
  loadProposals,
  saveProposals,
  listPendingProposals,
  approveProposal,
  rejectProposal,
  applyDiff,
  notifyProposal,
} from "./feedback-engine.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeProposal(overrides?: Partial<Proposal>): Proposal {
  return {
    id: "PROP-001",
    createdAt: "2026-03-03T00:00:00.000Z",
    sourceProject: "test-project",
    category: "gate",
    title: "Add Gate D",
    problem: "Gate D is missing",
    proposedChange: {
      target: "src/example.ts",
      diff: "// gate D logic",
    },
    impact: "Improves quality",
    status: "pending",
    approvedAt: null,
    rejectedReason: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// loadProposals / saveProposals
// ─────────────────────────────────────────────

describe("loadProposals", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-load-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty store when file does not exist", () => {
    const store = loadProposals(tmpDir);
    expect(store.proposals).toEqual([]);
  });

  it("returns empty store for corrupted JSON", () => {
    const dir = path.join(tmpDir, ".framework/feedback");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "proposals.json"), "not json", "utf-8");
    const store = loadProposals(tmpDir);
    expect(store.proposals).toEqual([]);
  });

  it("loads saved proposals", () => {
    const store: ProposalStore = {
      proposals: [makeProposal()],
    };
    saveProposals(tmpDir, store);

    const loaded = loadProposals(tmpDir);
    expect(loaded.proposals).toHaveLength(1);
    expect(loaded.proposals[0].id).toBe("PROP-001");
  });
});

describe("saveProposals", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-save-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directory and file if missing", () => {
    const store: ProposalStore = { proposals: [makeProposal()] };
    saveProposals(tmpDir, store);

    const filePath = path.join(tmpDir, ".framework/feedback/proposals.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("round-trips correctly", () => {
    const original: ProposalStore = {
      proposals: [
        makeProposal({ id: "PROP-A" }),
        makeProposal({ id: "PROP-B", category: "skill" }),
      ],
    };
    saveProposals(tmpDir, original);
    const loaded = loadProposals(tmpDir);
    expect(loaded.proposals).toHaveLength(2);
    expect(loaded.proposals[0].id).toBe("PROP-A");
    expect(loaded.proposals[1].id).toBe("PROP-B");
    expect(loaded.proposals[1].category).toBe("skill");
  });
});

// ─────────────────────────────────────────────
// listPendingProposals
// ─────────────────────────────────────────────

describe("listPendingProposals", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-pending-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no proposals exist", () => {
    expect(listPendingProposals(tmpDir)).toEqual([]);
  });

  it("filters to pending only", () => {
    const store: ProposalStore = {
      proposals: [
        makeProposal({ id: "P1", status: "pending" }),
        makeProposal({ id: "P2", status: "approved", approvedAt: "2026-03-03T12:00:00Z" }),
        makeProposal({ id: "P3", status: "rejected", rejectedReason: "no" }),
        makeProposal({ id: "P4", status: "pending" }),
      ],
    };
    saveProposals(tmpDir, store);

    const pending = listPendingProposals(tmpDir);
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe("P1");
    expect(pending[1].id).toBe("P4");
  });
});

// ─────────────────────────────────────────────
// approveProposal
// ─────────────────────────────────────────────

describe("approveProposal", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-approve-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns error when proposal not found", () => {
    saveProposals(tmpDir, { proposals: [] });
    const result = approveProposal(tmpDir, "PROP-NONEXISTENT");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when proposal is already approved", () => {
    const store: ProposalStore = {
      proposals: [
        makeProposal({ id: "P1", status: "approved", approvedAt: "2026-01-01T00:00:00Z" }),
      ],
    };
    saveProposals(tmpDir, store);

    const result = approveProposal(tmpDir, "P1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already approved");
  });

  it("applies diff and updates status to approved", () => {
    const targetFile = "target.txt";
    const store: ProposalStore = {
      proposals: [
        makeProposal({
          id: "P1",
          proposedChange: { target: targetFile, diff: "new content" },
        }),
      ],
    };
    saveProposals(tmpDir, store);

    const result = approveProposal(tmpDir, "P1");
    expect(result.ok).toBe(true);

    // Verify the diff was applied
    const targetPath = path.join(tmpDir, targetFile);
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.readFileSync(targetPath, "utf-8")).toBe("new content");

    // Verify status was updated
    const updated = loadProposals(tmpDir);
    expect(updated.proposals[0].status).toBe("approved");
    expect(updated.proposals[0].approvedAt).not.toBeNull();
  });

  it("returns error when diff application fails (invalid directory)", () => {
    const store: ProposalStore = {
      proposals: [
        makeProposal({
          id: "P1",
          proposedChange: { target: "/dev/null/impossible/file.txt", diff: "x" },
        }),
      ],
    };
    saveProposals(tmpDir, store);

    const result = approveProposal(tmpDir, "P1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to apply diff");
  });
});

// ─────────────────────────────────────────────
// rejectProposal
// ─────────────────────────────────────────────

describe("rejectProposal", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-reject-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns error when proposal not found", () => {
    saveProposals(tmpDir, { proposals: [] });
    const result = rejectProposal(tmpDir, "PROP-NONEXISTENT");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when proposal is already rejected", () => {
    const store: ProposalStore = {
      proposals: [makeProposal({ id: "P1", status: "rejected", rejectedReason: "old" })],
    };
    saveProposals(tmpDir, store);

    const result = rejectProposal(tmpDir, "P1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already rejected");
  });

  it("rejects a pending proposal with reason", () => {
    const store: ProposalStore = {
      proposals: [makeProposal({ id: "P1" })],
    };
    saveProposals(tmpDir, store);

    const result = rejectProposal(tmpDir, "P1", "Not applicable");
    expect(result.ok).toBe(true);

    const updated = loadProposals(tmpDir);
    expect(updated.proposals[0].status).toBe("rejected");
    expect(updated.proposals[0].rejectedReason).toBe("Not applicable");
  });

  it("rejects a pending proposal without reason", () => {
    const store: ProposalStore = {
      proposals: [makeProposal({ id: "P1" })],
    };
    saveProposals(tmpDir, store);

    const result = rejectProposal(tmpDir, "P1");
    expect(result.ok).toBe(true);

    const updated = loadProposals(tmpDir);
    expect(updated.proposals[0].status).toBe("rejected");
    expect(updated.proposals[0].rejectedReason).toBeNull();
  });
});

// ─────────────────────────────────────────────
// applyDiff
// ─────────────────────────────────────────────

describe("applyDiff", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-diff-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates file when target does not exist", () => {
    const target = path.join(tmpDir, "new-file.txt");
    applyDiff(target, "hello world");
    expect(fs.readFileSync(target, "utf-8")).toBe("hello world");
  });

  it("creates nested directories for target", () => {
    const target = path.join(tmpDir, "a/b/c/file.txt");
    applyDiff(target, "deep content");
    expect(fs.readFileSync(target, "utf-8")).toBe("deep content");
  });

  it("appends to existing file", () => {
    const target = path.join(tmpDir, "existing.txt");
    fs.writeFileSync(target, "original", "utf-8");

    applyDiff(target, "appended");
    expect(fs.readFileSync(target, "utf-8")).toBe("original\nappended");
  });
});

// ─────────────────────────────────────────────
// notifyProposal
// ─────────────────────────────────────────────

describe("notifyProposal", () => {
  it("does not throw when openclaw is not available", () => {
    const proposal = makeProposal();
    // notifyProposal uses spawnSync which returns an error object if command not found
    // but does not throw — so this should not throw either
    expect(() => notifyProposal(proposal)).not.toThrow();
  });
});
