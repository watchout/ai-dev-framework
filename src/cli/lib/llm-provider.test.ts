import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  claudeProvider,
  codexProvider,
  getProvider,
  loadProviderConfig,
  autoDetectProvider,
  providers,
  registerProvider,
  type LLMProvider,
} from "./llm-provider.js";

describe("llm-provider", () => {
  it("claudeProvider builds args with -p and prompt", () => {
    const args = claudeProvider.buildArgs("hello world");
    expect(args).toEqual(["-p", "hello world"]);
  });

  it("claudeProvider builds args with allowedTools + output-format", () => {
    const args = claudeProvider.buildArgs("prompt", {
      allowedTools: ["Read", "Grep"],
      outputFormat: "json",
    });
    expect(args).toEqual([
      "-p",
      "prompt",
      "--allowedTools",
      "Read,Grep",
      "--output-format",
      "json",
    ]);
  });

  it("claudeProvider injects CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS when requested", () => {
    const env = claudeProvider.buildEnv({ experimentalAgentTeams: true });
    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });

  it("codexProvider uses exec --full-auto", () => {
    const args = codexProvider.buildArgs("prompt");
    expect(args).toEqual(["exec", "--full-auto", "prompt"]);
  });

  it("getProvider returns the default when role is 'default'", () => {
    const config = { default: "claude" };
    const provider = getProvider("default", config);
    expect(provider.name).toBe("claude");
  });

  it("getProvider falls back to default when role has no override", () => {
    const config = { default: "claude" };
    const provider = getProvider("remediation", config);
    expect(provider.name).toBe("claude");
  });

  it("getProvider uses role-specific override when set", () => {
    const config = { default: "claude", validation: "codex" };
    const provider = getProvider("validation", config);
    expect(provider.name).toBe("codex");
  });

  it("getProvider throws on unknown provider", () => {
    const config = { default: "nonexistent" };
    expect(() => getProvider("default", config)).toThrow(/Unknown LLM provider/);
  });

  it("loadProviderConfig returns auto-detect when file missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-"));
    const config = loadProviderConfig(dir);
    expect(typeof config.default).toBe("string");
    expect(["claude", "codex"]).toContain(config.default);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("loadProviderConfig reads provider section from config.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-"));
    fs.mkdirSync(path.join(dir, ".framework"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".framework/config.json"),
      JSON.stringify({
        provider: { default: "codex", validation: "claude" },
      }),
    );
    const config = loadProviderConfig(dir);
    expect(config.default).toBe("codex");
    expect(config.validation).toBe("claude");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("autoDetectProvider returns a known provider string", () => {
    const name = autoDetectProvider();
    expect(Object.keys(providers)).toContain(name);
  });

  it("registerProvider adds a new provider", () => {
    const fake: LLMProvider = {
      name: "fake-test",
      command: "fake",
      buildArgs: () => ["x"],
      buildEnv: () => ({}),
      isAvailable: () => true,
    };
    registerProvider(fake);
    expect(providers["fake-test"]).toBe(fake);
    delete providers["fake-test"];
  });
});
