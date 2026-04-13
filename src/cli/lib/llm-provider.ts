/**
 * LLM Provider abstraction.
 *
 * Supports Claude Code and Codex CLI. Additional providers (Gemini, etc.)
 * can be registered via the `providers` map.
 *
 * Configuration: `.framework/config.json` under the `provider` key.
 * See docs/specs/06_CODE_QUALITY.md for the full spec proposal.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ProviderOptions {
  allowedTools?: string[];
  outputFormat?: "json" | "text";
  experimentalAgentTeams?: boolean;
  timeoutMs?: number;
  cwd?: string;
  extraEnv?: Record<string, string>;
}

export interface LLMProvider {
  name: string;
  command: string;
  buildArgs(prompt: string, options?: ProviderOptions): string[];
  buildEnv(options?: ProviderOptions): Record<string, string>;
  isAvailable(): boolean;
}

export interface ProviderConfig {
  default: string;
  remediation?: string;
  validation?: string;
  ingestion?: string;
  worktree?: string;
}

export type ProviderRole =
  | "default"
  | "remediation"
  | "validation"
  | "ingestion"
  | "worktree";

// ─────────────────────────────────────────────
// Provider definitions
// ─────────────────────────────────────────────

function commandExists(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const claudeProvider: LLMProvider = {
  name: "claude",
  command: "claude",
  buildArgs(prompt, options) {
    const args: string[] = ["-p", prompt];
    if (options?.allowedTools && options.allowedTools.length > 0) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }
    if (options?.outputFormat === "json") {
      args.push("--output-format", "json");
    }
    return args;
  },
  buildEnv(options) {
    const env: Record<string, string> = {};
    if (options?.experimentalAgentTeams) {
      env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    }
    return { ...env, ...(options?.extraEnv ?? {}) };
  },
  isAvailable() {
    return commandExists("claude");
  },
};

export const codexProvider: LLMProvider = {
  name: "codex",
  command: "codex",
  buildArgs(prompt, _options) {
    // Codex CLI: `codex exec --full-auto "<prompt>"`
    // allowedTools / outputFormat are not directly mapped — rely on full-auto mode.
    return ["exec", "--full-auto", prompt];
  },
  buildEnv(options) {
    return { ...(options?.extraEnv ?? {}) };
  },
  isAvailable() {
    return commandExists("codex");
  },
};

export const providers: Record<string, LLMProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function registerProvider(provider: LLMProvider): void {
  providers[provider.name] = provider;
}

// ─────────────────────────────────────────────
// Config loading
// ─────────────────────────────────────────────

export function loadProviderConfig(projectDir: string): ProviderConfig {
  const configPath = path.join(projectDir, ".framework/config.json");
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as { provider?: Partial<ProviderConfig> };
      if (parsed.provider && typeof parsed.provider.default === "string") {
        return {
          default: parsed.provider.default,
          remediation: parsed.provider.remediation,
          validation: parsed.provider.validation,
          ingestion: parsed.provider.ingestion,
          worktree: parsed.provider.worktree,
        };
      }
    } catch {
      // Fall through to auto-detect
    }
  }
  return { default: autoDetectProvider() };
}

export function autoDetectProvider(): string {
  if (claudeProvider.isAvailable()) return "claude";
  if (codexProvider.isAvailable()) return "codex";
  return "claude";
}

export function getProvider(
  role: ProviderRole,
  config: ProviderConfig,
): LLMProvider {
  const roleValue = role === "default" ? undefined : config[role];
  const name = roleValue ?? config.default;
  const provider = providers[name];
  if (!provider) {
    throw new Error(
      `Unknown LLM provider: "${name}". Known: ${Object.keys(providers).join(", ")}`,
    );
  }
  return provider;
}

// ─────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export async function executeWithProvider(
  provider: LLMProvider,
  prompt: string,
  options: ProviderOptions = {},
): Promise<string> {
  const result = await spawnProvider(provider, prompt, options);
  if (result.code === 0 || result.stdout.length > 0) {
    return result.stdout;
  }
  throw new Error(
    `Provider "${provider.name}" exited with code ${result.code}: ${result.stderr.slice(0, 500)}`,
  );
}

/**
 * Spawn a provider process and return the raw ChildProcess.
 * Use this when the caller needs to manage lifecycle (PID tracking, kill, etc.).
 */
export function createProviderProcess(
  provider: LLMProvider,
  prompt: string,
  options: ProviderOptions = {},
): ChildProcess {
  const args = provider.buildArgs(prompt, options);
  const providerEnv = provider.buildEnv(options);
  return spawn(provider.command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd,
    env: { ...process.env, ...providerEnv },
  });
}

export function spawnProvider(
  provider: LLMProvider,
  prompt: string,
  options: ProviderOptions = {},
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const args = provider.buildArgs(prompt, options);
    const providerEnv = provider.buildEnv(options);
    const proc = spawn(provider.command, args, {
      timeout: options.timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd,
      env: { ...process.env, ...providerEnv },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────
// Testing hook
// ─────────────────────────────────────────────

/**
 * Override the providers map for testing. Returns a restore function.
 */
export function setProviderForTesting(
  name: string,
  provider: LLMProvider,
): () => void {
  const prev = providers[name];
  providers[name] = provider;
  return () => {
    if (prev === undefined) delete providers[name];
    else providers[name] = prev;
  };
}
