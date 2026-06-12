import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  doctorCompanyDevOsRuntimeBindings,
  hashNormalizedText,
  type CompanyDevOsRuntimeBindings,
} from "./company-dev-os-runtime-binding.js";

const REPO_ROOT = process.cwd();

function withRuntimeBindingFixture<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-company-dev-os-runtime-"));
  try {
    for (const filePath of [
      "AGENTS.md",
      "CLAUDE.md",
      ".codex/instructions.md",
      ".agents/skills/company-dev-os-runtime/SKILL.md",
    ]) {
      const target = path.join(dir, filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, filePath), target);
    }
    fs.cpSync(
      path.join(REPO_ROOT, ".shirube", "company-dev-os"),
      path.join(dir, ".shirube", "company-dev-os"),
      { recursive: true },
    );
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readBindings(dir: string): CompanyDevOsRuntimeBindings {
  return JSON.parse(
    fs.readFileSync(
      path.join(dir, ".shirube", "company-dev-os", "runtime-bindings.json"),
      "utf-8",
    ),
  ) as CompanyDevOsRuntimeBindings;
}

function writeBindings(dir: string, bindings: CompanyDevOsRuntimeBindings): void {
  fs.writeFileSync(
    path.join(dir, ".shirube", "company-dev-os", "runtime-bindings.json"),
    JSON.stringify(bindings, null, 2),
    "utf-8",
  );
}

describe("doctorCompanyDevOsRuntimeBindings", () => {
  it("validates bundled runtime bindings and checked file hashes", () => {
    const result = doctorCompanyDevOsRuntimeBindings(REPO_ROOT);

    expect(result.schema).toBe("shirube-company-dev-os-runtime-binding-doctor/v1");
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repo: "watchout/ai-dev-framework",
          files: expect.arrayContaining([
            expect.objectContaining({
              kind: "codex_entrypoint",
              path: "AGENTS.md",
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
            expect.objectContaining({
              kind: "skill",
              id: "company-dev-os-runtime",
              path: ".shirube/company-dev-os/skills/company-dev-os-runtime.skill.md",
            }),
          ]),
        }),
      ]),
    );
  });

  it("blocks missing runtime entrypoints deterministically", () => {
    withRuntimeBindingFixture((dir) => {
      fs.rmSync(path.join(dir, ".codex", "instructions.md"));

      const result = doctorCompanyDevOsRuntimeBindings(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing_entrypoint",
            path: ".codex/instructions.md",
          }),
        ]),
      );
    });
  });

  it("blocks missing skill binding files deterministically", () => {
    withRuntimeBindingFixture((dir) => {
      fs.rmSync(path.join(dir, ".shirube", "company-dev-os", "skills"), {
        recursive: true,
        force: true,
      });

      const result = doctorCompanyDevOsRuntimeBindings(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing_skill",
            path: ".shirube/company-dev-os/skills/company-dev-os-runtime.skill.md",
          }),
        ]),
      );
    });
  });

  it("blocks unreadable skill binding files deterministically", () => {
    withRuntimeBindingFixture((dir) => {
      const skillPath = path.join(
        dir,
        ".shirube",
        "company-dev-os",
        "skills",
        "company-dev-os-runtime.skill.md",
      );
      fs.rmSync(skillPath);
      fs.mkdirSync(skillPath);

      const result = doctorCompanyDevOsRuntimeBindings(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unreadable_skill",
            path: ".shirube/company-dev-os/skills/company-dev-os-runtime.skill.md",
          }),
        ]),
      );
    });
  });

  it("blocks configured hash drift deterministically", () => {
    withRuntimeBindingFixture((dir) => {
      const bindings = readBindings(dir);
      bindings.repositories[0].expected_hashes = {
        "AGENTS.md": hashNormalizedText("old AGENTS content\n"),
      };
      writeBindings(dir, bindings);

      const result = doctorCompanyDevOsRuntimeBindings(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "hash_mismatch",
            path: "AGENTS.md",
          }),
        ]),
      );
    });
  });

  it("reports missing runtime-bindings.json", () => {
    withRuntimeBindingFixture((dir) => {
      fs.rmSync(path.join(dir, ".shirube", "company-dev-os", "runtime-bindings.json"));

      const result = doctorCompanyDevOsRuntimeBindings(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing_bindings_file",
          }),
        ]),
      );
    });
  });
});
