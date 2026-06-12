import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { PlanState } from "../lib/plan-model.js";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");

function runCli(cwd: string, args: string[]): string {
  return execFileSync(TSX, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
}

function writeGateAEnvironment(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "test-proj",
        version: "0.1.0",
        type: "module",
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "^4.1.8", typescript: "^5.0.0" },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(projectDir, "node_modules"), { recursive: true });
}

function writeMinimalPlan(projectDir: string): void {
  const plan: PlanState = {
    status: "generated",
    generatedAt: "2026-02-03T00:00:00.000Z",
    updatedAt: "2026-02-03T00:00:00.000Z",
    waves: [
      {
        number: 1,
        phase: "individual",
        title: "Wave 1",
        features: [
          {
            id: "CLI-001",
            name: "CLI lifecycle",
            priority: "P1",
            size: "S",
            type: "proprietary",
            dependencies: [],
            dependencyCount: 0,
          },
        ],
      },
    ],
    tasks: [
      {
        id: "CLI-001-TEST",
        featureId: "CLI-001",
        kind: "test",
        name: "CLI lifecycle - Testing",
        references: ["§10"],
        blockedBy: [],
        blocks: [],
        size: "S",
        seq: "1000100010",
      },
    ],
    circularDependencies: [],
  };

  fs.writeFileSync(
    path.join(projectDir, ".framework/plan.json"),
    JSON.stringify(plan, null, 2),
    "utf-8",
  );
}

describe("CLI lifecycle E2E", () => {
  it("runs init -> gate A -> gate B -> status from a cold CLI project", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-e2e-lifecycle-"));
    try {
      runCli(tmpDir, ["init", "test-proj", "--type", "cli", "--skip-git"]);
      const projectDir = path.join(tmpDir, "test-proj");

      const projectJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, ".framework/project.json"), "utf-8"),
      ) as {
        name: string;
        version: string;
        profileType: string;
        phase: number;
        status: string;
        techStack: { framework: string; language: string };
        config: { aiProvider: string; escalationMode: string };
      };

      expect(projectJson).toMatchObject({
        name: "test-proj",
        version: "0.1.0",
        profileType: "cli",
        phase: -1,
        status: "initialized",
        techStack: {
          framework: "next.js",
          language: "typescript",
        },
        config: {
          aiProvider: "anthropic",
          escalationMode: "strict",
        },
      });
      expect(fs.existsSync(path.join(projectDir, ".framework/config.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".github/workflows/ci.yml"))).toBe(true);

      writeGateAEnvironment(projectDir);
      const gateA = runCli(projectDir, ["gate", "check-a", "--profile", "cli"]);
      expect(gateA).toContain("Gate A passed.");

      writeMinimalPlan(projectDir);
      const gateB = runCli(projectDir, ["gate", "check-b"]);
      expect(gateB).toContain("Gate B passed.");

      const statusRaw = runCli(projectDir, ["status", "--json"]);
      const status = JSON.parse(statusRaw) as {
        currentPhase: number;
        phaseLabel: string;
        profile: { type: string } | null;
        phases: Array<{ number: number; status: string }>;
        gates: { gateA: string; gateB: string; gateC: string } | null;
      };

      expect(status.profile?.type).toBe("cli");
      expect(status.currentPhase).toBeGreaterThanOrEqual(3);
      expect(status.phaseLabel.length).toBeGreaterThan(0);
      expect(status.phases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: 3, status: "completed" }),
        ]),
      );
      expect(status.gates).toMatchObject({
        gateA: "passed",
        gateB: "passed",
        gateC: "pending",
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30_000);
});
