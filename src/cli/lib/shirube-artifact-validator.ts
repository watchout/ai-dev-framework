import * as fs from "node:fs";
import * as path from "node:path";

export type ShirubeArtifactValidationVerdict = "PASS" | "BLOCKED";

export interface ShirubeArtifactValidationInput {
  rootDir: string;
  artifactPaths?: string[];
}

export interface ShirubeArtifactValidationFinding {
  code: string;
  message: string;
  path?: string;
  field?: string;
}

export interface ShirubeArtifactValidationRecord {
  path: string;
  schema_version: string;
  schema_file: string;
  status: "PASS" | "FAIL";
}

export interface ShirubeArtifactValidationReport {
  schema: "shirube-artifact-validation/v1";
  verdict: ShirubeArtifactValidationVerdict;
  root: string;
  artifacts: ShirubeArtifactValidationRecord[];
  blockers: ShirubeArtifactValidationFinding[];
  warnings: ShirubeArtifactValidationFinding[];
  summary: {
    scanned: number;
    validated: number;
    failed: number;
  };
}

type JsonValue = null | boolean | string | number | JsonValue[] | { [key: string]: JsonValue };

interface JsonSchema {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  const?: JsonValue;
  enum?: JsonValue[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minLength?: number;
  minItems?: number;
  pattern?: string;
}

interface ParsedYamlLine {
  indent: number;
  text: string;
  lineNumber: number;
}

const REPORT_SCHEMA = "shirube-artifact-validation/v1" as const;

const SCHEMA_VERSION_TO_FILE: Record<string, string> = {
  "shirube-repo-spec/v1": "repo-spec.schema.json",
  "shirube-agent-policy/v1": "agent-policy.schema.json",
  "shirube-cell/v1": "cell.schema.json",
  "shirube-audit-result/v1": "audit-result.schema.json",
  "shirube-evidence/v1": "evidence.schema.json",
};

const KNOWN_ARTIFACT_PATTERNS = [
  /^\.shirube\/repo-spec\.ya?ml$/,
  /^\.shirube\/agent-policy\.ya?ml$/,
  /^\.shirube\/cells\/[^/]+\.ya?ml$/,
  /^\.shirube\/audits\/[^/]+\.ya?ml$/,
  /^\.shirube\/evidence\/[^/]+\.ya?ml$/,
];

export function buildShirubeArtifactValidationReport(
  input: ShirubeArtifactValidationInput,
): ShirubeArtifactValidationReport {
  const rootDir = path.resolve(input.rootDir);
  const artifactPaths = input.artifactPaths
    ? input.artifactPaths.map((artifactPath) => normalizePath(artifactPath)).sort()
    : discoverShirubeArtifactPaths(rootDir);
  const artifacts: ShirubeArtifactValidationRecord[] = [];
  const blockers: ShirubeArtifactValidationFinding[] = [];
  const warnings: ShirubeArtifactValidationFinding[] = [];

  for (const artifactPath of artifactPaths) {
    if (!isKnownShirubeArtifactPath(artifactPath)) {
      warnings.push({
        code: "unsupported_artifact_path",
        path: artifactPath,
        message: `${artifactPath} is not one of the Shirube v1 artifact locations validated by this command.`,
      });
      continue;
    }

    const absolutePath = path.join(rootDir, artifactPath);
    let document: JsonValue;
    try {
      document = parseYamlSubset(fs.readFileSync(absolutePath, "utf8"));
    } catch (error) {
      blockers.push({
        code: "invalid_yaml",
        path: artifactPath,
        message: error instanceof Error ? error.message : String(error),
      });
      artifacts.push({
        path: artifactPath,
        schema_version: "UNKNOWN",
        schema_file: "-",
        status: "FAIL",
      });
      continue;
    }

    if (!isRecord(document)) {
      blockers.push({
        code: "invalid_artifact_root",
        path: artifactPath,
        message: `${artifactPath} root must be a mapping.`,
      });
      artifacts.push({
        path: artifactPath,
        schema_version: "UNKNOWN",
        schema_file: "-",
        status: "FAIL",
      });
      continue;
    }

    const schemaVersion = typeof document.schema_version === "string" ? document.schema_version : undefined;
    if (!schemaVersion) {
      blockers.push({
        code: "missing_schema_version",
        path: artifactPath,
        field: "schema_version",
        message: `${artifactPath} is missing schema_version.`,
      });
      artifacts.push({
        path: artifactPath,
        schema_version: "UNKNOWN",
        schema_file: "-",
        status: "FAIL",
      });
      continue;
    }

    const schemaFile = SCHEMA_VERSION_TO_FILE[schemaVersion];
    if (!schemaFile) {
      blockers.push({
        code: "unsupported_schema_version",
        path: artifactPath,
        field: "schema_version",
        message: `${schemaVersion} is not supported by this v1 artifact validator.`,
      });
      artifacts.push({
        path: artifactPath,
        schema_version: schemaVersion,
        schema_file: "-",
        status: "FAIL",
      });
      continue;
    }

    const schemaPath = path.join(rootDir, "schemas", schemaFile);
    let schema: JsonSchema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as JsonSchema;
    } catch (error) {
      blockers.push({
        code: "missing_or_invalid_schema_file",
        path: normalizePath(path.relative(rootDir, schemaPath)),
        message: error instanceof Error ? error.message : String(error),
      });
      artifacts.push({
        path: artifactPath,
        schema_version: schemaVersion,
        schema_file: normalizePath(path.relative(rootDir, schemaPath)),
        status: "FAIL",
      });
      continue;
    }

    const schemaBlockers = validateJsonValue(document, schema, schema, artifactPath, "$");
    blockers.push(...schemaBlockers);
    artifacts.push({
      path: artifactPath,
      schema_version: schemaVersion,
      schema_file: normalizePath(path.relative(rootDir, schemaPath)),
      status: schemaBlockers.length === 0 ? "PASS" : "FAIL",
    });
  }

