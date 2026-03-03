/**
 * Tests for projects-engine.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  registerProject,
  listRegisteredProjects,
  unregisterProject,
} from "./projects-engine.js";

describe("registerProject", () => {
  let tmpDir: string;
  let registryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proj-engine-test-"));
    registryDir = path.join(tmpDir, "registry");
    fs.mkdirSync(registryDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFrameworkProject(name: string): string {
    const projectDir = path.join(tmpDir, name);
    fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
    return projectDir;
  }

  it("registers a valid framework project", () => {
    const projectDir = createFrameworkProject("my-project");
    const result = registerProject(projectDir, registryDir);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Registered");
    expect(result.entry).toBeDefined();
    expect(result.entry!.name).toBe("my-project");
  });

  it("fails for non-existent path", () => {
    const result = registerProject(
      path.join(tmpDir, "does-not-exist"),
      registryDir,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("does not exist");
  });

  it("fails for non-framework project", () => {
    const projectDir = path.join(tmpDir, "plain-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const result = registerProject(projectDir, registryDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Not a framework project");
  });

  it("fails for duplicate registration", () => {
    const projectDir = createFrameworkProject("my-project");
    registerProject(projectDir, registryDir);

    const result = registerProject(projectDir, registryDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("already registered");
  });
});

describe("listRegisteredProjects", () => {
  let tmpDir: string;
  let registryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proj-list-test-"));
    registryDir = path.join(tmpDir, "registry");
    fs.mkdirSync(registryDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty list for fresh registry", () => {
    const result = listRegisteredProjects(registryDir);
    expect(result.projects).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("lists registered projects", () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });

    registerProject(projectDir, registryDir);

    const result = listRegisteredProjects(registryDir);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe("my-project");
  });

  it("warns about missing paths", () => {
    // Register a project, then delete its directory
    const projectDir = path.join(tmpDir, "ephemeral");
    fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
    registerProject(projectDir, registryDir);

    fs.rmSync(projectDir, { recursive: true, force: true });

    const result = listRegisteredProjects(registryDir);
    expect(result.projects).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("no longer exists");
  });
});

describe("unregisterProject", () => {
  let tmpDir: string;
  let registryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proj-unreg-test-"));
    registryDir = path.join(tmpDir, "registry");
    fs.mkdirSync(registryDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes a registered project", () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
    registerProject(projectDir, registryDir);

    const result = unregisterProject(projectDir, registryDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain("Unregistered");

    const list = listRegisteredProjects(registryDir);
    expect(list.projects).toHaveLength(0);
  });

  it("fails for unregistered project", () => {
    const result = unregisterProject("/tmp/not-registered", registryDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });
});
