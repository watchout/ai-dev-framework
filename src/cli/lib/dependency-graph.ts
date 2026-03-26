/**
 * Dependency graph engine for plan priority analysis.
 *
 * Builds a task-level dependency graph from plan.json,
 * calculates priority scores, and identifies the critical path.
 *
 * Design principle: deterministic logic only, no LLM.
 */
import type { Task, PlanState, Feature, Wave } from "./plan-model.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface TaskNode {
  id: string;
  name: string;
  featureId: string;
  layer: TaskLayer;
  dependencies: string[];
  dependents: string[];
  priority: number;
  status: "pending" | "in-progress" | "done";
}

export type TaskLayer = "schema" | "api" | "logic" | "ui" | "test" | "docs";

export interface DependencyGraph {
  nodes: TaskNode[];
  criticalPath: string[];
  priorityTasks: string[];
}

// ─────────────────────────────────────────────
// Layer mapping from TaskKind
// ─────────────────────────────────────────────

const KIND_TO_LAYER: Record<string, TaskLayer> = {
  db: "schema",
  api: "api",
  integration: "logic",
  ui: "ui",
  test: "test",
  review: "docs",
};

const LAYER_BONUS: Record<TaskLayer, number> = {
  schema: 5,
  api: 4,
  logic: 3,
  ui: 2,
  test: 1,
  docs: 0,
};

// ─────────────────────────────────────────────
// Graph construction
// ─────────────────────────────────────────────

/**
 * Build a dependency graph from a PlanState.
 *
 * Dependencies come from:
 * 1. Intra-feature: task.blockedBy (already computed during decomposition)
 * 2. Cross-feature: if Feature A depends on Feature B,
 *    then A's first task is blocked by B's last task
 */
export function buildTaskDependencyGraph(plan: PlanState): DependencyGraph {
  const tasks = plan.tasks ?? [];
  if (tasks.length === 0) {
    return { nodes: [], criticalPath: [], priorityTasks: [] };
  }

  // Build feature dependency map from waves
  const featureDeps = buildFeatureDependencyMap(plan.waves);

  // Build task lookup
  const taskMap = new Map<string, Task>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  // Group tasks by feature
  const tasksByFeature = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = tasksByFeature.get(task.featureId) ?? [];
    list.push(task);
    tasksByFeature.set(task.featureId, list);
  }

  // Build nodes with dependencies
  const nodeMap = new Map<string, TaskNode>();

  for (const task of tasks) {
    const node: TaskNode = {
      id: task.id,
      name: task.name,
      featureId: task.featureId,
      layer: KIND_TO_LAYER[task.kind] ?? "logic",
      dependencies: [...task.blockedBy],
      dependents: [],
      priority: 0,
      status: "pending",
    };
    nodeMap.set(task.id, node);
  }

  // Add cross-feature dependencies
  for (const [featureId, deps] of featureDeps) {
    const featureTasks = tasksByFeature.get(featureId);
    if (!featureTasks || featureTasks.length === 0) continue;

    // First task of this feature (sorted by seq or array order)
    const firstTask = featureTasks[0];

    for (const depFeatureId of deps) {
      const depTasks = tasksByFeature.get(depFeatureId);
      if (!depTasks || depTasks.length === 0) continue;

      // Last task of the dependency feature
      const lastTask = depTasks[depTasks.length - 1];

      const node = nodeMap.get(firstTask.id);
      if (node && !node.dependencies.includes(lastTask.id)) {
        node.dependencies.push(lastTask.id);
      }
    }
  }

  // Build dependents (reverse of dependencies)
  for (const node of nodeMap.values()) {
    for (const depId of node.dependencies) {
      const depNode = nodeMap.get(depId);
      if (depNode && !depNode.dependents.includes(node.id)) {
        depNode.dependents.push(node.id);
      }
    }
  }

  const nodes = [...nodeMap.values()];

  // Detect cycles
  const hasCycle = detectCycleInTaskGraph(nodeMap);
  if (hasCycle) {
    // Still compute what we can, but critical path will be empty
    return { nodes, criticalPath: [], priorityTasks: [] };
  }

  // Calculate priority scores
  calculatePriorityScores(nodes, nodeMap);

  // Find critical path
  const criticalPath = findCriticalPath(nodes, nodeMap);

  // Mark critical path bonus
  const cpSet = new Set(criticalPath);
  for (const node of nodes) {
    if (cpSet.has(node.id)) {
      node.priority += 10;
    }
  }

  // Sort by priority descending
  nodes.sort((a, b) => b.priority - a.priority);

  // Extract top 20% (minimum 3)
  const topCount = Math.max(3, Math.ceil(nodes.length * 0.2));
  const priorityTasks = nodes.slice(0, topCount).map((n) => n.id);

  return { nodes, criticalPath, priorityTasks };
}

// ─────────────────────────────────────────────
// Feature dependency map from waves
// ─────────────────────────────────────────────