  const failed = artifacts.filter((artifact) => artifact.status === "FAIL").length;
  return {
    schema: REPORT_SCHEMA,
    verdict: blockers.length > 0 ? "BLOCKED" : "PASS",
    root: normalizePath(rootDir),
    artifacts,
    blockers,
    warnings,
    summary: {
      scanned: artifactPaths.length,
      validated: artifacts.filter((artifact) => artifact.status === "PASS").length,
      failed,
    },
  };
}

export function formatShirubeArtifactValidationReport(report: ShirubeArtifactValidationReport): string {
  const lines = [
    "Shirube Artifact Validation",
    `Verdict: ${report.verdict}`,
    `Root: ${report.root}`,
    `Artifacts: ${report.summary.validated}/${report.summary.scanned} valid`,
    "",
    "Artifacts:",
  ];
  if (report.artifacts.length === 0) {
    lines.push("  -");
  } else {
    for (const artifact of report.artifacts) {
      lines.push(`  ${artifact.status} ${artifact.path} (${artifact.schema_version})`);
    }
  }
  lines.push("", "Blockers:");
  appendFindings(lines, report.blockers);
  lines.push("", "Warnings:");
  appendFindings(lines, report.warnings);
  return `${lines.join("\n")}\n`;
}

function discoverShirubeArtifactPaths(rootDir: string): string[] {
  const shirubeDir = path.join(rootDir, ".shirube");
  if (!fs.existsSync(shirubeDir)) return [];
  const discovered: string[] = [];
  walk(shirubeDir, (absolutePath) => {
    if (!/\.ya?ml$/i.test(absolutePath)) return;
    discovered.push(normalizePath(path.relative(rootDir, absolutePath)));
  });
  return discovered.filter(isKnownShirubeArtifactPath).sort();
}

function walk(directory: string, visit: (absolutePath: string) => void): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, visit);
    } else if (entry.isFile()) {
      visit(absolutePath);
    }
  }
}

function isKnownShirubeArtifactPath(artifactPath: string): boolean {
  return KNOWN_ARTIFACT_PATTERNS.some((pattern) => pattern.test(artifactPath));
}

