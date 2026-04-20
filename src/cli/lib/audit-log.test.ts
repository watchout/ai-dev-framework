import { describe, it, expect, afterEach } from "vitest";
import { appendAuditLog, logFrameworkExit, logFrameworkActivation, hashTokenPrefix, validateTokenByHash } from "./audit-log.js";
import { setGhExecutor } from "./github-engine.js";

describe("appendAuditLog", () => {
  let restoreGh: () => void;
  let ghCalls: string[][] = [];

  afterEach(() => {
    if (restoreGh) restoreGh();
    ghCalls = [];
  });

  it("creates audit-log Issue if none exists, then appends comment", async () => {
    let callCount = 0;
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      callCount++;
      if (callCount === 1) return "[]"; // no existing audit Issue
      if (callCount === 2) return "https://github.com/test/repo/issues/99"; // create
      if (callCount === 3) return ""; // comment
      return "";
    });

    const result = await appendAuditLog({
      timestamp: "2026-04-20T00:00:00Z",
      actor: "test-bot",
      action: "framework exit",
      reason: "maintenance",
    });

    expect(result).toBe(true);
    expect(ghCalls).toHaveLength(3);

    // Verify Issue creation
    const createCall = ghCalls[1];
    expect(createCall).toContain("issue");
    expect(createCall).toContain("create");

    // Verify comment
    const commentCall = ghCalls[2];
    expect(commentCall).toContain("comment");
    expect(commentCall).toContain("99");
  });

  it("appends to existing audit-log Issue", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args.includes("list")) return JSON.stringify([{ number: 42 }]);
      return ""; // comment
    });

    const result = await appendAuditLog({
      timestamp: "2026-04-20T00:00:00Z",
      actor: "test-bot",
      action: "gate reset",
      reason: "testing",
    });

    expect(result).toBe(true);
    expect(ghCalls).toHaveLength(2);
    const commentCall = ghCalls[1];
    expect(commentCall).toContain("42");
  });

  it("returns false on gh error", async () => {
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: not authenticated");
    });

    const result = await appendAuditLog({
      timestamp: "2026-04-20T00:00:00Z",
      actor: "test-bot",
      action: "framework exit",
      reason: "test",
    });

    expect(result).toBe(false);
  });
});

describe("logFrameworkExit", () => {
  let restoreGh: () => void;
  let ghCalls: string[][] = [];

  afterEach(() => {
    if (restoreGh) restoreGh();
    ghCalls = [];
  });

  it("logs exit with correct action field", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args.includes("list")) return JSON.stringify([{ number: 10 }]);
      return "";
    });

    const result = await logFrameworkExit("CEO approved shutdown");
    expect(result).toBe(true);

    const commentCall = ghCalls[1];
    const bodyIdx = commentCall.indexOf("--body") + 1;
    expect(commentCall[bodyIdx]).toContain("framework exit");
    expect(commentCall[bodyIdx]).toContain("CEO approved shutdown");
  });

  it("includes token hash prefix when token provided", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args.includes("list")) return JSON.stringify([{ number: 10 }]);
      return "";
    });

    await logFrameworkExit("test", "my-secret-token");
    // Find the comment call (has --body)
    const commentCall = ghCalls.find(c => c.includes("--body"));
    expect(commentCall).toBeDefined();
    const bodyIdx = commentCall!.indexOf("--body") + 1;
    const body = commentCall![bodyIdx];
    expect(body).toContain("Token validation");
    expect(body).not.toContain("my-secret-token");
  });

  it("logFrameworkActivation records activation event", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args.includes("list")) return JSON.stringify([{ number: 10 }]);
      return "";
    });

    const result = await logFrameworkActivation("init-bot");
    expect(result).toBe(true);

    const commentCall = ghCalls[1];
    const bodyIdx = commentCall.indexOf("--body") + 1;
    expect(commentCall[bodyIdx]).toContain("framework activate");
    expect(commentCall[bodyIdx]).toContain("init-bot");
  });
});

describe("hashTokenPrefix / validateTokenByHash", () => {
  it("returns consistent 8-char hex prefix", () => {
    const hash = hashTokenPrefix("test-token");
    expect(hash).toHaveLength(8);
    expect(hashTokenPrefix("test-token")).toBe(hash);
  });

  it("different tokens produce different hashes", () => {
    expect(hashTokenPrefix("token-a")).not.toBe(hashTokenPrefix("token-b"));
  });

  it("validateTokenByHash returns true for matching token", () => {
    const hash = hashTokenPrefix("correct-token");
    expect(validateTokenByHash("correct-token", hash)).toBe(true);
  });

  it("validateTokenByHash returns false for wrong token", () => {
    const hash = hashTokenPrefix("correct-token");
    expect(validateTokenByHash("wrong-token", hash)).toBe(false);
  });
});
