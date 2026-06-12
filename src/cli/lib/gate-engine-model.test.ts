import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import Ajv from "ajv";

function readJson<T = unknown>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8"),
  ) as T;
}

describe("gate-engine artifact schemas", () => {
  it("validates the ContextPack example with Ajv", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(
      readJson<object>("docs/specs/schemas/context-pack.schema.json"),
    );
    const example = readJson(
      "docs/specs/schemas/examples/context-pack.example.json",
    );

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(
      true,
    );
  });

  it("validates the AIChangeRecord example with Ajv", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(
      readJson<object>("docs/specs/schemas/ai-change-record.schema.json"),
    );
    const example = readJson(
      "docs/specs/schemas/examples/ai-change-record.example.json",
    );

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(
      true,
    );
  });
});
