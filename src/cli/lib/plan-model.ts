/**
 * Plan data model - Feature, Task, Wave definitions
 * Based on: 14_IMPLEMENTATION_ORDER.md
 *
 * Represents the implementation plan structure:
 * - Features with priority, size, dependencies
 * - Standard task decomposition (DB/API/UI/Integration/Test/Review)
 * - Waves determined by dependency topological sort
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Feature & Task Types
// ─────────────────────────────────────────────

export type Priority = "P0" | "P1" | "P2";
export type Size = "S" | "M" | "L" | "XL";
export type FeatureType = "common" | "proprietary";
export type TaskKind = "db" | "api" | "ui" | "integration" | "test" | "review";

export interface Feature {
  id: string;
  name: string;
  priority: Priority;
  size: Size;
  type: FeatureType;
  dependencies: string[];
  /** Number of other features that depend on this one */
  dependencyCount: number;
}

export interface Task {
  id: string;
  featureId: string;
  kind: TaskKind;
  name: string;
  /** SSOT sections this task references */
  references: string[];
  blockedBy: string[];
  blocks: string[];
  size: Size;
}

export interface Wave {
  number: number;
  phase: "common" | "individual";
  layer?: number;
  title: string;
  features: Feature[];
}

export interface PlanState {
  status: "idle" | "generated" | "active";
  generatedAt: string;
  updatedAt: string;
  waves: Wave[];
  /** Flattened list of all tasks across all waves, in execution order.
   * Optional for backward compatibility with plan.json files generated before this field was added. */
  tasks?: Task[];
  circularDependencies: string[][];
}

// ─────────────────────────────────────────────
// Task Decomposition
// ─────────────────────────────────────────────

/**
 * Task definitions for normal flow:
 * SSOT → Implementation (db → api → ui → integration) → Code Audit → Test
 */
const TASK_DEFINITIONS_NORMAL: {
  kind: TaskKind;
  name: string;
  references: string[];
}[] = [
  { kind: "db", name: "Database", references: ["§4"] },
  { kind: "api", name: "API", references: ["§5", "§7", "§9"] },
  { kind: "ui", name: "UI", references: ["§6"] },
  { kind: "integration", name: "Integration", references: ["§5", "§6"] },
  { kind: "review", name: "Code Audit", references: ["All"] },
  { kind: "test", name: "Testing", references: ["§10"] },
];

/**
 * Task definitions for TDD flow (api/cli profiles, CORE/CONTRACT layers):
 * SSOT → Test creation → Implementation → Code Audit
 */
const TASK_DEFINITIONS_TDD: {
  kind: TaskKind;
  name: string;
  references: string[];
}[] = [
  { kind: "test", name: "Testing (TDD)", references: ["§10"] },
  { kind: "db", name: "Database", references: ["§4"] },
  { kind: "api", name: "API", references: ["§5", "§7", "§9"] },
  { kind: "ui", name: "UI", references: ["§6"] },
  { kind: "integration", name: "Integration", references: ["§5", "§6"] },
  { kind: "review", name: "Code Audit", references: ["All"] },
];

export type TaskOrderMode = "normal" | "tdd";

/**
 * Determine if TDD mode should be enforced based on profile type and feature type
 *
 * TDD is enforced for:
 * - Profile types: api, cli
 * - SSOT layer: CORE (data model), CONTRACT (API contract)
 *
 * Normal flow for:
 * - Profile types: app, lp, hp
 * - SSOT layer: DETAIL (UI features)
 */
export function determineTaskOrderMode(
  profileType: string,
  featureType?: FeatureType,
): TaskOrderMode {
  // Profile-based TDD: api and cli always use TDD
  if (profileType === "api" || profileType === "cli") {
    return "tdd";
  }

  // Feature-type based: common features (CORE/CONTRACT) use TDD in non-TDD profiles
  // For app/lp/hp, use TDD for backend-heavy common features
  if (
    profileType === "app" &&
    featureType === "common"
  ) {
    return "tdd";
  }

  return "normal";
}

/**
 * Decompose a feature into standard tasks.
 *
 * @param feature The feature to decompose
 * @param orderMode Task ordering mode: "normal" or "tdd"
 *   - normal: Implementation → Code Audit → Test
 *   - tdd: Test → Implementation → Code Audit
 */
