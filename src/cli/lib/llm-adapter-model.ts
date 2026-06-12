/**
 * LLM Runtime Adapter interface contract.
 * Ref: #330 — agent-neutral adapter design
 *
 * Any LLM runtime (Claude Code, Codex, Cursor, Copilot, Gemini, etc.)
 * that wants to execute Shirube tasks must implement LLMRuntimeAdapter.
 */

// ─────────────────────────────────────────────
// ContextPack — per-provider context schema
// ─────────────────────────────────────────────

export interface ContextPackFile {
  path: string;
  contentSnippet: string;
  relevanceScore?: number;
}

export interface ContextPack {
  providerId: string;
  sessionId: string;
  workingDirectory: string;
  relevantFiles: ContextPackFile[];
  activeTask?: string;
  tier: "nano" | "standard" | "full";
  protectedCategories: string[];
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// AIChangeRecord — audit trail entry
// ─────────────────────────────────────────────

export interface AIChangeRecordEntry {
  file: string;
  linesAdded: number;
  linesRemoved: number;
  changeType: "create" | "modify" | "delete";
}

export interface AIChangeRecord {
  sessionId: string;
  providerId: string;
  taskId: string;
  timestamp: string;
  commitSha?: string;
  changes: AIChangeRecordEntry[];
  tierDeclared: "nano" | "standard" | "full";
  tierEffective: "nano" | "standard" | "full";
  protectedCategoriesTriggered: string[];
  gateOutcome: "pass" | "fail" | "skip";
  evidenceRef?: string;
}

// ─────────────────────────────────────────────
// Gate check types
// ─────────────────────────────────────────────

export type GateCheckResult =
  | { passed: true }
  | { passed: false; reason: string; blocking: boolean };

export interface TaskExecutionOptions {
  taskId: string;
  tier?: "nano" | "standard" | "full";
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
