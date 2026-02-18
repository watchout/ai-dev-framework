import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installMcpJson } from "./mcp-installer.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-installer-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("installMcpJson", () => {
  it("creates .mcp.json when none exists", () => {
    const result = installMcpJson(tmpDir);
    expect(result.installed).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(content.mcpServers.playwright).toEqual({
      command: "npx",
      args: ["@playwright/mcp@latest"],
    });
  });

  it("merges with existing .mcp.json preserving other servers", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          filesystem: { command: "node", args: ["server.js"] },
        },
      }),
    );

    const result = installMcpJson(tmpDir);
    expect(result.installed).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(content.mcpServers.filesystem).toEqual({
      command: "node",
      args: ["server.js"],
    });
    expect(content.mcpServers.playwright).toEqual({
      command: "npx",
      args: ["@playwright/mcp@latest"],
    });
  });

  it("skips when playwright already configured", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
        },
      }),
    );

    const result = installMcpJson(tmpDir);
    expect(result.installed).toBe(false);
    expect(result.reason).toContain("already configured");
  });

  it("handles invalid JSON in existing .mcp.json", () => {
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), "not json{{{");

    const result = installMcpJson(tmpDir);
    expect(result.installed).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(content.mcpServers.playwright).toBeDefined();
  });

  it("handles .mcp.json with empty mcpServers", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      JSON.stringify({ mcpServers: {} }),
    );

    const result = installMcpJson(tmpDir);
    expect(result.installed).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(content.mcpServers.playwright).toBeDefined();
  });

  it("handles .mcp.json without mcpServers key", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      JSON.stringify({ other: "data" }),
    );

    const result = installMcpJson(tmpDir);
    expect(result.installed).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(content.other).toBe("data");
    expect(content.mcpServers.playwright).toBeDefined();
  });
});
