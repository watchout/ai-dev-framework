import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isTestFile,
  safeReadJson,
  walkDir,
  walkJsonFiles,
} from "./fs-utils.js";

describe("fs-utils", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-utils-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content = ""): string {
    const filePath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it("returns an empty list for empty or missing directories", () => {
    fs.mkdirSync(path.join(tmpDir, "empty"));

    expect(walkDir(path.join(tmpDir, "empty"), /\.ts$/)).toEqual([]);
    expect(walkDir(path.join(tmpDir, "missing"), /\.ts$/)).toEqual([]);
  });

  it("recursively collects deeply nested matching files", () => {
    const first = writeFile("src/index.ts");
    const nested = writeFile("src/lib/deep/component.tsx");
    writeFile("src/lib/deep/readme.md");

    expect(walkDir(path.join(tmpDir, "src"), /\.(ts|tsx)$/)).toEqual([
      first,
      nested,
    ]);
  });

  it("skips ignored directories and does not follow directory symlinks", () => {
    const source = writeFile("src/index.ts");
    writeFile("src/node_modules/pkg/ignored.ts");
    writeFile("linked/linked.ts");

    try {
      fs.symlinkSync(path.join(tmpDir, "linked"), path.join(tmpDir, "src/link"), "dir");
    } catch {
      // Some filesystems disallow symlink creation. The ignored-dir assertion still applies.
    }

    expect(walkDir(path.join(tmpDir, "src"), /\.ts$/)).toEqual([source]);
  });

  it("walks JSON files with the shared traversal rules", () => {
    const config = writeFile("config/app.json", "{}");
    writeFile("config/app.yaml", "value: true");
    writeFile("config/dist/generated.json", "{}");

    expect(walkJsonFiles(path.join(tmpDir, "config"))).toEqual([config]);
  });

  it("reads JSON with a fallback for missing or malformed files", () => {
    const config = writeFile("config.json", "{\"enabled\":true}");
    const fallback = { enabled: false };

    expect(safeReadJson(config, fallback)).toEqual({ enabled: true });
    expect(safeReadJson(path.join(tmpDir, "missing.json"), fallback)).toBe(fallback);
    expect(safeReadJson(writeFile("bad.json", "{"), fallback)).toBe(fallback);
  });

  it("recognizes test and spec file names", () => {
    expect(isTestFile("src/model.test.ts")).toBe(true);
    expect(isTestFile("src/model.spec.tsx")).toBe(true);
    expect(isTestFile("src/model.ts")).toBe(false);
  });
});
