/**
 * Plan engine - generates implementation plan from feature catalog
 * Based on: 14_IMPLEMENTATION_ORDER.md
 *
 * Pipeline:
 * 1. Parse features from SSOT-1 or generate-state
 * 2. Build dependency graph
 * 3. Detect and report circular dependencies
 * 4. Topological sort into waves
 * 5. Apply tiebreaker rules within waves
 * 6. Generate formatted plan output
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Feature,
  type Task,
  type Wave,
  type PlanState,
  buildDependencyGraph,
  detectCircularDependencies,
  topologicalSort,
  sortFeaturesInWave,
  decomposeFeature,
  determineTaskOrderMode,
  savePlan,
  loadPlan,
} from "./plan-model.js";
import { loadProfileType } from "./profile-model.js";

export interface PlanIO {
  print(message: string): void;
}

export interface PlanOptions {
  projectDir: string;
  io: PlanIO;
  /** Override features (for testing / manual input) */
  features?: Feature[];
  /** Override profile type for task order mode (for testing) */
  profileType?: string;
}

export interface PlanResult {
  plan: PlanState;
  errors: string[];
}

export function createPlanTerminalIO(): PlanIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Run the plan engine
 */
export async function runPlanEngine(
  options: PlanOptions,
): Promise<PlanResult> {
  const { projectDir, io } = options;
  const errors: string[] = [];

  // Load features
  const features = options.features ?? parseFeatures(projectDir);

  if (features.length === 0) {
    errors.push(
      "No features found. Run 'framework generate' first to create the feature catalog.",
    );
    return {
      plan: createEmptyPlan(),
      errors,
    };
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  IMPLEMENTATION PLAN");
  io.print(`${"━".repeat(38)}`);

  // Calculate dependency counts
  calculateDependencyCounts(features);

  // Build dependency graph
  const graph = buildDependencyGraph(features);

  // Detect circular dependencies
  const cycles = detectCircularDependencies(graph);
  if (cycles.length > 0) {
    io.print("\n  WARNING: Circular dependencies detected:");
    for (const cycle of cycles) {
      io.print(`    ${cycle.join(" -> ")} -> ${cycle[0]}`);
    }
    io.print("  These features may need manual resolution.\n");
  }

  // Separate common vs proprietary features
  const commonFeatures = features.filter((f) => f.type === "common");
  const proprietaryFeatures = features.filter((f) => f.type === "proprietary");

  // Build waves
  const waves: Wave[] = [];
  let waveNumber = 0;

  // Phase 1: Common infrastructure
  if (commonFeatures.length > 0) {
    // Layer 1: Auth features first
    const authFeatures = commonFeatures.filter((f) =>
      f.id.startsWith("AUTH") || f.id.startsWith("ACCT"),
    );
    if (authFeatures.length > 0) {
      waveNumber++;
      waves.push({
        number: waveNumber,
        phase: "common",
        layer: 1,
        title: "Authentication Foundation",
        features: sortFeaturesInWave(authFeatures),
      });
    }

    // Layer 3: Other common features (ordered by dependency count)
    const otherCommon = commonFeatures.filter(
      (f) => !f.id.startsWith("AUTH") && !f.id.startsWith("ACCT"),
    );
    if (otherCommon.length > 0) {
      waveNumber++;
      waves.push({
        number: waveNumber,
        phase: "common",
        layer: 3,
        title: "Common Features",
        features: sortFeaturesInWave(otherCommon),
      });
    }
  }

  // Phase 2: Individual features (topological sort)
  if (proprietaryFeatures.length > 0) {
    const propGraph = buildDependencyGraph(proprietaryFeatures);
    const waveAssignment = topologicalSort(proprietaryFeatures, propGraph);

    // Group by wave number
    const waveGroups = new Map<number, Feature[]>();
    for (const feature of proprietaryFeatures) {
      const w = waveAssignment.get(feature.id) ?? 1;
      if (!waveGroups.has(w)) {
        waveGroups.set(w, []);
      }
      waveGroups.get(w)!.push(feature);
    }

    // Sort wave numbers and create waves
    const sortedWaveNums = [...waveGroups.keys()].sort((a, b) => a - b);
    for (const wNum of sortedWaveNums) {
      waveNumber++;
      const waveFeatures = waveGroups.get(wNum)!;
      waves.push({
        number: waveNumber,
        phase: "individual",
        title: `Wave ${wNum}: ${wNum === 1 ? "Independent Features" : `Depends on Wave ${wNum - 1}`}`,
        features: sortFeaturesInWave(waveFeatures),
      });
    }
  }

  // Print plan
  printPlan(io, waves, cycles);

  // Decompose all features into tasks (profile-aware, single source of truth)
  const profileType = options.profileType ?? loadProfileType(projectDir) ?? "app";
  const allTasks: Task[] = [];
  for (const wave of waves) {
    for (const feature of wave.features) {
      const orderMode = determineTaskOrderMode(profileType, feature.type);
      const tasks = decomposeFeature(feature, orderMode);
      allTasks.push(...tasks);
    }
  }

  // Save plan state
  const plan: PlanState = {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves,
    tasks: allTasks,
    circularDependencies: cycles,
  };
  savePlan(projectDir, plan);

  return { plan, errors };
}

/**
 * Parse features from the feature catalog document
 */
export function parseFeatures(projectDir: string): Feature[] {
  const catalogPath = path.join(
    projectDir,
    "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
  );

  if (!fs.existsSync(catalogPath)) {
    return [];
  }

  const content = fs.readFileSync(catalogPath, "utf-8");
  return parseFeaturesFromMarkdown(content);
}

/**
 * Parse feature table from markdown content
 * Expects format: | ID | Name | Priority | Type | Size | Dependencies |
 */
export function parseFeaturesFromMarkdown(content: string): Feature[] {
  const features: Feature[] = [];
  const lines = content.split("\n");

  // Find table lines (start with |, contain at least 5 pipes)
  const tableLines = lines.filter(
    (line) =>
      line.startsWith("|") &&
      line.split("|").length >= 7 &&
      !line.includes("---") &&
      !line.includes("ID") &&
      !line.includes("Feature Name"),
  );

  for (const line of tableLines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 6) continue;

    const id = cells[0];
    const name = cells[1];
    const priority = cells[2] as Feature["priority"];
    const rawType = cells[3];
    const size = cells[4] as Feature["size"];
    const deps = cells[5];

    // Skip TBD/placeholder entries
    if (id === "TBD" || name === "TBD") continue;

    // Validate priority
    if (!["P0", "P1", "P2"].includes(priority)) continue;

    features.push({
      id,
      name,
      priority: priority || "P1",
      size: (["S", "M", "L", "XL"].includes(size) ? size : "M") as Feature["size"],
      type: rawType === "common" || rawType === "Common" ? "common" : "proprietary",
      dependencies: deps && deps !== "None" && deps !== "TBD"
        ? deps.split(",").map((d) => d.trim())
        : [],
      dependencyCount: 0,
    });
  }

  return features;
}