function buildFeatureDependencyMap(waves: Wave[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const wave of waves) {
    for (const feature of wave.features) {
      if (feature.dependencies.length > 0) {
        map.set(feature.id, [...feature.dependencies]);
      }
    }
  }
  return map;
}

// ─────────────────────────────────────────────
// Cycle detection (DFS)
// ─────────────────────────────────────────────

function detectCycleInTaskGraph(nodeMap: Map<string, TaskNode>): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;

    visited.add(id);
    inStack.add(id);

    const node = nodeMap.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        if (dfs(dep)) return true;
      }
    }

    inStack.delete(id);
    return false;
  }

  for (const id of nodeMap.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// Priority calculation
// ─────────────────────────────────────────────

/**
 * Count transitive dependents (all tasks transitively unblocked).
 */
export function countTransitiveDependents(
  nodeId: string,
  nodeMap: Map<string, TaskNode>,
): number {
  const visited = new Set<string>();

  function walk(id: string): void {
    const node = nodeMap.get(id);
    if (!node) return;
    for (const depId of node.dependents) {
      if (!visited.has(depId)) {
        visited.add(depId);
        walk(depId);
      }
    }
  }

  walk(nodeId);
  return visited.size;
}

function calculatePriorityScores(
  nodes: TaskNode[],
  nodeMap: Map<string, TaskNode>,
): void {
  for (const node of nodes) {
    const directDependents = node.dependents.length;
    const transitiveDependents = countTransitiveDependents(node.id, nodeMap);
    const layerBonus = LAYER_BONUS[node.layer] ?? 0;

    node.priority = transitiveDependents * 2 + directDependents + layerBonus;
  }
}

// ─────────────────────────────────────────────
// Critical path (longest path in DAG)
// ─────────────────────────────────────────────

/**
 * Find the critical path: the longest chain of dependencies.
 * Uses dynamic programming on the DAG.
 */
export function findCriticalPath(
  nodes: TaskNode[],
  nodeMap: Map<string, TaskNode>,
): string[] {
  if (nodes.length === 0) return [];

  // Memoized longest path ending at each node
  const memo = new Map<string, string[]>();

  function longestPathTo(id: string): string[] {
    if (memo.has(id)) return memo.get(id)!;

    const node = nodeMap.get(id);
    if (!node || node.dependencies.length === 0) {
      const path = [id];
      memo.set(id, path);
      return path;
    }

    let bestPath: string[] = [];
    for (const depId of node.dependencies) {
      if (!nodeMap.has(depId)) continue;
      const depPath = longestPathTo(depId);
      if (depPath.length > bestPath.length) {
        bestPath = depPath;
      }
    }

    const path = [...bestPath, id];
    memo.set(id, path);
    return path;
  }

  let criticalPath: string[] = [];
  for (const node of nodes) {
    const path = longestPathTo(node.id);
    if (path.length > criticalPath.length) {
      criticalPath = path;
    }
  }

  return criticalPath;
}

// ─────────────────────────────────────────────
// Display formatting
// ─────────────────────────────────────────────

export interface PriorityDisplayOptions {
  top?: number;
}

/**
 * Format the priority task list for terminal output.
 */
export function formatPriorityDisplay(
  graph: DependencyGraph,
  totalTasks: number,
  options?: PriorityDisplayOptions,
): string {
  const topCount = options?.top ?? graph.priorityTasks.length;
  const cpSet = new Set(graph.criticalPath);
  const displayNodes = graph.nodes.slice(0, topCount);

  const lines: string[] = [];

  lines.push("");
  lines.push("  ══════════════════════════════════════════════════════");
  lines.push("  Plan: Priority Tasks (Top 20%)");
  lines.push("  ══════════════════════════════════════════════════════");
  lines.push("");
  lines.push(
    "    #  │ Task                           │ Score │ Unblocks  │ Path",
  );
  lines.push(
    "   ────┼────────────────────────────────┼───────┼───────────┼──────",
  );

  for (let i = 0; i < displayNodes.length; i++) {
    const node = displayNodes[i];
    const num = String(i + 1).padStart(4);
    const name = node.id.padEnd(30).slice(0, 30);
    const score = String(node.priority).padStart(5);
    const transitive = countTransitiveDependents(
      node.id,
      new Map(graph.nodes.map((n) => [n.id, n])),
    );
    const unblocks = `${String(transitive).padStart(3)} tasks`;
    const pathMark = cpSet.has(node.id) ? " ★" : "";
    lines.push(`   ${num} │ ${name} │ ${score} │ ${unblocks} │${pathMark}`);
  }

  lines.push("");
  lines.push(`  ★ = Critical Path (${graph.criticalPath.length} tasks)`);
  lines.push(`  Total: ${totalTasks} tasks, showing top ${displayNodes.length}`);
  lines.push("");

  if (displayNodes.length > 0) {
    lines.push("  Run first:");
    lines.push(`    framework run ${displayNodes[0].id}`);
    lines.push("");
  }

  return lines.join("\n");
}