export function decomposeFeature(
  feature: Feature,
  orderMode: TaskOrderMode = "normal",
): Task[] {
  const taskDefs =
    orderMode === "tdd" ? TASK_DEFINITIONS_TDD : TASK_DEFINITIONS_NORMAL;

  return taskDefs.map((def, idx) => {
    const taskId = `${feature.id}-${def.kind.toUpperCase()}`;
    const prevTaskId =
      idx > 0
        ? `${feature.id}-${taskDefs[idx - 1].kind.toUpperCase()}`
        : undefined;
    const nextTaskId =
      idx < taskDefs.length - 1
        ? `${feature.id}-${taskDefs[idx + 1].kind.toUpperCase()}`
        : undefined;

    return {
      id: taskId,
      featureId: feature.id,
      kind: def.kind,
      name: `${feature.name} - ${def.name}`,
      references: def.references,
      blockedBy: prevTaskId ? [prevTaskId] : [],
      blocks: nextTaskId ? [nextTaskId] : [],
      size: estimateTaskSize(feature.size, def.kind),
    };
  });
}

function estimateTaskSize(featureSize: Size, kind: TaskKind): Size {
  // Simplify: db/review are typically smaller, api/ui are the bulk
  if (kind === "db" || kind === "review") {
    return featureSize === "XL" ? "M" : "S";
  }
  if (kind === "test") {
    return featureSize === "S" ? "S" : "M";
  }
  return featureSize;
}

// ─────────────────────────────────────────────
// Dependency Graph Operations
// ─────────────────────────────────────────────

/**
 * Build adjacency list from features
 * Returns: { featureId -> [featureIds it depends on] }
 */
export function buildDependencyGraph(
  features: Feature[],
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const featureIds = new Set(features.map((f) => f.id));

  for (const feature of features) {
    // Only include dependencies that reference known features
    const deps = feature.dependencies.filter((d) => featureIds.has(d));
    graph.set(feature.id, deps);
  }

  return graph;
}

/**
 * Detect circular dependencies using DFS
 */
export function detectCircularDependencies(
  graph: Map<string, string[]>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      // Found cycle: extract it from pathStack
      const cycleStart = pathStack.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(pathStack.slice(cycleStart));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    pathStack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
}

/**
 * Topological sort: assign features to waves based on dependencies
 */
export function topologicalSort(
  features: Feature[],
  graph: Map<string, string[]>,
): Map<string, number> {
  const waveAssignment = new Map<string, number>();
  const featureMap = new Map(features.map((f) => [f.id, f]));
  const visiting = new Set<string>();

  function getWave(featureId: string): number {
    if (waveAssignment.has(featureId)) {
      return waveAssignment.get(featureId)!;
    }

    // Cycle protection: if we're already visiting this node, break the cycle
    if (visiting.has(featureId)) {
      waveAssignment.set(featureId, 1);
      return 1;
    }

    visiting.add(featureId);

    const deps = graph.get(featureId) ?? [];
    if (deps.length === 0) {
      waveAssignment.set(featureId, 1);
      visiting.delete(featureId);
      return 1;
    }

    let maxDepWave = 0;
    for (const dep of deps) {
      if (featureMap.has(dep)) {
        maxDepWave = Math.max(maxDepWave, getWave(dep));
      }
    }

    const wave = maxDepWave + 1;
    waveAssignment.set(featureId, wave);
    visiting.delete(featureId);
    return wave;
  }

  for (const feature of features) {
    getWave(feature.id);
  }

  return waveAssignment;
}

/**
 * Sort features within a wave by tiebreaker rules:
 * 1. Priority (P0 > P1 > P2)
 * 2. Dependency count (higher first)
 * 3. Size (S > M > L > XL - smaller first)
 * 4. Feature ID (alphabetical)
 */
export function sortFeaturesInWave(features: Feature[]): Feature[] {
  const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
  const sizeOrder: Record<Size, number> = { S: 0, M: 1, L: 2, XL: 3 };

  return [...features].sort((a, b) => {
    // Rule 1: Priority
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;

    // Rule 2: Dependency count (more dependents = higher priority)
    const cDiff = b.dependencyCount - a.dependencyCount;
    if (cDiff !== 0) return cDiff;

    // Rule 3: Size (smaller first)
    const sDiff = sizeOrder[a.size] - sizeOrder[b.size];
    if (sDiff !== 0) return sDiff;

    // Rule 4: ID (alphabetical)
    return a.id.localeCompare(b.id);
  });
}

// ─────────────────────────────────────────────
// Plan State Persistence
// ─────────────────────────────────────────────

const PLAN_FILE = ".framework/plan.json";

export function loadPlan(projectDir: string): PlanState | null {
  const filePath = path.join(projectDir, PLAN_FILE);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as PlanState;
  // Backward compat: older plan.json files may not have the tasks field
  if (!parsed.tasks) {
    parsed.tasks = [];
  }
  return parsed;
}

export function savePlan(projectDir: string, plan: PlanState): void {
  const filePath = path.join(projectDir, PLAN_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  plan.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), "utf-8");
}
