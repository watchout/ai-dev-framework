/**
 * Tests for projects-model.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadProjectRegistry,
  saveProjectRegistry,
  addProject,
  removeProject,
  listProjects,
  normalizePath,
  type ProjectRegistry,
} from "./projects-model.js";

// ─────────────────────────────────────────────
// normalizePath
// ─────────────────────────────────────────────

describe("normalizePath", () => {
  it("resolves relative paths to absolute", () => {
    const result = normalizePath("./my-project");
    expect(path.isAbsolute(result)).toBe(true);
  });

  it("keeps absolute paths as-is (after resolve)", () => {
    const result = normalizePath("/tmp/my-project");
    expect(result).toBe("/tmp/my-project");
  });

  it("resolves .. in paths", () => {
    const result = normalizePath("/tmp/foo/../bar");
    expect(result).toBe("/tmp/bar");
  });
});

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

describe("project registry persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proj-model-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty registry when no file exists", () => {
    const registry = loadProjectRegistry(tmpDir);
    expect(registry.projects).toEqual([]);
  });

  it("round-trip save and load", () => {
    const registry: ProjectRegistry = {
      projects: [
        {
          path: "/tmp/my-project",
          name: "my-project",
          registeredAt: "2026-03-03T10:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-03T10:00:00.000Z",
    };

    saveProjectRegistry(registry, tmpDir);

    const loaded = loadProjectRegistry(tmpDir);
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].path).toBe("/tmp/my-project");
    expect(loaded.projects[0].name).toBe("my-project");
  });

  it("creates registry directory if missing", () => {
    const nestedDir = path.join(tmpDir, "nested", "dir");
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    saveProjectRegistry(registry, nestedDir);
    expect(fs.existsSync(path.join(nestedDir, "projects.json"))).toBe(true);
  });

  it("returns empty registry for corrupted JSON", () => {
    fs.writeFileSync(
      path.join(tmpDir, "projects.json"),
      "not valid json",
      "utf-8",
    );
    const registry = loadProjectRegistry(tmpDir);
    expect(registry.projects).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// addProject / removeProject
// ─────────────────────────────────────────────

describe("addProject", () => {
  it("adds a project to registry", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    const added = addProject(registry, "/tmp/my-project", "my-project");
    expect(added).toBe(true);
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].name).toBe("my-project");
  });

  it("detects duplicate paths", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    addProject(registry, "/tmp/my-project", "my-project");
    const added = addProject(registry, "/tmp/my-project", "my-project");
    expect(added).toBe(false);
    expect(registry.projects).toHaveLength(1);
  });

  it("normalizes paths for duplicate detection", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    addProject(registry, "/tmp/my-project", "my-project");
    const added = addProject(registry, "/tmp/foo/../my-project", "alias");
    expect(added).toBe(false);
    expect(registry.projects).toHaveLength(1);
  });
});

describe("removeProject", () => {
  it("removes an existing project", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    addProject(registry, "/tmp/my-project", "my-project");
    const removed = removeProject(registry, "/tmp/my-project");
    expect(removed).toBe(true);
    expect(registry.projects).toHaveLength(0);
  });

  it("returns false for non-existent project", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    const removed = removeProject(registry, "/tmp/nope");
    expect(removed).toBe(false);
  });
});

// ─────────────────────────────────────────────
// listProjects
// ─────────────────────────────────────────────

describe("listProjects", () => {
  it("returns all projects", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    addProject(registry, "/tmp/a", "project-a");
    addProject(registry, "/tmp/b", "project-b");

    const projects = listProjects(registry);
    expect(projects).toHaveLength(2);
  });

  it("returns empty for empty registry", () => {
    const registry: ProjectRegistry = {
      projects: [],
      updatedAt: new Date().toISOString(),
    };

    expect(listProjects(registry)).toEqual([]);
  });
});
