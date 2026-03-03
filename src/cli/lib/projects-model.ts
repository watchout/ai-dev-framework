/**
 * Projects model - Types and persistence for project registry
 *
 * Manages a global registry of projects that use the framework.
 * The registry is stored at ~/.framework/projects.json by default,
 * but accepts a registryDir parameter for testability.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ProjectEntry {
  path: string;
  name: string;
  registeredAt: string;
}

export interface ProjectRegistry {
  projects: ProjectEntry[];
  updatedAt: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEFAULT_REGISTRY_DIR = path.join(os.homedir(), ".framework");
const REGISTRY_FILE = "projects.json";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function registryPath(registryDir?: string): string {
  const dir = registryDir ?? DEFAULT_REGISTRY_DIR;
  return path.join(dir, REGISTRY_FILE);
}

function ensureRegistryDir(registryDir?: string): void {
  const dir = registryDir ?? DEFAULT_REGISTRY_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Normalize a project path to an absolute, resolved path.
 */
export function normalizePath(projectPath: string): string {
  return path.resolve(projectPath);
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

/**
 * Load the project registry. Returns an empty registry if none exists.
 */
export function loadProjectRegistry(registryDir?: string): ProjectRegistry {
  const filePath = registryPath(registryDir);
  if (!fs.existsSync(filePath)) {
    return { projects: [], updatedAt: new Date().toISOString() };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ProjectRegistry;
  } catch {
    return { projects: [], updatedAt: new Date().toISOString() };
  }
}

/**
 * Save the project registry to disk.
 */
export function saveProjectRegistry(
  registry: ProjectRegistry,
  registryDir?: string,
): void {
  ensureRegistryDir(registryDir);
  const filePath = registryPath(registryDir);
  registry.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Add a project to the registry. Returns false if already registered (duplicate path).
 */
export function addProject(
  registry: ProjectRegistry,
  projectPath: string,
  name: string,
): boolean {
  const normalized = normalizePath(projectPath);
  const exists = registry.projects.some((p) => p.path === normalized);
  if (exists) return false;

  registry.projects.push({
    path: normalized,
    name,
    registeredAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Remove a project from the registry by path. Returns false if not found.
 */
export function removeProject(
  registry: ProjectRegistry,
  projectPath: string,
): boolean {
  const normalized = normalizePath(projectPath);
  const index = registry.projects.findIndex((p) => p.path === normalized);
  if (index === -1) return false;

  registry.projects.splice(index, 1);
  return true;
}

/**
 * List all registered projects.
 */
export function listProjects(registry: ProjectRegistry): ProjectEntry[] {
  return registry.projects;
}
