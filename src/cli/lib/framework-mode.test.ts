import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
    let callIndex = 0;
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      callIndex++;
      // First call: getFrameworkMode → inactive
      if (args.includes("--jq")) return JSON.stringify(["existing-topic"]);
      // Second call: gh repo edit --add-topic
      return "";
    });

    const result = await activateFrameworkMode();
    expect(result.ok).toBe(true);
    expect(result.alreadyActive).toBe(false);

    const addCall = ghCalls.find((c) => c.includes("--add-topic"));
    expect(addCall).toBeDefined();
    expect(addCall).toContain(FRAMEWORK_TOPIC);
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
      // getFrameworkMode → active
      if (args.includes("--jq")) return JSON.stringify(["framework-managed", "keep-this"]);
      // gh repo edit --remove-topic
      return "";
    });

    const result = await deactivateFrameworkMode("any-token");
    expect(result.ok).toBe(true);

    const removeCall = ghCalls.find((c) => c.includes("--remove-topic"));
    expect(removeCall).toBeDefined();
    expect(removeCall).toContain(FRAMEWORK_TOPIC);
  });

  it("succeeds when topic already absent", async () => {
    restoreGh = setGhExecutor(async () => JSON.stringify(["other"]));

    const result = await deactivateFrameworkMode("token");
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Shell hook tests (framework-mode-check.sh)
// ─────────────────────────────────────────────

describe("framework-mode-check.sh", () => {
  let tmpDir: string;
  const scriptPath = path.resolve("templates/hooks/framework-mode-check.sh");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mode-check-"));
    // Create mock gh that returns topics
    fs.mkdirSync(path.join(tmpDir, "bin"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeMockGh(topics: string[]): void {
    const script = `#!/bin/bash\necho '${JSON.stringify(topics)}'`;
    fs.writeFileSync(path.join(tmpDir, "bin/gh"), script, { mode: 0o755 });
  }

  function runModeCheck(env: Record<string, string> = {}): number {
    // Wrap in a script that sources the mode-check, then runs a marker command
    const wrapper = `#!/bin/bash\nsource "${scriptPath}"\necho "HOOK_ACTIVE"`;
    const wrapperPath = path.join(tmpDir, "test-hook.sh");
    fs.writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

    try {
      const result = execSync(`bash "${wrapperPath}"`, {
        env: {
          ...process.env,
          PATH: `${tmpDir}/bin:${process.env.PATH}`,
          CLAUDE_PROJECT_DIR: tmpDir,
          ...env,
        },
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      // If HOOK_ACTIVE is in output, the hook continued (framework active)
      return result.includes("HOOK_ACTIVE") ? 1 : 0;
    } catch {
      // exit 0 from mode-check → shell exits before HOOK_ACTIVE
      return 0;
    }
  }

  it("passes through when topic is absent (inactive)", () => {
    writeMockGh(["other-topic"]);
    const result = runModeCheck();
    expect(result).toBe(0); // exited early, hook is no-op
  });

  it("continues enforcement when topic is present (active)", () => {
    writeMockGh(["framework-managed"]);
    const result = runModeCheck();
    expect(result).toBe(1); // reached HOOK_ACTIVE
  });

  it("passes through with FRAMEWORK_BYPASS set", () => {
    writeMockGh(["framework-managed"]);
    const result = runModeCheck({ FRAMEWORK_BYPASS: "some-token" });
    expect(result).toBe(0); // bypassed
  });
});
