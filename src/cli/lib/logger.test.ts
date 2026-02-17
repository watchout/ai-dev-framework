import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "./logger.js";

let stdoutOutput: string[];
let stderrOutput: string[];

beforeEach(() => {
  stdoutOutput = [];
  stderrOutput = [];
  vi.spyOn(process.stdout, "write").mockImplementation((data) => {
    stdoutOutput.push(String(data));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((data) => {
    stderrOutput.push(String(data));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  describe("info", () => {
    it("writes to stdout with newline", () => {
      logger.info("hello");
      expect(stdoutOutput).toEqual(["hello\n"]);
    });
  });

  describe("success", () => {
    it("writes to stdout with + prefix", () => {
      logger.success("done");
      expect(stdoutOutput[0]).toContain("+");
      expect(stdoutOutput[0]).toContain("done");
    });

    it("includes green color code", () => {
      logger.success("ok");
      expect(stdoutOutput[0]).toContain("\x1b[32m");
    });
  });

  describe("warn", () => {
    it("writes to stderr", () => {
      logger.warn("caution");
      expect(stderrOutput[0]).toContain("warning");
      expect(stderrOutput[0]).toContain("caution");
    });

    it("includes yellow color code", () => {
      logger.warn("test");
      expect(stderrOutput[0]).toContain("\x1b[33m");
    });
  });

  describe("error", () => {
    it("writes to stderr", () => {
      logger.error("failed");
      expect(stderrOutput[0]).toContain("error");
      expect(stderrOutput[0]).toContain("failed");
    });

    it("includes red color code", () => {
      logger.error("test");
      expect(stderrOutput[0]).toContain("\x1b[31m");
    });
  });

  describe("step", () => {
    it("writes step counter with message", () => {
      logger.step(1, 5, "Installing");
      expect(stdoutOutput[0]).toContain("[1/5]");
      expect(stdoutOutput[0]).toContain("Installing");
    });

    it("uses dim color for step counter", () => {
      logger.step(3, 10, "test");
      expect(stdoutOutput[0]).toContain("\x1b[2m");
    });
  });

  describe("header", () => {
    it("writes bold text with newline prefix", () => {
      logger.header("Title");
      expect(stdoutOutput[0]).toContain("\n");
      expect(stdoutOutput[0]).toContain("Title");
      expect(stdoutOutput[0]).toContain("\x1b[1m");
    });
  });

  describe("dim", () => {
    it("writes dim text", () => {
      logger.dim("quiet text");
      expect(stdoutOutput[0]).toContain("quiet text");
      expect(stdoutOutput[0]).toContain("\x1b[2m");
    });
  });

  describe("tree", () => {
    it("writes indented lines", () => {
      logger.tree(["├── file1", "└── file2"]);
      expect(stdoutOutput).toHaveLength(2);
      expect(stdoutOutput[0]).toContain("  ├── file1");
      expect(stdoutOutput[1]).toContain("  └── file2");
    });

    it("handles empty array", () => {
      logger.tree([]);
      expect(stdoutOutput).toHaveLength(0);
    });
  });
});
