/**
 * Claude Code reference adapter implementation.
 * Ref: #330 — LLMRuntimeAdapter reference implementation
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type {
  LLMRuntimeAdapter,
  TaskExecutionOptions,
  TaskExecutionResult,
  GateCheckResult,
  ContextPack,
  AIChangeRecord,
  ContextPackFile,
} from "./llm-adapter-model.js";
import { detectProtectedPatterns } from "./protected-pattern-detector.js";

export class ClaudeCodeAdapter implements LLMRuntimeAdapter {
  readonly providerId = "claude-code";
  readonly displayName = "Claude Code";

  async executeTask(options: TaskExecutionOptions): Promise<TaskExecutionResult> {
    const { taskId, tier = "standard", dryRun = false } = options;

    if (dryRun) {
      return {
        ok: true,
        taskId,
        output: `[dry-run] Claude Code adapter: task ${taskId} (${tier})`,
      };
    }

    return {
      ok: true,
      taskId,
      output: `Claude Code adapter: task ${taskId} dispatched`,
    };
  }

  async checkGate(gateId: string, projectDir: string): Promise<GateCheckResult> {
    const gateFile = path.join(projectDir, ".framework", `${gateId}.json`);
    if (!fs.existsSync(gateFile)) {
      return { passed: false, reason: `Gate file not found: ${gateId}.json`, blocking: true };
    }

    try {
      const data = JSON.parse(fs.readFileSync(gateFile, "utf-8")) as { status?: string };
      if (data.status === "pass") {
        return { passed: true };
      }
      return { passed: false, reason: `Gate ${gateId} status: ${data.status ?? "unknown"}`, blocking: true };
    } catch {
      return { passed: false, reason: `Could not parse gate file: ${gateId}.json`, blocking: true };
    }
  }

  async getContextPack(projectDir: string): Promise<ContextPack> {
    const relevantFiles = collectRelevantFiles(projectDir);
    const diff = getGitDiff(projectDir);
    const detection = diff ? detectProtectedPatterns(diff) : { categories: [] as string[] };

    return {
      providerId: this.providerId,
      sessionId: `claude-code-${Date.now()}`,
      workingDirectory: projectDir,
      relevantFiles,
      tier: detection.categories.length > 0 ? "full" : "standard",
      protectedCategories: detection.categories,
    };
  }

  async reportAIChangeRecord(record: AIChangeRecord): Promise<void> {
    const auditDir = path.join(record.sessionId.startsWith("/") ? record.sessionId : process.cwd(), ".framework", "audit");
    try {
      fs.mkdirSync(auditDir, { recursive: true });
      const file = path.join(auditDir, `${record.taskId}-${record.timestamp.replace(/[:.]/g, "-")}.json`);
      fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n", "utf-8");
    } catch {
      // Best-effort — do not throw
    }
  }
}

function collectRelevantFiles(projectDir: string): ContextPackFile[] {
  const patterns = ["*.md", "*.json", "*.ts"];
  const files: ContextPackFile[] = [];

  for (const pattern of patterns) {
    try {
      const result = spawnSync("find", [projectDir, "-maxdepth", "3", "-name", pattern, "-not", "-path", "*/node_modules/*"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status === 0) {
        const found = result.stdout.split("\n").filter(Boolean).slice(0, 10);
        for (const f of found) {
          const rel = path.relative(projectDir, f);
          files.push({ path: rel, contentSnippet: "" });
        }
      }
    } catch {
      // ignore
    }
  }

  return files.slice(0, 20);
}

function getGitDiff(projectDir: string): string | null {
  try {
    const result = spawnSync("git", ["diff", "HEAD~1..HEAD", "--", "*.ts", "*.js", "*.json", "*.yml"], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 5000,
    });
    return result.status === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}
