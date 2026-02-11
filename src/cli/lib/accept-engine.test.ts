import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type AcceptIO,
  runAcceptance,
} from "./accept-engine.js";

function createMockIO(): AcceptIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("accept-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-accept-engine-"));
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runAcceptance", () => {
    it("returns rejected report for empty project", () => {
      const io = createMockIO();
      const report = runAcceptance(tmpDir, "AUTH-001", {}, io);

      expect(report.verdict).toBe("rejected");
      expect(report.featureId).toBe("AUTH-001");
      expect(report.rejectionReasons.length).toBeGreaterThan(0);
    });

    it("prints feature acceptance header", () => {
      const io = createMockIO();
      runAcceptance(tmpDir, "AUTH-001", {}, io);

      expect(io.output.some((o) => o.includes("FEATURE ACCEPTANCE"))).toBe(true);
      expect(io.output.some((o) => o.includes("AUTH-001"))).toBe(true);
    });

    it("prints scorecard with all categories", () => {
      const io = createMockIO();
      runAcceptance(tmpDir, "AUTH-001", {}, io);

      expect(io.output.some((o) => o.includes("Scorecard"))).toBe(true);
      expect(io.output.some((o) => o.includes("MUST Requirements"))).toBe(true);
      expect(io.output.some((o) => o.includes("User Flow E2E"))).toBe(true);
      expect(io.output.some((o) => o.includes("Error Flows"))).toBe(true);
      expect(io.output.some((o) => o.includes("Non-Functional"))).toBe(true);
      expect(io.output.some((o) => o.includes("Integration"))).toBe(true);
    });

    it("saves report to .framework/audits", () => {
      const io = createMockIO();
      runAcceptance(tmpDir, "AUTH-001", {}, io);

      const auditsDir = path.join(tmpDir, ".framework", "audits");
      expect(fs.existsSync(auditsDir)).toBe(true);
      const files = fs.readdirSync(auditsDir);
      expect(files.some((f) => f.startsWith("accept-AUTH-001"))).toBe(true);
    });

    it("resolves feature name from plan.json", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework", "plan.json"),
        JSON.stringify({
          waves: [{
            features: [{
              id: "AUTH-001",
              name: "User Login",
            }],
          }],
        }),
      );

      const io = createMockIO();
      const report = runAcceptance(tmpDir, "AUTH-001", {}, io);

      expect(report.featureName).toBe("User Login");
      expect(io.output.some((o) => o.includes("User Login"))).toBe(true);
    });

    it("shows status when --status flag is set", () => {
      // First create a report
      const io1 = createMockIO();
      runAcceptance(tmpDir, "AUTH-001", {}, io1);

      // Then check status
      const io2 = createMockIO();
      runAcceptance(tmpDir, "AUTH-001", { status: true }, io2);

      expect(io2.output.some((o) => o.includes("ACCEPTANCE STATUS"))).toBe(true);
    });

    it("lists rejection reasons for failed checks", () => {
      const io = createMockIO();
      const report = runAcceptance(tmpDir, "MISSING-FEATURE", {}, io);

      expect(report.rejectionReasons.length).toBeGreaterThan(0);
      expect(io.output.some((o) => o.includes("Rejection reasons"))).toBe(true);
    });

    it("prints check results with pass/fail indicators", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "auth-login.ts"),
        "export function login() { try { doLogin(); } catch (e) { throw e; } }",
      );

      const io = createMockIO();
      runAcceptance(tmpDir, "auth", {}, io);

      expect(io.output.some((o) => o.includes("[PASS]"))).toBe(true);
    });
  });
});
