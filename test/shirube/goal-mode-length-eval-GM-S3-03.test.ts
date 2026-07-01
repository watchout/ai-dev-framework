import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type AcceptanceAssertion = {
  id: string;
  path: string;
  expected: string | number | boolean | string[];
};

type FixtureRecord = {
  fixture_id: string;
  observed: Record<string, unknown>;
  acceptance_assertions: AcceptanceAssertion[];
};

type TrialManifest = {
  planned_fixture_assertion_count: number;
  fixture_files?: string[];
  observed?: Record<string, unknown>;
  acceptance_assertions?: AcceptanceAssertion[];
};

const root = process.cwd();
const fixtureDir = path.join(root, "test/fixtures/shirube/goal-mode-length-eval/GM-S3-03");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(fixtureDir, fileName), "utf8")) as T;
}

function valueAtPath(record: Record<string, unknown>, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, record);
}

function fixtureRecords(manifest: TrialManifest): FixtureRecord[] {
  const manifestRecord = manifest.acceptance_assertions
    ? [{
      fixture_id: "GM-S3-03-manifest",
      observed: manifest.observed ?? {},
      acceptance_assertions: manifest.acceptance_assertions,
    }]
    : [];
  const fileRecords = (manifest.fixture_files ?? []).map((fileName) => readJson<FixtureRecord>(fileName));
  return [...manifestRecord, ...fileRecords];
}

describe("goal-mode length eval GM-S3-03", () => {
  it("matches the predeclared acceptance fixture assertions", () => {
    const manifest = readJson<TrialManifest>("GM-S3-03-manifest.json");
    const records = fixtureRecords(manifest);

    expect.assertions(manifest.planned_fixture_assertion_count);
    for (const record of records) {
      for (const assertion of record.acceptance_assertions) {
        expect(valueAtPath(record.observed, assertion.path), assertion.id).toEqual(assertion.expected);
      }
    }
  });
});
