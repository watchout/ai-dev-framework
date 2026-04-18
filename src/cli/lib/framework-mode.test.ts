import { describe, it, expect, afterEach } from "vitest";
import {
  getFrameworkMode,
  activateFrameworkMode,
  deactivateFrameworkMode,
  FRAMEWORK_TOPIC,
} from "./framework-mode.js";
import { setGhExecutor } from "./github-engine.js";

describe("getFrameworkMode", () => {
  let restoreGh: () => void;

  afterEach(() => {
    if (restoreGh) restoreGh();
  });

  it("returns active when topic is present", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify(["framework-managed", "other-topic"]),
    );
    expect(await getFrameworkMode()).toBe("active");
  });

  it("returns inactive when topic is absent", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify(["other-topic"]),
    );
    expect(await getFrameworkMode()).toBe("inactive");
  });

  it("returns inactive for empty topics", async () => {
    restoreGh = setGhExecutor(async () => "[]");
    expect(await getFrameworkMode()).toBe("inactive");
  });

  it("returns unknown on gh error", async () => {
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: not authenticated");
    });
    expect(await getFrameworkMode()).toBe("unknown");
  });
});

describe("activateFrameworkMode", () => {
  let restoreGh: () => void;
  let ghCalls: string[][] = [];

  afterEach(() => {
    if (restoreGh) restoreGh();
    ghCalls = [];
  });

  it("adds topic when not present", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args.includes("--method")) return "";
      return JSON.stringify(["existing-topic"]);
    });

    const result = await activateFrameworkMode();
    expect(result.ok).toBe(true);
    expect(result.alreadyActive).toBe(false);

    const putCall = ghCalls.find((c) => c.includes("PUT"));
    expect(putCall).toBeDefined();
    const namesArg = putCall!.find((a) => a.startsWith("names="));
    expect(namesArg).toContain(FRAMEWORK_TOPIC);
  });

  it("returns alreadyActive when topic exists", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify(["framework-managed"]),
    );

    const result = await activateFrameworkMode();
    expect(result.ok).toBe(true);
    expect(result.alreadyActive).toBe(true);
  });

  it("returns error on gh failure", async () => {
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: permission denied");
    });

    const result = await activateFrameworkMode();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("permission denied");
  });
});

describe("deactivateFrameworkMode", () => {
  let restoreGh: () => void;
  let ghCalls: string[][] = [];

  afterEach(() => {
    if (restoreGh) restoreGh();
    ghCalls = [];
    delete process.env.FRAMEWORK_BYPASS_EXPECTED;
  });

  it("rejects without token", async () => {
    const result = await deactivateFrameworkMode("");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("token required");
  });

  it("rejects with wrong token when expected is set", async () => {
    process.env.FRAMEWORK_BYPASS_EXPECTED = "correct-token";
    const result = await deactivateFrameworkMode("wrong-token");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("removes topic with valid token", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args.includes("--method")) return "";
      return JSON.stringify(["framework-managed", "keep-this"]);
    });

    const result = await deactivateFrameworkMode("any-token");
    expect(result.ok).toBe(true);

    const putCall = ghCalls.find((c) => c.includes("PUT"));
    expect(putCall).toBeDefined();
    const namesArg = putCall!.find((a) => a.startsWith("names="));
    expect(namesArg).not.toContain(FRAMEWORK_TOPIC);
    expect(namesArg).toContain("keep-this");
  });

  it("succeeds when topic already absent", async () => {
    restoreGh = setGhExecutor(async () => JSON.stringify(["other"]));

    const result = await deactivateFrameworkMode("token");
    expect(result.ok).toBe(true);
  });
});
