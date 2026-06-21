import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "schemas/shirube-audit.schema.json");
const fixtures = path.join(root, "test/fixtures/shirube/audit-schema");

type JsonObject = Record<string, unknown>;

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as JsonObject;

function fixture(name: string): JsonObject {
  return JSON.parse(readFileSync(path.join(fixtures, name), "utf8")) as JsonObject;
}

function readDef(name: string): JsonObject {
  const defs = schema.$defs as Record<string, JsonObject>;
  return defs[name];
}

function requiredFields(definition: JsonObject): string[] {
  return definition.required as string[];
}

function enumValues(definition: JsonObject, property: string): string[] {
  const properties = definition.properties as Record<string, JsonObject>;
  return properties[property].enum as string[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateDocument(document: JsonObject): string[] {
  if (document.schema_version !== "shirube-audit/v1") {
    return ["schema_version"];
  }

  if (document.document_type === "audit_record") {
    return validateAuditRecord(document);
  }

  if (document.document_type === "audit_item_set") {
    return validateAuditItemSet(document);
  }

  return ["document_type"];
}

function validateRequired(definition: JsonObject, document: JsonObject, scope: string): string[] {
  return requiredFields(definition)
    .filter((field) => document[field] === undefined)
    .map((field) => `${scope}.${field}`);
}

function validateAuditRecord(document: JsonObject): string[] {
  const errors = validateRequired(readDef("audit_record"), document, "audit_record");
  const items = document.items;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push("audit_record.items");
    return errors;
  }

  const resultDefinition = readDef("audit_item_result");
  const allowedVerdicts = enumValues(resultDefinition, "verdict");

  items.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`items.${index}`);
      return;
    }
    errors.push(...validateRequired(resultDefinition, item, `items.${index}`));

    if (typeof item.verdict !== "string" || !allowedVerdicts.includes(item.verdict)) {
      errors.push(`items.${index}.verdict`);
    }

    if (item.verdict === "FAIL" && (!Array.isArray(item.evidence_ref) || item.evidence_ref.length === 0)) {
      errors.push(`items.${index}.evidence_ref`);
    }
  });

  return errors;
}

function validateAuditItemSet(document: JsonObject): string[] {
  const errors = validateRequired(readDef("audit_item_set"), document, "audit_item_set");
  const items = document.items;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push("audit_item_set.items");
    return errors;
  }

  const itemDefinition = readDef("audit_item");
  items.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`items.${index}`);
      return;
    }
    errors.push(...validateRequired(itemDefinition, item, `items.${index}`));
  });

  return errors;
}

function parseYamlTemplate(templatePath: string): JsonObject {
  const text = readFileSync(path.join(root, templatePath), "utf8");
  const json = execFileSync("ruby", [
    "-ryaml",
    "-rjson",
    "-e",
    "puts JSON.generate(YAML.safe_load(STDIN.read, aliases: true))",
  ], { input: text, encoding: "utf8" });
  return JSON.parse(json) as JsonObject;
}

describe("shirube-audit/v1 schema", () => {
  it("defines one canonical schema for audit records and item sets", () => {
    expect(schema.$id).toBe("https://shirube.dev/schemas/shirube-audit.schema.json");
    expect(schema.oneOf).toEqual([
      { $ref: "#/$defs/audit_record" },
      { $ref: "#/$defs/audit_item_set" },
    ]);
  });

  it("accepts a valid structured audit record", () => {
    expect(validateDocument(fixture("valid-record.json"))).toEqual([]);
  });

  it("rejects an audit record with a missing item id", () => {
    expect(validateDocument(fixture("missing-item.json"))).toContain("items.0.item_id");
  });

  it("rejects FAIL without evidence_ref", () => {
    expect(validateDocument(fixture("fail-without-evidence.json"))).toContain("items.0.evidence_ref");
  });

  it("rejects unknown verdict values", () => {
    expect(validateDocument(fixture("unknown-verdict.json"))).toContain("items.0.verdict");
  });

  it("requires reviewer actor and model metadata", () => {
    expect(validateDocument(fixture("missing-reviewer-meta.json"))).toEqual(
      expect.arrayContaining(["audit_record.reviewer_actor", "audit_record.reviewer_model"]),
    );
  });

  it("accepts an audit item set with per-stage items", () => {
    expect(validateDocument(fixture("valid-item-set.json"))).toEqual([]);
  });

  it("keeps templates parseable and tied to shirube-audit/v1", () => {
    const record = parseYamlTemplate("templates/shirube-audit-record.yaml");
    const itemSet = parseYamlTemplate("templates/shirube-audit-item-set.yaml");

    expect(record.schema_version).toBe("shirube-audit/v1");
    expect(record.document_type).toBe("audit_record");
    expect(itemSet.schema_version).toBe("shirube-audit/v1");
    expect(itemSet.document_type).toBe("audit_item_set");
  });
});
