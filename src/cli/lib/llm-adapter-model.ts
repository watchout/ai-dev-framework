/**
 * LLM Runtime Adapter interface contract.
 * Ref: #330 — agent-neutral adapter design
 *
 * Any LLM runtime (Claude Code, Codex, Cursor, Copilot, Gemini, etc.)
 * that wants to execute Shirube tasks must implement LLMRuntimeAdapter.
 */

export type {
  AIChangeRecord,
  AIChangeRecordEntry,
  ContextPack,
  ContextPackFile,
  ContextPackInputFile,
  DeliveryTier,
  GateResultSummary,
  OutputSpec,
  ToolPolicy,
} from "./gate-engine-model.js";

import type {
  AIChangeRecord,
  ContextPack,
  DeliveryTier,
} from "./gate-engine-model.js";

// ─────────────────────────────────────────────
// Gate check types
// ─────────────────────────────────────────────

export type GateCheckResult =
  | { passed: true }
  | { passed: false; reason: string; blocking: boolean };

export interface TaskExecutionOptions {
  taskId: string;
  tier?: DeliveryTier;
  dryRun?: boolean;
  contextPack?: ContextPack;
}

export interface TaskExecutionResult {
  ok: boolean;
  taskId: string;
  output?: string;
  error?: string;
  aiChangeRecord?: AIChangeRecord;
}

// ─────────────────────────────────────────────
// LLMRuntimeAdapter interface
// ─────────────────────────────────────────────

export interface LLMRuntimeAdapter {
  /** Unique identifier for this provider (e.g., "claude-code", "codex", "cursor") */
  readonly providerId: string;

  /** Human-readable name */
  readonly displayName: string;

  /**
   * Execute a task described in the given options.
   * Must honor tier constraints and gate requirements.
   */
  executeTask(options: TaskExecutionOptions): Promise<TaskExecutionResult>;

  /**
   * Check whether a gate condition is met.
   * @param gateId - Gate identifier (e.g., "gate-a", "gate-b", "gate-c", "gate-0")
   * @param projectDir - Project root directory
   */
  checkGate(gateId: string, projectDir: string): Promise<GateCheckResult>;

  /**
   * Build a ContextPack for the current session.
   * The pack is passed back to the adapter on executeTask so it can
   * reconstruct relevant context without re-scanning.
   */
  getContextPack(projectDir: string): Promise<ContextPack>;

  /**
   * Report an AIChangeRecord to the audit trail after task completion.
   * Non-blocking — implementations may fire-and-forget.
   */
  reportAIChangeRecord(record: AIChangeRecord): Promise<void>;
}
