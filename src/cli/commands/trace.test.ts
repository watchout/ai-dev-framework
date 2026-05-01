import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * CLI integration test for framework trace command.
 * Validates that the command module exports are correctly structured.
 */
describe("trace command", () => {
  it("trace.ts exports registerTraceCommand", async () => {
    const mod = await import("./trace.js");
    expect(typeof mod.registerTraceCommand).toBe("function");
  });

  it("trace.ts is registered in index.ts", () => {
    const indexPath = path.resolve("src/cli/index.ts");
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain("registerTraceCommand");
    expect(content).toContain("./commands/trace.js");
  });
});
