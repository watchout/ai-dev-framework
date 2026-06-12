import * as fs from "node:fs";
import * as path from "node:path";
import type { FrameworkConfig } from "./workflow-config.js";

export const DEFAULT_LIFECYCLE_EVENTS_PATH = ".framework/lifecycle-events.jsonl";

export type LifecycleEventType = "task_start" | "blocked";
export type LifecycleEventResult =
  | "recorded"
  | "delivered"
  | "skipped_with_approved_rationale"
  | "failed";

export interface LifecycleSinkReadiness {
  ready: boolean;
  path: string | null;
  destination: string | null;
  reason: string;
}

export interface LifecycleEventRecord {
  schema_version: "lifecycle-event/v1";
  event: LifecycleEventType;
  task_id: string | null;
  phase: string;
  timestamp: string;
  actor: string;
  destination: string;
  result: LifecycleEventResult;
  blocking_rule_ids?: string[];
}

export interface AppendLifecycleEventResult {
  ok: boolean;
  path: string | null;
  error?: string;
}

interface LifecycleSinkConfig {
  enabled?: boolean;
  type?: string;
  path?: string;
}

export function resolveLifecycleSinkReadiness(
  projectDir: string,
  config: FrameworkConfig,
): LifecycleSinkReadiness {
  const sink = config.workflow?.lifecycleSink as LifecycleSinkConfig | undefined;
  if (sink?.enabled === false || sink?.type === "disabled") {
    return {
      ready: false,
      path: sink.path ?? null,
      destination: "disabled",
      reason: "workflow.lifecycleSink disables lifecycle evidence recording",
    };
  }

  const relativePath = sink?.path ?? DEFAULT_LIFECYCLE_EVENTS_PATH;
  const targetPath = path.resolve(projectDir, relativePath);
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    return {
      ready: false,
      path: relativePath,
      destination: `file://${relativePath}`,
      reason: `lifecycle sink directory is missing: ${path.relative(projectDir, parentDir)}`,
    };
  }

  try {
    fs.accessSync(parentDir, fs.constants.W_OK);
    return {
      ready: true,
      path: relativePath,
      destination: `file://${relativePath}`,
      reason: "local lifecycle JSONL sink is writable",
    };
  } catch (error) {
    return {
      ready: false,
      path: relativePath,
      destination: `file://${relativePath}`,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function appendLifecycleEvent(
  projectDir: string,
  config: FrameworkConfig,
  event: Omit<LifecycleEventRecord, "schema_version" | "destination" | "result">,
): AppendLifecycleEventResult {
  const sink = resolveLifecycleSinkReadiness(projectDir, config);
  if (!sink.ready || !sink.path || !sink.destination) {
    return { ok: false, path: sink.path, error: sink.reason };
  }

  const targetPath = path.resolve(projectDir, sink.path);
  const record: LifecycleEventRecord = {
    schema_version: "lifecycle-event/v1",
    ...event,
    destination: sink.destination,
    result: "recorded",
  };

  try {
    fs.appendFileSync(targetPath, `${JSON.stringify(record)}\n`, "utf-8");
    return { ok: true, path: sink.path };
  } catch (error) {
    return {
      ok: false,
      path: sink.path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
