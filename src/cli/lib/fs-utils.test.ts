import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  FrameworkError,
  parseJsonOrThrow,
  safeReadJson,
} from "./fs-utils.js";

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-fs-utils-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("fs-utils", () => {
  it("safeReadJson returns parsed JSON for valid input", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "valid.json");
      fs.writeFileSync(file, JSON.stringify({ name: "shirube" }), "utf-8");

      expect(safeReadJson(file, { name: "fallback" })).toEqual({
        name: "shirube",
      });
    });
  });

  it("safeReadJson returns fallback for invalid JSON", () => {
    withTempDir((dir) => {
      const file = path.join(dir, "invalid.json");
      fs.writeFileSync(file, "{ invalid", "utf-8");

      expect(safeReadJson(file, { ok: false })).toEqual({ ok: false });
    });
  });

  it("safeReadJson returns fallback for missing files", () => {
    withTempDir((dir) => {
      expect(
        safeReadJson(path.join(dir, "missing.json"), { missing: true }),
      ).toEqual({ missing: true });
    });
  });

  it("parseJsonOrThrow throws FrameworkError with file context", () => {
    withTempDir((dir) => {
      const file = path.join(dir, ".framework", "project.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{ invalid", "utf-8");

      expect(() => parseJsonOrThrow(file)).toThrow(FrameworkError);
      expect(() => parseJsonOrThrow(file)).toThrow(file);
    });
  });
});
