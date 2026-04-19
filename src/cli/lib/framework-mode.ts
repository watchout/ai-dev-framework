/**
 * Framework mode state machine — repo topic management.
 *
 * Part of #63 (framework mode state machine).
 * Spec: 09_ENFORCEMENT §1.
 *
 * States:
 *   active   — repo has `framework-managed` topic. Hooks enforce gates.
 *   inactive — topic absent. Hooks are passthrough no-ops.
 *
 * Transitions:
 *   init/retrofit → active (add topic)
 *   exit (CEO token) → inactive (remove topic)
 */
import { execGh } from "./github-engine.js";
import { hashTokenPrefix } from "./audit-log.js";

const FRAMEWORK_TOPIC = "framework-managed";

function validateTokenHash(token: string, expectedHash: string): boolean {
  return hashTokenPrefix(token) === expectedHash.slice(0, 8);
}

// ─────────────────────────────────────────────
// Read state
// ─────────────────────────────────────────────

export type FrameworkMode = "active" | "inactive" | "unknown";

export async function getFrameworkMode(): Promise<FrameworkMode> {
  try {
    const output = await execGh([
      "api",
      "repos/{owner}/{repo}",
      "--jq",
      ".topics",
    ]);
    const topics = JSON.parse(output) as string[];
    return topics.includes(FRAMEWORK_TOPIC) ? "active" : "inactive";
  } catch {
    return "unknown";
  }
}

// ─────────────────────────────────────────────
// Write state
// ─────────────────────────────────────────────

export async function activateFrameworkMode(): Promise<{
  ok: boolean;
  alreadyActive: boolean;
  error?: string;
}> {
  try {
    const mode = await getFrameworkMode();
    if (mode === "active") {
      return { ok: true, alreadyActive: true };
    }

    await execGh([
      "repo",
      "edit",
      "--add-topic",
      FRAMEWORK_TOPIC,
    ]);
    return { ok: true, alreadyActive: false };
  } catch (e) {
    return {
      ok: false,
      alreadyActive: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deactivateFrameworkMode(
  bypassToken: string,
): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!bypassToken) {
    return { ok: false, error: "FRAMEWORK_BYPASS token required" };
  }

  // Token validation via SHA-256 hash-prefix (spec §2: full token never in logs)
  const expectedHash = process.env.FRAMEWORK_BYPASS_HASH;
  if (expectedHash && !validateTokenHash(bypassToken, expectedHash)) {
    return { ok: false, error: "Invalid FRAMEWORK_BYPASS token (hash mismatch)" };
  }

  try {
    const mode = await getFrameworkMode();
    if (mode === "inactive") {
      return { ok: true }; // Already inactive
    }

    await execGh([
      "repo",
      "edit",
      "--remove-topic",
      FRAMEWORK_TOPIC,
    ]);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export { FRAMEWORK_TOPIC };
