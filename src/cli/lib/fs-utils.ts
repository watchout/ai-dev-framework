import * as fs from "node:fs";

export class FrameworkError extends Error {
  readonly code: string;
  readonly filePath?: string;

  constructor(
    message: string,
    options: { code: string; filePath?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "FrameworkError";
    this.code = options.code;
    this.filePath = options.filePath;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseJsonOrThrow<T>(filePath: string): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new FrameworkError(
      `Failed to read JSON file ${filePath}: ${reason}`,
      {
        code: "invalid_json_file",
        filePath,
        cause: error,
      },
    );
  }
}