/**
 * Calculate how many features depend on each feature
 */
export function calculateDependencyCounts(features: Feature[]): void {
  const counts = new Map<string, number>();

  for (const feature of features) {
    for (const dep of feature.dependencies) {
      counts.set(dep, (counts.get(dep) ?? 0) + 1);
    }
  }

  for (const feature of features) {
    feature.dependencyCount = counts.get(feature.id) ?? 0;
  }
}

function printPlan(io: PlanIO, waves: Wave[], cycles: string[][]): void {
  for (const wave of waves) {
    io.print("");
    const phaseLabel = wave.phase === "common"
      ? `Phase 1, Layer ${wave.layer}`
      : "Phase 2";
    io.print(`  ## ${wave.title} (${phaseLabel})`);
    io.print("");

    for (const feature of wave.features) {
      const depStr = feature.dependencies.length > 0
        ? ` [deps: ${feature.dependencies.join(", ")}]`
        : "";
      io.print(
        `    ${feature.id}: ${feature.name} (${feature.priority}, ${feature.size})${depStr}`,
      );
    }
  }

  // Dependency graph (simple text format)
  io.print("");
  io.print("  ## Dependency Graph");
  io.print("");

  const allFeatures = waves.flatMap((w) => w.features);
  for (const feature of allFeatures) {
    if (feature.dependencies.length > 0) {
      io.print(
        `    ${feature.dependencies.join(", ")} -> ${feature.id}`,
      );
    }
  }

  if (cycles.length > 0) {
    io.print("");
    io.print("  ## Circular Dependencies (requires resolution)");
    for (const cycle of cycles) {
      io.print(`    ${cycle.join(" -> ")} -> ${cycle[0]}`);
    }
  }

  io.print("");
  io.print(`  Total: ${allFeatures.length} features in ${waves.length} waves`);

  // Task count
  const taskCount = allFeatures.length * 6;
  io.print(`  Tasks: ~${taskCount} (6 per feature: DB/API/UI/Integration/Test/Review)`);
  io.print("");
}

