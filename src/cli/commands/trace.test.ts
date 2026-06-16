import { afterEach, describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { Command } from "commander";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { registerTraceCommand } from "./trace.js";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

class ProcessExit extends Error {
  constructor(readonly code: string | number | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function runTrace(cwd: string, args: string[]): CliResult {
  try {
    const stdout = execFileSync(TSX, [CLI_PATH, "trace", ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

function runTraceInProcess(cwd: string, args: string[]): CliResult {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: (value) => {
      stdout += value;
    },
    writeErr: (value) => {
      stderr += value;
    },
  });
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  });
  vi.spyOn(process, "exit").mockImplementation(((code) => {
    throw new ProcessExit(code);
  }) as typeof process.exit);

  registerTraceCommand(program);

  try {
    program.parse(["node", "shirube", "trace", ...args], { from: "node" });
  } catch (error) {
    if (error instanceof ProcessExit) {
      exitCode =
        typeof error.code === "number"
          ? error.code
          : error.code === undefined || error.code === null
            ? 0
            : Number(error.code);
    } else {
      throw error;
    }
  }

  return { exitCode, stdout, stderr };
}

function withTempProject(test: (projectDir: string) => void): void {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-command-"));
  try {
    test(projectDir);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

function writeConfig(projectDir: string, config: Record<string, unknown>): void {
  const frameworkDir = path.join(projectDir, ".framework");
  fs.mkdirSync(frameworkDir, { recursive: true });
  fs.writeFileSync(
    path.join(frameworkDir, "config.json"),
    JSON.stringify(config),
    "utf-8",
  );
}

function writeTraceDoc(
  projectDir: string,
  layer: "spec" | "impl" | "verify" | "ops",
  id: string,
  traces: Record<string, string[]>,
): void {
  const dir = path.join(projectDir, "docs", layer);
  fs.mkdirSync(dir, { recursive: true });
  const traceLines = Object.entries(traces).flatMap(([targetLayer, ids]) => [
    `  ${targetLayer}: [${ids.join(", ")}]`,
  ]);
  fs.writeFileSync(
    path.join(dir, `${id.toLowerCase()}.md`),
    [
      "---",
      `id: ${id}`,
      "status: Draft",
      "traces:",
      ...traceLines,
      "---",
      `# ${id}`,
      "",
      "## Purpose",
      "Trace command coverage fixture.",
      "",
    ].join("\n"),
    "utf-8",
  );
}

/**
 * CLI integration test for shirube trace command.
 * Validates that the command module exports are correctly structured.
 */
describe("trace command", () => {
  it("trace.ts exports registerTraceCommand", async () => {
    const mod = await import("./trace.js");
    expect(typeof mod.registerTraceCommand).toBe("function");
  });

  it("trace.ts is registered in index.ts", () => {
    const indexPath = path.resolve("src/cli/index.ts");
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain("registerTraceCommand");
    expect(content).toContain("./commands/trace.js");
  });

  it("trace verify skips when docs_layers is disabled or missing", () => {
    withTempProject((projectDir) => {
      const result = runTrace(projectDir, ["verify"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Skipping trace verification.");
    });
  });

  it("trace verify passes when every required trace is present", () => {
    withTempProject((projectDir) => {
      writeConfig(projectDir, { docs_layers: { enabled: true } });
      writeTraceDoc(projectDir, "spec", "SPEC-AUTH-001", {
        impl: ["IMPL-AUTH-001"],
        verify: ["VERIFY-AUTH-001"],
        ops: ["OPS-AUTH-001"],
      });
      writeTraceDoc(projectDir, "impl", "IMPL-AUTH-001", {
        spec: ["SPEC-AUTH-001"],
        verify: ["VERIFY-AUTH-001"],
        ops: ["OPS-AUTH-001"],
      });
      writeTraceDoc(projectDir, "verify", "VERIFY-AUTH-001", {
        impl: ["IMPL-AUTH-001"],
        spec: ["SPEC-AUTH-001"],
      });
      writeTraceDoc(projectDir, "ops", "OPS-AUTH-001", {
        spec: ["SPEC-AUTH-001"],
        impl: ["IMPL-AUTH-001"],
      });

      const result = runTrace(projectDir, ["verify"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Trace verification PASSED");
      expect(result.stdout).toContain("Total nodes: 4");
    });
  });

  it("trace verify writes a report and exits 2 for strict failures", () => {
    withTempProject((projectDir) => {
      writeConfig(projectDir, { docs_layers: { enabled: true, strict: true } });
      writeTraceDoc(projectDir, "spec", "SPEC-AUTH-001", {
        impl: ["IMPL-MISSING-001"],
      });

      const result = runTrace(projectDir, ["verify"]);
      const reportsDir = path.join(projectDir, ".framework", "reports");
      const reportFiles = fs.readdirSync(reportsDir);
      const combined = result.stdout + result.stderr;

      expect(result.exitCode).toBe(2);
      expect(combined).toContain("Trace verification BLOCKED");
      expect(combined).toContain("Broken references: 1");
      expect(reportFiles).toHaveLength(1);
      expect(fs.readFileSync(path.join(reportsDir, reportFiles[0]), "utf-8")).toContain(
        "Status: **BLOCK**",
      );
    });
  });

  it("trace graph renders mermaid output to stdout and files", () => {
    withTempProject((projectDir) => {
      writeConfig(projectDir, { docs_layers: { enabled: true } });
      writeTraceDoc(projectDir, "spec", "SPEC-AUTH-001", {
        impl: ["IMPL-AUTH-001"],
      });
      writeTraceDoc(projectDir, "impl", "IMPL-AUTH-001", {
        spec: ["SPEC-AUTH-001"],
      });

      const stdoutResult = runTrace(projectDir, ["graph"]);
      const fileResult = runTrace(projectDir, [
        "graph",
        "--out",
        ".framework/reports/trace.mmd",
      ]);

      expect(stdoutResult.exitCode).toBe(0);
      expect(stdoutResult.stdout).toContain("graph LR");
      expect(stdoutResult.stdout).toContain("SPEC-AUTH-001");
      expect(fileResult.exitCode).toBe(0);
      expect(fileResult.stdout).toContain("Graph written");
      expect(
        fs.readFileSync(
          path.join(projectDir, ".framework", "reports", "trace.mmd"),
          "utf-8",
        ),
      ).toContain("graph LR");
    });
  });

  it("trace graph handles unsupported format and empty graphs", () => {
    withTempProject((projectDir) => {
      const emptyResult = runTrace(projectDir, ["graph"]);
      const unsupportedResult = runTrace(projectDir, [
        "graph",
        "--format",
        "dot",
      ]);

      expect(emptyResult.exitCode).toBe(0);
      expect(unsupportedResult.exitCode).toBe(2);
      expect(unsupportedResult.stderr).toContain("Unsupported format: dot");
    });
  });

  it("runs trace verify in process for coverage-visible pass and strict block paths", () => {
    withTempProject((projectDir) => {
      writeConfig(projectDir, { docs_layers: { enabled: true } });
      writeTraceDoc(projectDir, "spec", "SPEC-COV-001", {
        impl: ["IMPL-COV-001"],
      });
      writeTraceDoc(projectDir, "impl", "IMPL-COV-001", {
        spec: ["SPEC-COV-001"],
        verify: ["VERIFY-COV-001"],
        ops: ["OPS-COV-001"],
      });
      writeTraceDoc(projectDir, "verify", "VERIFY-COV-001", {
        impl: ["IMPL-COV-001"],
        spec: ["SPEC-COV-001"],
      });
      writeTraceDoc(projectDir, "ops", "OPS-COV-001", {
        spec: ["SPEC-COV-001"],
        impl: ["IMPL-COV-001"],
      });

      const pass = runTraceInProcess(projectDir, ["verify"]);

      expect(pass.exitCode).toBe(0);
      expect(pass.stdout).toContain("Trace verification PASSED");
    });

    withTempProject((projectDir) => {
      writeConfig(projectDir, { docs_layers: { enabled: true, strict: true } });
      writeTraceDoc(projectDir, "spec", "SPEC-COV-002", {
        impl: ["IMPL-MISSING-002"],
      });

      const blocked = runTraceInProcess(projectDir, ["verify"]);

      expect(blocked.exitCode).toBe(2);
      expect(blocked.stderr).toContain("Trace verification BLOCKED");
      expect(
        fs.readdirSync(path.join(projectDir, ".framework", "reports")),
      ).toHaveLength(1);
    });
  });

  it("runs trace graph in process for output, file, empty, and error paths", () => {
    withTempProject((projectDir) => {
      writeConfig(projectDir, { docs_layers: { enabled: true } });
      writeTraceDoc(projectDir, "spec", "SPEC-GRAPH-001", {
        impl: ["IMPL-GRAPH-001"],
      });
      writeTraceDoc(projectDir, "impl", "IMPL-GRAPH-001", {
        spec: ["SPEC-GRAPH-001"],
      });

      const stdoutResult = runTraceInProcess(projectDir, ["graph"]);
      const fileResult = runTraceInProcess(projectDir, [
        "graph",
        "--out",
        ".framework/reports/trace.mmd",
      ]);

      expect(stdoutResult.exitCode).toBe(0);
      expect(stdoutResult.stdout).toContain("graph LR");
      expect(fileResult.exitCode).toBe(0);
      expect(fileResult.stdout).toContain("Graph written");
    });

    withTempProject((projectDir) => {
      const emptyResult = runTraceInProcess(projectDir, ["graph"]);
      const unsupportedResult = runTraceInProcess(projectDir, [
        "graph",
        "--format",
        "dot",
      ]);

      expect(emptyResult.exitCode).toBe(0);
      expect(emptyResult.stderr).toContain("No documents found");
      expect(unsupportedResult.exitCode).toBe(2);
      expect(unsupportedResult.stderr).toContain("Unsupported format: dot");
    });
  });
});
