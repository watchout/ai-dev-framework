/**
 * mcp-installer.ts - Install .mcp.json for Playwright MCP browser automation.
 *
 * Uses dedicated Chromium (not user's Chrome) to avoid Claude extension conflicts.
 * Merges with existing .mcp.json to preserve other MCP servers.
 */
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Install or merge Playwright MCP server into .mcp.json.
 * Returns { installed: true } if the file was created/updated,
 * or { installed: false, reason } if already configured.
 */
export function installMcpJson(projectDir: string): {
  installed: boolean;
  reason: string;
} {
  const mcpPath = path.join(projectDir, ".mcp.json");

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    } catch {
      // Invalid JSON — will be overwritten
    }
  }

  // Ensure mcpServers object
  if (!existing.mcpServers || typeof existing.mcpServers !== "object") {
    existing.mcpServers = {};
  }
  const servers = existing.mcpServers as Record<string, unknown>;

  // Check if playwright is already configured
  if (servers.playwright) {
    return { installed: false, reason: "Playwright MCP already configured" };
  }

  // Add playwright MCP server
  servers.playwright = {
    command: "npx",
    args: ["@playwright/mcp@latest"],
  };

  fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + "\n");
  return { installed: true, reason: ".mcp.json updated with Playwright MCP" };
}