/**
 * Generate markdown output for the implementation plan
 */
export function generatePlanMarkdown(plan: PlanState): string {
  const lines: string[] = [];

  lines.push("# Implementation Plan");
  lines.push("");
  lines.push(`> Generated: ${plan.generatedAt}`);
  lines.push("");

  for (const wave of plan.waves) {
    const phaseLabel = wave.phase === "common"
      ? `Phase 1, Layer ${wave.layer}`
      : "Phase 2";
    lines.push(`## ${wave.title} (${phaseLabel})`);
    lines.push("");
    lines.push("| # | Feature ID | Name | Priority | Size | Dependencies |");
    lines.push("|---|-----------|------|----------|------|-------------|");

    wave.features.forEach((f, idx) => {
      const deps = f.dependencies.length > 0
        ? f.dependencies.join(", ")
        : "None";
      lines.push(
        `| ${idx + 1} | ${f.id} | ${f.name} | ${f.priority} | ${f.size} | ${deps} |`,
      );
    });

    lines.push("");

    // Task decomposition per feature
    for (const feature of wave.features) {
      // Use pre-computed tasks from plan when available (profile-aware order)
      const tasks = (plan.tasks ?? []).filter((t) => t.featureId === feature.id);
      lines.push(`### ${feature.id}: ${feature.name}`);
      lines.push("");
      lines.push("| Task | Size | Blocked By | References |");
      lines.push("|------|------|-----------|-----------|");
      for (const task of tasks) {
        const blocked = task.blockedBy.length > 0
          ? task.blockedBy.join(", ")
          : "None";
        lines.push(
          `| ${task.id} | ${task.size} | ${blocked} | ${task.references.join(", ")} |`,
        );
      }
      lines.push("");
    }
  }

  if (plan.circularDependencies.length > 0) {
    lines.push("## Circular Dependencies");
    lines.push("");
    lines.push("> These need manual resolution before implementation.");
    lines.push("");
    for (const cycle of plan.circularDependencies) {
      lines.push(`- ${cycle.join(" -> ")} -> ${cycle[0]}`);
    }
    lines.push("");
  }

  const totalFeatures = plan.waves.reduce(
    (sum, w) => sum + w.features.length,
    0,
  );
  lines.push("---");
  lines.push("");
  lines.push(
    `Total: ${totalFeatures} features, ${plan.waves.length} waves, ~${totalFeatures * 6} tasks`,
  );

  return lines.join("\n");
}

function createEmptyPlan(): PlanState {
  const now = new Date().toISOString();
  return {
    status: "idle",
    generatedAt: now,
    updatedAt: now,
    waves: [],
    tasks: [],
    circularDependencies: [],
  };
}
