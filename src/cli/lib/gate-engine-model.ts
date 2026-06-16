export type DeliveryTier = "nano" | "standard" | "full";

export interface ToolPolicy {
  permissionMode: string;
  sandbox: string;
  networkAccess: boolean;
  allowedTools: string[];
  deniedTools: string[];
}

export interface ContextPackInputFile {
  path: string;
  role: "config" | "spec" | "source" | "evidence" | "unknown";
  hash?: string;
}

export interface ContextPackFile {
  path: string;
  contentSnippet: string;
  relevanceScore?: number;
  role?: ContextPackInputFile["role"];
  hash?: string;
}

export interface OutputSpec {
  format: "json" | "markdown" | "text" | "mixed";
  requiredArtifacts: string[];
  evidence: string[];
}

export interface GateResultSummary {
  gateId: string;
  status: "passed" | "failed" | "pending" | "unknown";
  checkedAt?: string;
  warnings?: string[];
  failures?: string[];
}

export interface ContextPack {
  schemaVersion: "context-pack/v1";
  taskId: string;
  provider: string;
  toolPolicy: ToolPolicy;
  inputFiles: ContextPackInputFile[];
  outputSpec: OutputSpec;
  timestamp: string;

  // Adapter compatibility aliases retained for #330 LLMRuntimeAdapter users.
  providerId: string;
  sessionId: string;
  workingDirectory: string;
  relevantFiles: ContextPackFile[];
  activeTask?: string;
  tier: DeliveryTier;
  protectedCategories: string[];
  meta?: Record<string, unknown>;
}

export interface AIChangeRecordEntry {
  file: string;
  linesAdded: number;
  linesRemoved: number;
  changeType: "create" | "modify" | "delete";
}

export interface AIChangeRecord {
  schemaVersion: "ai-change-record/v1";
  prId: string;
  aiProvider: string;
  promptHash: string;
  gateResults: GateResultSummary[];
  humanReviewedAt: string | null;

  // Adapter compatibility fields retained for existing runtime integrations.
  sessionId: string;
  providerId: string;
  taskId: string;
  timestamp: string;
  commitSha?: string;
  changes: AIChangeRecordEntry[];
  tierDeclared: DeliveryTier;
  tierEffective: DeliveryTier;
  protectedCategoriesTriggered: string[];
  gateOutcome: "pass" | "fail" | "skip";
  evidenceRef?: string;
}