function validateJsonValue(
  value: JsonValue,
  schema: JsonSchema,
  rootSchema: JsonSchema,
  artifactPath: string,
  field: string,
): ShirubeArtifactValidationFinding[] {
  const resolvedSchema = resolveSchema(schema, rootSchema);
  const findings: ShirubeArtifactValidationFinding[] = [];

  if (Object.prototype.hasOwnProperty.call(resolvedSchema, "const") && !jsonEqual(value, resolvedSchema.const)) {
    findings.push({
      code: "schema_const_mismatch",
      path: artifactPath,
      field,
      message: `${field} must equal ${JSON.stringify(resolvedSchema.const)}.`,
    });
  }

  if (resolvedSchema.enum && !resolvedSchema.enum.some((candidate) => jsonEqual(value, candidate))) {
    findings.push({
      code: "schema_enum_mismatch",
      path: artifactPath,
      field,
      message: `${field} must be one of ${resolvedSchema.enum.map((item) => JSON.stringify(item)).join(", ")}.`,
    });
  }

  if (resolvedSchema.type && !matchesJsonSchemaType(value, resolvedSchema.type)) {
    findings.push({
      code: "schema_type_mismatch",
      path: artifactPath,
      field,
      message: `${field} must be ${Array.isArray(resolvedSchema.type) ? resolvedSchema.type.join(" or ") : resolvedSchema.type}.`,
    });
    return findings;
  }

  if (resolvedSchema.type === "string" && typeof value === "string") {
    if (resolvedSchema.minLength !== undefined && value.length < resolvedSchema.minLength) {
      findings.push({
        code: "schema_min_length",
        path: artifactPath,
        field,
        message: `${field} must be at least ${resolvedSchema.minLength} character(s).`,
      });
    }
    if (resolvedSchema.pattern && !new RegExp(resolvedSchema.pattern).test(value)) {
      findings.push({
        code: "schema_pattern_mismatch",
        path: artifactPath,
        field,
        message: `${field} must match ${resolvedSchema.pattern}.`,
      });
    }
  }

  if (resolvedSchema.type === "array" && Array.isArray(value)) {
    if (resolvedSchema.minItems !== undefined && value.length < resolvedSchema.minItems) {
      findings.push({
        code: "schema_min_items",
        path: artifactPath,
        field,
        message: `${field} must contain at least ${resolvedSchema.minItems} item(s).`,
      });
    }
    if (resolvedSchema.items) {
      value.forEach((item, index) => {
        findings.push(...validateJsonValue(item, resolvedSchema.items as JsonSchema, rootSchema, artifactPath, `${field}[${index}]`));
      });
    }
  }

  if (resolvedSchema.type === "object" && isRecord(value)) {
    const required = resolvedSchema.required ?? [];
    for (const requiredKey of required) {
      if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
        findings.push({
          code: "schema_required_missing",
          path: artifactPath,
          field: `${field}.${requiredKey}`,
          message: `${field}.${requiredKey} is required.`,
        });
      }
    }

    const properties = resolvedSchema.properties ?? {};
    if (resolvedSchema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          findings.push({
            code: "schema_additional_property",
            path: artifactPath,
            field: `${field}.${key}`,
            message: `${field}.${key} is not allowed by the schema.`,
          });
        }
      }
    } else if (isRecord(resolvedSchema.additionalProperties)) {
      for (const [key, nestedValue] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          findings.push(...validateJsonValue(
            nestedValue,
            resolvedSchema.additionalProperties as JsonSchema,
            rootSchema,
            artifactPath,
            `${field}.${key}`,
          ));
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        findings.push(...validateJsonValue(value[key], propertySchema, rootSchema, artifactPath, `${field}.${key}`));
      }
    }
  }

  return findings;
}

function resolveSchema(schema: JsonSchema, rootSchema: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema;
  const refMatch = schema.$ref.match(/^#\/\$defs\/(.+)$/);
  if (!refMatch) throw new Error(`Unsupported schema ref: ${schema.$ref}`);
  const resolved = rootSchema.$defs?.[refMatch[1]];
  if (!resolved) throw new Error(`Missing schema ref: ${schema.$ref}`);
  return resolved;
}

function matchesJsonSchemaType(value: JsonValue, type: string | string[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "object") return isRecord(value);
    if (candidate === "null") return value === null;
    return typeof value === candidate;
  });
}

function parseYamlSubset(text: string): JsonValue {
  const lines = text
    .split(/\r?\n/)
    .map((rawLine, index): ParsedYamlLine | null => {
      const withoutTrailingWhitespace = rawLine.replace(/\s+$/, "");
      if (!withoutTrailingWhitespace.trim() || withoutTrailingWhitespace.trimStart().startsWith("#")) return null;
      return {
        indent: withoutTrailingWhitespace.match(/^ */)?.[0].length ?? 0,
        text: withoutTrailingWhitespace.trimStart(),
        lineNumber: index + 1,
      };
    })
    .filter((line): line is ParsedYamlLine => line !== null);
  if (lines.length === 0) return {};
  const [value, nextIndex] = parseYamlBlock(lines, 0, lines[0].indent);
  if (nextIndex < lines.length) {
    throw new Error(`Unexpected YAML content at line ${lines[nextIndex].lineNumber}.`);
  }
  return value;
}

