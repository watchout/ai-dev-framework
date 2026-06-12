import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isValidProfileType } from "./profile-model.js";
import {
  generateProjectState,
  type ProjectConfig,
  type ProjectStateJsonObject,
} from "./templates.js";

export const DEFAULT_PROJECT_STATE_CONFIG_PATH =
  ".framework/project-state.config.json";
export const DEFAULT_PROJECT_STATE_PATH = ".framework/project.json";

export interface ProjectStateValidationResult {
  ok: boolean;
  configPath: string;
  projectStatePath: string;
  differences: string[];
}

export interface ProjectStateWriteResult {
  configPath: string;
  projectStatePath: string;
  content: string;
}

export function loadProjectStateGeneratorConfig(
  projectDir: string,
  configPath = DEFAULT_PROJECT_STATE_CONFIG_PATH,
): ProjectConfig {
  const resolved = resolveProjectPath(projectDir, configPath);
  const raw = readJson(resolved);
  assertRecord(raw, "project state generator config");

  const projectName = readRequiredString(raw, "projectName");
  const description = readRequiredString(raw, "description");
  const profileType = readOptionalString(raw, "profileType");
  if (profileType !== undefined && !isValidProfileType(profileType)) {
    throw new Error(
      `Invalid profileType in ${configPath}: ${profileType}`,
    );
  }

  const techStack = readOptionalObject(raw, "techStack");
  const projectSettings = readOptionalObject(raw, "projectSettings");

  return {
    projectName,
    description,
    profileType,
    version: readOptionalString(raw, "version"),
    repository: readOptionalString(raw, "repository"),
    createdAt: readOptionalString(raw, "createdAt"),
    updatedAt: readOptionalString(raw, "updatedAt"),
    phase: readOptionalNumber(raw, "phase"),
    status: readOptionalString(raw, "status"),
    techStack,
    projectSettings,
  };
}

export function generateProjectStateFromConfig(
  projectDir: string,
  configPath = DEFAULT_PROJECT_STATE_CONFIG_PATH,
): ProjectStateWriteResult {
  const resolvedConfigPath = resolveProjectPath(projectDir, configPath);
  const config = loadProjectStateGeneratorConfig(projectDir, configPath);
  return {
    configPath: resolvedConfigPath,
    projectStatePath: resolveProjectPath(projectDir, DEFAULT_PROJECT_STATE_PATH),
    content: generateProjectState(config),
  };
}

export function writeGeneratedProjectState(
  projectDir: string,
  configPath = DEFAULT_PROJECT_STATE_CONFIG_PATH,
): ProjectStateWriteResult {
  const result = generateProjectStateFromConfig(projectDir, configPath);
  fs.mkdirSync(path.dirname(result.projectStatePath), { recursive: true });
  fs.writeFileSync(result.projectStatePath, result.content, "utf-8");
  return result;
}

export function validateGeneratedProjectState(
  projectDir: string,
  configPath = DEFAULT_PROJECT_STATE_CONFIG_PATH,
): ProjectStateValidationResult {
  const generated = generateProjectStateFromConfig(projectDir, configPath);
  const actual = readJson(generated.projectStatePath);
  const expected = JSON.parse(generated.content) as unknown;
  const differences = isDeepStrictEqual(actual, expected)
    ? []
    : collectDifferences(actual, expected);

  return {
    ok: differences.length === 0,
    configPath: generated.configPath,
    projectStatePath: generated.projectStatePath,
    differences,
  };
}

export function formatProjectStateValidationResult(
  result: ProjectStateValidationResult,
): string {
  const lines = [
    `Project state drift check: ${result.ok ? "PASS" : "FAIL"}`,
    `Config: ${result.configPath}`,
    `Project state: ${result.projectStatePath}`,
  ];

  if (result.differences.length > 0) {
    lines.push("");
    lines.push("Differences:");
    for (const difference of result.differences) {
      lines.push(`- ${difference}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function resolveProjectPath(projectDir: string, inputPath: string): string {
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.join(projectDir, inputPath);
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read JSON ${filePath}: ${message}`);
  }
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`project state generator config requires string ${key}`);
  }
  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`project state generator config ${key} must be a string`);
  }
  return value;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`project state generator config ${key} must be a number`);
  }
  return value;
}

function readOptionalObject(
  record: Record<string, unknown>,
  key: string,
): ProjectStateJsonObject | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  assertRecord(value, `project state generator config ${key}`);
  return value as ProjectStateJsonObject;
}

function collectDifferences(
  actual: unknown,
  expected: unknown,
  location = "$",
): string[] {
  if (isDeepStrictEqual(actual, expected)) return [];

  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
      return [`${location}: expected ${formatValue(expected)}, got ${formatValue(actual)}`];
    }
    const max = Math.max(actual.length, expected.length);
    const differences: string[] = [];
    for (let index = 0; index < max; index += 1) {
      differences.push(
        ...collectDifferences(actual[index], expected[index], `${location}[${index}]`),
      );
    }
    return differences;
  }

  if (isPlainObject(actual) && isPlainObject(expected)) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    const differences: string[] = [];
    for (const key of [...keys].sort()) {
      differences.push(
        ...collectDifferences(
          actual[key],
          expected[key],
          `${location}.${key}`,
        ),
      );
    }
    return differences;
  }

  return [`${location}: expected ${formatValue(expected)}, got ${formatValue(actual)}`];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === undefined) return "<missing>";
  return JSON.stringify(value);
}
