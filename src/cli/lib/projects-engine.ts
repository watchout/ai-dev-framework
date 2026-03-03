/**
 * Projects engine - Business logic for project registry management
 *
 * Provides register, list, and unregister operations for projects
 * that use the framework.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadProjectRegistry,
  saveProjectRegistry,
  addProject,
  removeProject,
  listProjects,
  normalizePath,
  type ProjectEntry,
} from "./projects-model.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RegisterResult {
  success: boolean;
  message: string;
  entry?: ProjectEntry;
}

export interface ProjectListResult {
  projects: ProjectEntry[];
  warnings: string[];
}

// ─────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────

/**
 * Register a project in the global registry.
 * Validates that the path exists and contains a .framework/ directory.
 */
export function registerProject(
  projectPath: string,
  registryDir?: string,
): RegisterResult {
  const normalized = normalizePath(projectPath);

  // Validate path exists
  if (!fs.existsSync(normalized)) {
    return {
      success: false,
      message: `Path does not exist: ${normalized}`,
    };
  }

  // Validate it's a framework project
  const frameworkDir = path.join(normalized, ".framework");
  if (!fs.existsSync(frameworkDir)) {
    return {
      success: false,
      message: `Not a framework project (no .framework/ directory): ${normalized}`,
    };
  }

  const registry = loadProjectRegistry(registryDir);
  const name = path.basename(normalized);
  const added = addProject(registry, normalized, name);

  if (!added) {
    return {
      success: false,
      message: `Project already registered: ${normalized}`,
    };
  }

  saveProjectRegistry(registry, registryDir);

  const entry = registry.projects.find((p) => p.path === normalized);
  return {
    success: true,
    message: `Registered: ${name} (${normalized})`,
    entry,
  };
}

// ─────────────────────────────────────────────
// List
// ─────────────────────────────────────────────

/**
 * List all registered projects with existence warnings.
 */
export function listRegisteredProjects(
  registryDir?: string,
): ProjectListResult {
  const registry = loadProjectRegistry(registryDir);
  const projects = listProjects(registry);
  const warnings: string[] = [];

  for (const project of projects) {
    if (!fs.existsSync(project.path)) {
      warnings.push(`Path no longer exists: ${project.path}`);
    }
  }

  return { projects, warnings };
}

// ─────────────────────────────────────────────
// Unregister
// ─────────────────────────────────────────────

/**
 * Unregister a project from the global registry.
 */
export function unregisterProject(
  projectPath: string,
  registryDir?: string,
): RegisterResult {
  const normalized = normalizePath(projectPath);
  const registry = loadProjectRegistry(registryDir);
  const removed = removeProject(registry, normalized);

  if (!removed) {
    return {
      success: false,
      message: `Project not found in registry: ${normalized}`,
    };
  }

  saveProjectRegistry(registry, registryDir);
  return {
    success: true,
    message: `Unregistered: ${normalized}`,
  };
}