function parseYamlBlock(lines: ParsedYamlLine[], index: number, indent: number): [JsonValue, number] {
  const next = lines[index];
  if (!next || next.indent < indent) return [{}, index];
  if (next.indent !== indent) {
    throw new Error(`Unexpected indentation at line ${next.lineNumber}.`);
  }
  return next.text.startsWith("- ")
    ? parseYamlArray(lines, index, indent)
    : parseYamlObject(lines, index, indent);
}

function parseYamlObject(lines: ParsedYamlLine[], index: number, indent: number): [JsonValue, number] {
  const result: Record<string, JsonValue> = {};
  let cursor = index;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new Error(`Unexpected indentation at line ${line.lineNumber}.`);
    }
    if (line.text.startsWith("- ")) break;
    const match = line.text.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!match) throw new Error(`Unsupported YAML mapping at line ${line.lineNumber}.`);
    const key = match[1];
    const rawValue = match[2] ?? "";
    if (rawValue === ">" || rawValue === "|") {
      const [blockScalar, nextCursor] = parseBlockScalar(lines, cursor + 1, indent, rawValue);
      result[key] = blockScalar;
      cursor = nextCursor;
      continue;
    }
    if (rawValue === "") {
      const next = lines[cursor + 1];
      if (next && next.indent > indent) {
        const [nested, nextCursor] = parseYamlBlock(lines, cursor + 1, next.indent);
        result[key] = nested;
        cursor = nextCursor;
      } else {
        result[key] = null;
        cursor += 1;
      }
      continue;
    }
    result[key] = parseYamlScalar(rawValue);
    cursor += 1;
  }
  return [result, cursor];
}

function parseYamlArray(lines: ParsedYamlLine[], index: number, indent: number): [JsonValue, number] {
  const result: JsonValue[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.indent < indent) break;
    if (line.indent !== indent || !line.text.startsWith("- ")) break;
    const itemText = line.text.slice(2).trim();
    if (!itemText) {
      const next = lines[cursor + 1];
      if (!next || next.indent <= indent) {
        result.push(null);
        cursor += 1;
      } else {
        const [nested, nextCursor] = parseYamlBlock(lines, cursor + 1, next.indent);
        result.push(nested);
        cursor = nextCursor;
      }
      continue;
    }
    const mapMatch = itemText.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (mapMatch) {
      const item: Record<string, JsonValue> = {};
      const key = mapMatch[1];
      const rawValue = mapMatch[2] ?? "";
      if (rawValue === "") {
        const next = lines[cursor + 1];
        if (next && next.indent > indent) {
          const [nested, nextCursor] = parseYamlBlock(lines, cursor + 1, next.indent);
          item[key] = nested;
          cursor = nextCursor;
        } else {
          item[key] = null;
          cursor += 1;
        }
      } else {
        item[key] = parseYamlScalar(rawValue);
        cursor += 1;
      }
      const next = lines[cursor];
      if (next && next.indent > indent) {
        const [rest, nextCursor] = parseYamlObject(lines, cursor, next.indent);
        Object.assign(item, rest);
        cursor = nextCursor;
      }
      result.push(item);
      continue;
    }
    result.push(parseYamlScalar(itemText));
    cursor += 1;
  }
  return [result, cursor];
}

function parseBlockScalar(lines: ParsedYamlLine[], index: number, parentIndent: number, style: string): [string, number] {
  const values: string[] = [];
  let cursor = index;
  while (cursor < lines.length && lines[cursor].indent > parentIndent) {
    values.push(lines[cursor].text);
    cursor += 1;
  }
  return [style === ">" ? values.join(" ") : values.join("\n"), cursor];
}

function parseYamlScalar(rawValue: string): JsonValue {
  const value = stripInlineComment(rawValue.trim());
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseYamlScalar(item.trim()));
  }
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  return value;
}

function stripInlineComment(value: string): string {
  return value.replace(/\s+#.*$/, "").trim();
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appendFindings(lines: string[], findings: ShirubeArtifactValidationFinding[]): void {
  if (findings.length === 0) {
    lines.push("  -");
    return;
  }
  for (const finding of findings) {
    const pathText = finding.path ? ` ${finding.path}` : "";
    const fieldText = finding.field ? ` ${finding.field}` : "";
    lines.push(`  ${finding.code}${pathText}${fieldText}: ${finding.message}`);
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}
