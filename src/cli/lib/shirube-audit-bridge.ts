import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import {
  buildEvidenceCheck,
  checkArtifactConsistency,
  readRecord,
  type ShirubeGateEvidence,
  type ShirubeGateFinding,
  type ShirubeGateVerdict,
} from "./shirube-artifact-gates.js";

export type AuditBridgeVerdict = ShirubeGateVerdict;

export interface AuditBridgeFixture {
  schema?: "shirube-audit-bridge-fixture/v1";
  audit_record_ref?: string;
  item_set_ref?: string;
  evidence_ref?: string | string[];
  implementation_actor?: string;
  implementation_model?: string;
  expected_head?: string;
  expected_base?: string;
}

export interface AuditBridgeCheckInput {
  auditRecordFile?: string;
  itemSetFile?: string;
  evidenceFiles?: string[];
  expectedHead?: string;
  expectedBase?: string;
  implementationActor?: string;
  implementationModel?: string;
}

export interface AuditBridgeItemFinding extends ShirubeGateFinding {
  item_id?: string;
}

export interface AuditBridgeCheckReport {
  schema: "shirube-audit-bridge-check/v1";
  verdict: AuditBridgeVerdict;
  would_block: boolean;
  admissible: boolean;
  audit_record_ref: string;
  item_set_ref: string;
  missing_item_ids: string[];
  duplicate_item_ids: string[];
  extra_item_ids: string[];
  invalid_items: AuditBridgeItemFinding[];
  fail_items: string[];
  unverified_items: string[];
  maker_checker_valid: boolean;
  schema_valid: boolean;
  evidence_recorded: boolean;
  artifact_consistency: AuditBridgeVerdict;
  required_next_actions: string[];
  blockers: ShirubeGateFinding[];
  warnings: ShirubeGateFinding[];
  evidence: ShirubeGateEvidence[];
}

interface AuditItemResult {
  item_id?: unknown;
  verdict?: unknown;
  reason?: unknown;
  evidence_ref?: unknown;
}

interface AuditItemSetItem {
  item_id?: unknown;
  criterion?: unknown;
  required_evidence?: unknown;
}

const REPORT_SCHEMA = "shirube-audit-bridge-check/v1" as const;
const FIXTURE_SCHEMA = "shirube-audit-bridge-fixture/v1" as const;
const AUDIT_SCHEMA_VERSION = "shirube-audit/v1";
const AUDIT_RECORD_TYPE = "audit_record";
const AUDIT_ITEM_SET_TYPE = "audit_item_set";
const REAL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const AUDIT_ID_PATTERN = /^AUDIT-[A-Z0-9-]+$/;
const ITEM_SET_ID_PATTERN = /^AUDIT-ITEM-SET-[A-Z0-9-]+$/;
const NON_DURABLE_EVIDENCE_PATTERN = /^<[^>]+>$|placeholder|pending|\btbd\b|^n\/a$/i;

const VALID_STAGES = new Set(["stage-3", "stage-6", "stage-9", "bridge"]);
const VALID_AUDIT_TYPES = new Set([
  "spec-audit",
  "impl-audit",
  "trace-audit",
  "conformance-audit",
  "bridge-admissibility",
]);
const VALID_AGGREGATE_VERDICTS = new Set(["PASS", "PASS_WITH_WARN", "BLOCKED", "FAIL"]);
const VALID_ITEM_VERDICTS = new Set(["PASS", "FAIL", "N/A", "UNVERIFIED"]);

const AUDIT_RECORD_REQUIRED_FIELDS = [
  "schema_version",
  "document_type",
  "audit_id",
  "audit_type",
  "stage",
  "reviewer_actor",
  "reviewer_model",
  "target_head",
  "target_refs",
  "item_set_ref",
  "matched_items",
  "missing_items",
  "extra_items",
  "conflicting_items",
  "items",
  "aggregate_verdict",
];

const AUDIT_RECORD_ALLOWED_FIELDS = new Set(AUDIT_RECORD_REQUIRED_FIELDS);
const AUDIT_ITEM_RESULT_REQUIRED_FIELDS = ["item_id", "verdict", "reason", "evidence_ref"];
const AUDIT_ITEM_RESULT_ALLOWED_FIELDS = new Set(AUDIT_ITEM_RESULT_REQUIRED_FIELDS);
const AUDIT_ITEM_SET_REQUIRED_FIELDS = [
  "schema_version",
  "document_type",
  "item_set_id",
  "stage",
  "items",
];
const AUDIT_ITEM_SET_ALLOWED_FIELDS = new Set(AUDIT_ITEM_SET_REQUIRED_FIELDS);
const AUDIT_ITEM_SET_ITEM_REQUIRED_FIELDS = ["item_id", "criterion", "required_evidence"];
const AUDIT_ITEM_SET_ITEM_ALLOWED_FIELDS = new Set(AUDIT_ITEM_SET_ITEM_REQUIRED_FIELDS);

export function resolveAuditBridgeInputFromFixture(
  fixture: string,
  overrides: Partial<AuditBridgeCheckInput> = {},
): AuditBridgeCheckInput {
  const fixtureRecord = readRecord(fixture);
  if (fixtureRecord.schema !== FIXTURE_SCHEMA && fixtureRecord.audit_record_ref === undefined) {
    return {
      ...overrides,
      auditRecordFile: overrides.auditRecordFile ?? fixture,
    };
  }

  const bridgeFixture = fixtureRecord as AuditBridgeFixture;
  const fixtureRoot = dirname(fixture);
  const evidenceFiles = normalizeStringArray(bridgeFixture.evidence_ref)
    .map((entry) => resolveRelativePath(fixtureRoot, entry));

  return {
    auditRecordFile: overrides.auditRecordFile ??
      resolveOptionalRelativePath(fixtureRoot, bridgeFixture.audit_record_ref),
    itemSetFile: overrides.itemSetFile ??
      resolveOptionalRelativePath(fixtureRoot, bridgeFixture.item_set_ref),
    evidenceFiles: overrides.evidenceFiles ?? evidenceFiles,
    expectedHead: overrides.expectedHead ?? bridgeFixture.expected_head,
    expectedBase: overrides.expectedBase ?? bridgeFixture.expected_base,
    implementationActor: overrides.implementationActor ?? bridgeFixture.implementation_actor,
    implementationModel: overrides.implementationModel ?? bridgeFixture.implementation_model,
  };
}

export function buildAuditBridgeCheck(input: AuditBridgeCheckInput): AuditBridgeCheckReport {
  const blockers: ShirubeGateFinding[] = [];
  const warnings: ShirubeGateFinding[] = [];
  const evidence: ShirubeGateEvidence[] = [];
  const invalidItems: AuditBridgeItemFinding[] = [];
  const missingItemIds: string[] = [];
  const duplicateItemIds: string[] = [];
  const extraItemIds: string[] = [];
  const failItems: string[] = [];
  const unverifiedItems: string[] = [];
  let schemaValid = true;
  let makerCheckerValid = true;
  let evidenceRecorded = false;
  let artifactConsistency: AuditBridgeVerdict = "PASS";

  if (!input.auditRecordFile) {
    blockers.push({
      code: "missing_audit_record",
      message: "Audit bridge check requires an audit record fixture or artifact path.",
    });
    return finalizeReport({
      auditRecordRef: "<missing>",
      itemSetRef: input.itemSetFile ?? "<missing>",
      blockers,
      warnings,
      evidence,
      missingItemIds,
      duplicateItemIds,
      extraItemIds,
      invalidItems,
      failItems,
      unverifiedItems,
      makerCheckerValid: false,
      schemaValid: false,
      evidenceRecorded,
      artifactConsistency: "BLOCKED",
    });
  }

  const auditRecord = readRecord(input.auditRecordFile);
  evidence.push({
    code: "audit_record",
    source: "file",
    detail: input.auditRecordFile,
    path: input.auditRecordFile,
  });

  const auditRecordSchemaFindings = validateAuditRecord(auditRecord, input.auditRecordFile, invalidItems);
  schemaValid = auditRecordSchemaFindings.length === 0;
  blockers.push(...auditRecordSchemaFindings);

  const itemSetRef = input.itemSetFile ??
    resolveReferencedPath(input.auditRecordFile, stringField(auditRecord, "item_set_ref")) ??
    stringField(auditRecord, "item_set_ref") ??
    "<missing>";

  let itemSet: Record<string, unknown> | undefined;
  if (itemSetRef === "<missing>") {
    schemaValid = false;
    blockers.push({
      code: "missing_item_set_ref",
      message: "Audit record must reference an audit item set.",
      path: input.auditRecordFile,
      field: "item_set_ref",
    });
  } else if (!existsSync(itemSetRef)) {
    schemaValid = false;
    blockers.push({
      code: "missing_item_set_artifact",
      message: `Referenced audit item set was not found: ${itemSetRef}.`,
      path: itemSetRef,
    });
  } else {
    itemSet = readRecord(itemSetRef);
    evidence.push({
      code: "audit_item_set",
      source: "file",
      detail: itemSetRef,
      path: itemSetRef,
    });
    const itemSetFindings = validateAuditItemSet(itemSet, itemSetRef, invalidItems);
    if (itemSetFindings.length > 0) schemaValid = false;
    blockers.push(...itemSetFindings);
  }

  if (itemSet) {
    const recordStage = stringField(auditRecord, "stage");
    const itemSetStage = stringField(itemSet, "stage");
    if (recordStage && itemSetStage && recordStage !== itemSetStage) {
      blockers.push({
        code: "audit_stage_mismatch",
        message: `Audit record stage ${recordStage} does not match item set stage ${itemSetStage}.`,
        path: input.auditRecordFile,
        field: "stage",
      });
    }

    reconcileAuditItems({
      auditRecord,
      itemSet,
      recordPath: input.auditRecordFile,
      blockers,
      invalidItems,
      missingItemIds,
      duplicateItemIds,
      extraItemIds,
      failItems,
      unverifiedItems,
    });
  }

  const makerCheckerFindings = validateMakerChecker(auditRecord, input);
  makerCheckerValid = makerCheckerFindings.length === 0;
  blockers.push(...makerCheckerFindings);

  const targetHead = stringField(auditRecord, "target_head");
  const consistencyRecord = targetHead ? { ...auditRecord, commit_sha: targetHead } : auditRecord;
  const consistencyFindings = checkArtifactConsistency(consistencyRecord, {
    path: input.auditRecordFile,
    expectedHead: input.expectedHead,
  });
  if (consistencyFindings.length > 0) artifactConsistency = combineVerdicts(artifactConsistency, "BLOCKED");
  blockers.push(...consistencyFindings);

  const evidenceFiles = input.evidenceFiles ?? [];
  if (evidenceFiles.length > 0) {
    const evidenceReport = buildEvidenceCheck({
      files: evidenceFiles,
      expectedHead: input.expectedHead,
      expectedBase: input.expectedBase,
    });
    artifactConsistency = combineVerdicts(artifactConsistency, evidenceReport.verdict);
    evidenceRecorded = evidenceReport.verdict === "PASS" || evidenceReport.verdict === "PASS_WITH_WARN";
    blockers.push(...prefixFindings(evidenceReport.blockers, "evidence_artifact"));
    warnings.push(...prefixFindings(evidenceReport.warnings, "evidence_artifact"));
    evidence.push(...evidenceReport.evidence);
  }

  if (!evidenceRecorded) {
    evidenceRecorded = auditItems(auditRecord).some((item) => evidenceRefs(item).some(isDurableEvidenceRef));
  }

  if (blockers.length > 0) {
    artifactConsistency = combineVerdicts(artifactConsistency, "BLOCKED");
  }

  return finalizeReport({
    auditRecordRef: input.auditRecordFile,
    itemSetRef,
    blockers: uniqueFindings(blockers),
    warnings: uniqueFindings(warnings),
    evidence: uniqueEvidence(evidence),
    missingItemIds: uniqueSorted(missingItemIds),
    duplicateItemIds: uniqueSorted(duplicateItemIds),
    extraItemIds: uniqueSorted(extraItemIds),
    invalidItems: uniqueItemFindings(invalidItems),
    failItems: uniqueSorted(failItems),
    unverifiedItems: uniqueSorted(unverifiedItems),
    makerCheckerValid,
    schemaValid,
    evidenceRecorded,
    artifactConsistency,
  });
}

export function buildAuditBridgeFailureReport(message: string): AuditBridgeCheckReport {
  return finalizeReport({
    auditRecordRef: "<unavailable>",
    itemSetRef: "<unavailable>",
    blockers: [],
    warnings: [{ code: "bridge_execution_failure", message }],
    evidence: [],
    missingItemIds: [],
    duplicateItemIds: [],
    extraItemIds: [],
    invalidItems: [],
    failItems: [],
    unverifiedItems: [],
    makerCheckerValid: false,
    schemaValid: false,
    evidenceRecorded: false,
    artifactConsistency: "FAILURE",
    forcedVerdict: "FAILURE",
  });
}

function validateAuditRecord(
  record: Record<string, unknown>,
  path: string,
  invalidItems: AuditBridgeItemFinding[],
): ShirubeGateFinding[] {
  const findings: ShirubeGateFinding[] = [];
  requireFields(record, path, AUDIT_RECORD_REQUIRED_FIELDS, findings);
  rejectAdditionalFields(record, path, AUDIT_RECORD_ALLOWED_FIELDS, findings);

  requireConst(record, path, "schema_version", AUDIT_SCHEMA_VERSION, findings);
  requireConst(record, path, "document_type", AUDIT_RECORD_TYPE, findings);
  requirePattern(record, path, "audit_id", AUDIT_ID_PATTERN, findings);
  requireEnum(record, path, "audit_type", VALID_AUDIT_TYPES, findings);
  requireEnum(record, path, "stage", VALID_STAGES, findings);
  requireString(record, path, "reviewer_actor", findings);
  requireString(record, path, "reviewer_model", findings);
  requirePattern(record, path, "target_head", REAL_SHA_PATTERN, findings);
  requireStringArray(record, path, "target_refs", findings, { minItems: 1 });
  requireString(record, path, "item_set_ref", findings);
  for (const field of ["matched_items", "missing_items", "extra_items", "conflicting_items"]) {
    requireArray(record, path, field, findings);
  }
  requireEnum(record, path, "aggregate_verdict", VALID_AGGREGATE_VERDICTS, findings);

  const items = record.items;
  if (!Array.isArray(items) || items.length === 0) {
    findings.push({
      code: "invalid_audit_record_schema",
      message: "Audit record items must be a non-empty array.",
      path,
      field: "items",
    });
    return findings;
  }

  items.forEach((item, index) => {
    const itemPath = `items.${index}`;
    if (!isRecord(item)) {
      const finding = itemFinding("invalid_audit_item_result", "Audit item result must be an object.", path, itemPath);
      invalidItems.push(finding);
      findings.push(finding);
      return;
    }
    const itemId = stringField(item, "item_id");
    const itemFindings = validateAuditItemResult(item, path, itemPath, itemId);
    invalidItems.push(...itemFindings);
    findings.push(...itemFindings);
  });

  for (const field of ["missing_items", "extra_items", "conflicting_items"]) {
    const values = record[field];
    if (Array.isArray(values) && values.length > 0) {
      findings.push({
        code: `record_declares_${field}`,
        message: `Audit record declares ${field}; Bridge admissibility requires unresolved reconciliation lists to be empty.`,
        path,
        field,
      });
    }
  }

  return findings;
}

function validateAuditItemResult(
  item: Record<string, unknown>,
  path: string,
  itemPath: string,
  itemId?: string,
): AuditBridgeItemFinding[] {
  const findings: AuditBridgeItemFinding[] = [];
  requireItemFields(item, path, itemPath, itemId, AUDIT_ITEM_RESULT_REQUIRED_FIELDS, findings);
  rejectAdditionalItemFields(item, path, itemPath, itemId, AUDIT_ITEM_RESULT_ALLOWED_FIELDS, findings);
  if (!presentString(itemId)) {
    findings.push(itemFinding("invalid_audit_item_id", "Audit item result item_id must be a non-empty string.", path, `${itemPath}.item_id`, itemId));
  }
  if (!VALID_ITEM_VERDICTS.has(String(item.verdict))) {
    findings.push(itemFinding("invalid_audit_item_verdict", "Audit item result verdict is not allowed.", path, `${itemPath}.verdict`, itemId));
  }
  if (!presentString(stringField(item, "reason"))) {
    findings.push(itemFinding("invalid_audit_item_reason", "Audit item result reason must be a non-empty string.", path, `${itemPath}.reason`, itemId));
  }
  if (!Array.isArray(item.evidence_ref)) {
    findings.push(itemFinding("invalid_audit_item_evidence_ref", "Audit item result evidence_ref must be an array.", path, `${itemPath}.evidence_ref`, itemId));
  } else {
    item.evidence_ref.forEach((entry, index) => {
      if (!presentString(typeof entry === "string" ? entry : undefined)) {
        findings.push(itemFinding("invalid_audit_item_evidence_ref", "Audit item result evidence_ref entries must be non-empty strings.", path, `${itemPath}.evidence_ref.${index}`, itemId));
      }
    });
  }
  if (item.verdict === "FAIL" && evidenceRefs(item).length === 0) {
    findings.push(itemFinding("missing_fail_evidence_ref", "FAIL audit items require durable evidence_ref.", path, `${itemPath}.evidence_ref`, itemId));
  }
  return findings;
}

function validateAuditItemSet(
  itemSet: Record<string, unknown>,
  path: string,
  invalidItems: AuditBridgeItemFinding[],
): ShirubeGateFinding[] {
  const findings: ShirubeGateFinding[] = [];
  requireFields(itemSet, path, AUDIT_ITEM_SET_REQUIRED_FIELDS, findings);
  rejectAdditionalFields(itemSet, path, AUDIT_ITEM_SET_ALLOWED_FIELDS, findings);
  requireConst(itemSet, path, "schema_version", AUDIT_SCHEMA_VERSION, findings);
  requireConst(itemSet, path, "document_type", AUDIT_ITEM_SET_TYPE, findings);
  requirePattern(itemSet, path, "item_set_id", ITEM_SET_ID_PATTERN, findings);
  requireEnum(itemSet, path, "stage", VALID_STAGES, findings);

  const items = itemSet.items;
  if (!Array.isArray(items) || items.length === 0) {
    findings.push({
      code: "invalid_audit_item_set_schema",
      message: "Audit item set items must be a non-empty array.",
      path,
      field: "items",
    });
    return findings;
  }

  const itemIds: string[] = [];
  items.forEach((item, index) => {
    const itemPath = `items.${index}`;
    if (!isRecord(item)) {
      const finding = itemFinding("invalid_audit_item_set_item", "Audit item set item must be an object.", path, itemPath);
      invalidItems.push(finding);
      findings.push(finding);
      return;
    }
    const itemId = stringField(item, "item_id");
    itemIds.push(itemId ?? "");
    const itemFindings = validateAuditItemSetItem(item, path, itemPath, itemId);
    invalidItems.push(...itemFindings);
    findings.push(...itemFindings);
  });

  for (const itemId of duplicateValues(itemIds.filter(Boolean))) {
    const finding = itemFinding("duplicate_required_item_id", `Audit item set declares ${itemId} more than once.`, path, "items", itemId);
    invalidItems.push(finding);
    findings.push(finding);
  }

  return findings;
}

function validateAuditItemSetItem(
  item: Record<string, unknown>,
  path: string,
  itemPath: string,
  itemId?: string,
): AuditBridgeItemFinding[] {
  const findings: AuditBridgeItemFinding[] = [];
  requireItemFields(item, path, itemPath, itemId, AUDIT_ITEM_SET_ITEM_REQUIRED_FIELDS, findings);
  rejectAdditionalItemFields(item, path, itemPath, itemId, AUDIT_ITEM_SET_ITEM_ALLOWED_FIELDS, findings);
  if (!presentString(itemId)) {
    findings.push(itemFinding("invalid_audit_item_id", "Audit item set item_id must be a non-empty string.", path, `${itemPath}.item_id`, itemId));
  }
  if (!presentString(stringField(item, "criterion"))) {
    findings.push(itemFinding("invalid_audit_item_criterion", "Audit item set criterion must be a non-empty string.", path, `${itemPath}.criterion`, itemId));
  }
  requireStringArray(item, path, `${itemPath}.required_evidence`, findings, { value: item.required_evidence, minItems: 1 });
  return findings;
}

function reconcileAuditItems(input: {
  auditRecord: Record<string, unknown>;
  itemSet: Record<string, unknown>;
  recordPath: string;
  blockers: ShirubeGateFinding[];
  invalidItems: AuditBridgeItemFinding[];
  missingItemIds: string[];
  duplicateItemIds: string[];
  extraItemIds: string[];
  failItems: string[];
  unverifiedItems: string[];
}): void {
  const requiredIds = auditItemSetItems(input.itemSet)
    .map((item) => stringField(item, "item_id"))
    .filter(presentString);
  const requiredIdSet = new Set(requiredIds);
  const resultItems = auditItems(input.auditRecord);
  const resultIds = resultItems.map((item) => stringField(item, "item_id")).filter(presentString);
  const resultIdSet = new Set(resultIds);

  for (const requiredId of requiredIds) {
    if (!resultIdSet.has(requiredId)) {
      input.missingItemIds.push(requiredId);
      input.blockers.push({
        code: "missing_required_item",
        message: `Required audit item ${requiredId} was not answered.`,
        path: input.recordPath,
        field: "items",
      });
    }
  }

  for (const duplicateId of duplicateValues(resultIds)) {
    input.duplicateItemIds.push(duplicateId);
    input.blockers.push({
      code: "duplicate_item_result",
      message: `Audit item ${duplicateId} was answered more than once.`,
      path: input.recordPath,
      field: "items",
    });
  }

  for (const resultId of resultIds) {
    if (!requiredIdSet.has(resultId)) {
      input.extraItemIds.push(resultId);
      input.blockers.push({
        code: "extra_item_result",
        message: `Audit item ${resultId} is not declared by the referenced item set.`,
        path: input.recordPath,
        field: "items",
      });
    }
  }

  resultItems.forEach((item, index) => {
    const itemId = stringField(item, "item_id") ?? `<items.${index}>`;
    const verdict = stringField(item, "verdict");
    const refs = evidenceRefs(item);
    const nonDurableRefs = refs.filter((ref) => !isDurableEvidenceRef(ref));

    if (verdict === "FAIL") {
      input.failItems.push(itemId);
      if (refs.length === 0) {
        const finding = itemFinding("missing_fail_evidence_ref", `FAIL audit item ${itemId} has no evidence_ref.`, input.recordPath, `items.${index}.evidence_ref`, itemId);
        input.invalidItems.push(finding);
        input.blockers.push(finding);
      }
    }

    if (nonDurableRefs.length > 0) {
      const finding = itemFinding("non_durable_evidence_ref", `Audit item ${itemId} uses placeholder or pending evidence_ref.`, input.recordPath, `items.${index}.evidence_ref`, itemId);
      input.invalidItems.push(finding);
      input.blockers.push(finding);
      if (verdict === "FAIL") input.failItems.push(itemId);
    }

    if (verdict === "UNVERIFIED") {
      input.unverifiedItems.push(itemId);
      input.blockers.push({
        code: "unverified_item",
        message: `Audit item ${itemId} is UNVERIFIED and has no admissible waiver policy in B3.`,
        path: input.recordPath,
        field: `items.${index}.verdict`,
      });
    }
  });
}

function validateMakerChecker(
  auditRecord: Record<string, unknown>,
  input: AuditBridgeCheckInput,
): ShirubeGateFinding[] {
  const findings: ShirubeGateFinding[] = [];
  const reviewerActor = stringField(auditRecord, "reviewer_actor");
  const reviewerModel = stringField(auditRecord, "reviewer_model");

  if (!presentString(input.implementationActor)) {
    findings.push({
      code: "missing_implementation_actor",
      message: "Audit bridge maker/checker validation requires implementation actor evidence.",
      field: "implementation_actor",
    });
  } else if (reviewerActor && reviewerActor === input.implementationActor) {
    findings.push({
      code: "maker_checker_violation",
      message: "reviewer_actor must differ from implementation_actor.",
      field: "reviewer_actor",
    });
  }

  if (!presentString(input.implementationModel)) {
    findings.push({
      code: "missing_implementation_model",
      message: "Audit bridge maker/checker validation requires implementation model evidence.",
      field: "implementation_model",
    });
  } else if (reviewerModel && reviewerModel === input.implementationModel) {
    findings.push({
      code: "maker_checker_violation",
      message: "reviewer_model must differ from implementation_model.",
      field: "reviewer_model",
    });
  }

  return findings;
}

function finalizeReport(input: {
  auditRecordRef: string;
  itemSetRef: string;
  missingItemIds: string[];
  duplicateItemIds: string[];
  extraItemIds: string[];
  invalidItems: AuditBridgeItemFinding[];
  failItems: string[];
  unverifiedItems: string[];
  makerCheckerValid: boolean;
  schemaValid: boolean;
  evidenceRecorded: boolean;
  artifactConsistency: AuditBridgeVerdict;
  blockers: ShirubeGateFinding[];
  warnings: ShirubeGateFinding[];
  evidence: ShirubeGateEvidence[];
  forcedVerdict?: AuditBridgeVerdict;
}): AuditBridgeCheckReport {
  const blockers = uniqueFindings(input.blockers);
  const warnings = uniqueFindings(input.warnings);
  const verdict = input.forcedVerdict ??
    (blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS");
  return {
    schema: REPORT_SCHEMA,
    verdict,
    would_block: verdict === "BLOCKED",
    admissible: verdict === "PASS" || verdict === "PASS_WITH_WARN",
    audit_record_ref: input.auditRecordRef,
    item_set_ref: input.itemSetRef,
    missing_item_ids: uniqueSorted(input.missingItemIds),
    duplicate_item_ids: uniqueSorted(input.duplicateItemIds),
    extra_item_ids: uniqueSorted(input.extraItemIds),
    invalid_items: uniqueItemFindings(input.invalidItems),
    fail_items: uniqueSorted(input.failItems),
    unverified_items: uniqueSorted(input.unverifiedItems),
    maker_checker_valid: input.makerCheckerValid,
    schema_valid: input.schemaValid,
    evidence_recorded: input.evidenceRecorded,
    artifact_consistency: input.artifactConsistency,
    required_next_actions: requiredNextActions(blockers),
    blockers,
    warnings,
    evidence: uniqueEvidence(input.evidence),
  };
}

function requiredNextActions(blockers: ShirubeGateFinding[]): string[] {
  const actions = new Set<string>();
  for (const blocker of blockers) {
    if (blocker.code.includes("missing_required_item")) actions.add("Answer every required audit item exactly once.");
    else if (blocker.code.includes("duplicate_item")) actions.add("Remove duplicate audit item results.");
    else if (blocker.code.includes("extra_item")) actions.add("Remove or classify unknown audit item IDs before Bridge admissibility.");
    else if (blocker.code.includes("evidence")) actions.add("Replace missing, pending, or placeholder evidence with durable evidence references.");
    else if (blocker.code.includes("maker_checker")) actions.add("Use a reviewer actor/model distinct from the implementation actor/model.");
    else if (blocker.code.includes("head_mismatch")) actions.add("Regenerate evidence at the exact reviewed head.");
    else if (blocker.code.includes("schema") || blocker.code.includes("invalid")) actions.add("Fix the structured audit record and item set to match shirube-audit/v1.");
    else actions.add("Resolve Bridge admissibility blocker: " + blocker.code);
  }
  return Array.from(actions).sort((left, right) => left.localeCompare(right));
}

function requireFields(
  record: Record<string, unknown>,
  path: string,
  fields: string[],
  findings: ShirubeGateFinding[],
): void {
  for (const field of fields) {
    if (!fieldExists(record, field)) {
      findings.push({
        code: "missing_required_field",
        message: `${field} is required.`,
        path,
        field,
      });
    }
  }
}

function requireItemFields(
  record: Record<string, unknown>,
  path: string,
  itemPath: string,
  itemId: string | undefined,
  fields: string[],
  findings: AuditBridgeItemFinding[],
): void {
  for (const field of fields) {
    if (!fieldExists(record, field)) {
      findings.push(itemFinding("missing_required_field", `${field} is required.`, path, `${itemPath}.${field}`, itemId));
    }
  }
}

function rejectAdditionalFields(
  record: Record<string, unknown>,
  path: string,
  allowedFields: Set<string>,
  findings: ShirubeGateFinding[],
): void {
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field)) {
      findings.push({
        code: "unknown_schema_field",
        message: `${field} is not allowed by shirube-audit/v1.`,
        path,
        field,
      });
    }
  }
}

function rejectAdditionalItemFields(
  record: Record<string, unknown>,
  path: string,
  itemPath: string,
  itemId: string | undefined,
  allowedFields: Set<string>,
  findings: AuditBridgeItemFinding[],
): void {
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field)) {
      findings.push(itemFinding("unknown_schema_field", `${field} is not allowed by shirube-audit/v1.`, path, `${itemPath}.${field}`, itemId));
    }
  }
}

function requireConst(
  record: Record<string, unknown>,
  path: string,
  field: string,
  expected: string,
  findings: ShirubeGateFinding[],
): void {
  const value = stringField(record, field);
  if (value !== undefined && value !== expected) {
    findings.push({
      code: "invalid_schema_const",
      message: `${field} must be ${expected}.`,
      path,
      field,
    });
  }
}

function requirePattern(
  record: Record<string, unknown>,
  path: string,
  field: string,
  pattern: RegExp,
  findings: ShirubeGateFinding[],
): void {
  const value = stringField(record, field);
  if (value !== undefined && !pattern.test(value)) {
    findings.push({
      code: "invalid_schema_pattern",
      message: `${field} has invalid format.`,
      path,
      field,
    });
  }
}

function requireEnum(
  record: Record<string, unknown>,
  path: string,
  field: string,
  values: Set<string>,
  findings: ShirubeGateFinding[],
): void {
  const value = stringField(record, field);
  if (value !== undefined && !values.has(value)) {
    findings.push({
      code: "invalid_schema_enum",
      message: `${field} has invalid value.`,
      path,
      field,
    });
  }
}

function requireString(
  record: Record<string, unknown>,
  path: string,
  field: string,
  findings: ShirubeGateFinding[],
): void {
  if (record[field] !== undefined && !presentString(stringField(record, field))) {
    findings.push({
      code: "invalid_schema_string",
      message: `${field} must be a non-empty string.`,
      path,
      field,
    });
  }
}

function requireArray(
  record: Record<string, unknown>,
  path: string,
  field: string,
  findings: ShirubeGateFinding[],
): void {
  if (record[field] !== undefined && !Array.isArray(record[field])) {
    findings.push({
      code: "invalid_schema_array",
      message: `${field} must be an array.`,
      path,
      field,
    });
  }
}

function requireStringArray(
  record: Record<string, unknown>,
  path: string,
  field: string,
  findings: ShirubeGateFinding[],
  options: { value?: unknown; minItems?: number } = {},
): void {
  const value = options.value ?? record[field];
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    findings.push({
      code: "invalid_schema_array",
      message: `${field} must be an array.`,
      path,
      field,
    });
    return;
  }
  if (options.minItems && value.length < options.minItems) {
    findings.push({
      code: "invalid_schema_array",
      message: `${field} must contain at least ${options.minItems} item(s).`,
      path,
      field,
    });
  }
  value.forEach((entry, index) => {
    if (!presentString(typeof entry === "string" ? entry : undefined)) {
      findings.push({
        code: "invalid_schema_string",
        message: `${field} entries must be non-empty strings.`,
        path,
        field: `${field}.${index}`,
      });
    }
  });
}

function auditItems(record: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(record.items) ? record.items.filter(isRecord) : [];
}

function auditItemSetItems(record: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(record.items) ? record.items.filter(isRecord) : [];
}

function evidenceRefs(item: Record<string, unknown>): string[] {
  return normalizeStringArray(item.evidence_ref);
}

function isDurableEvidenceRef(value: string): boolean {
  return presentString(value) && !NON_DURABLE_EVIDENCE_PATTERN.test(value.trim());
}

function resolveReferencedPath(auditRecordFile: string, itemSetRef?: string): string | undefined {
  if (!itemSetRef) return undefined;
  const candidates = [
    itemSetRef,
    join(dirname(auditRecordFile), itemSetRef),
    join(process.cwd(), itemSetRef),
  ].map((candidate) => normalize(candidate));
  return candidates.find((candidate) => existsSync(candidate));
}

function resolveOptionalRelativePath(root: string, value?: string): string | undefined {
  return value ? resolveRelativePath(root, value) : undefined;
}

function resolveRelativePath(root: string, value: string): string {
  if (isAbsolute(value)) return normalize(value);
  return normalize(join(root, value));
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function itemFinding(
  code: string,
  message: string,
  path: string,
  field: string,
  itemId?: string,
): AuditBridgeItemFinding {
  return {
    code,
    message,
    path,
    field,
    item_id: itemId,
  };
}

function prefixFindings(findings: ShirubeGateFinding[], prefix: string): ShirubeGateFinding[] {
  return findings.map((finding) => ({
    ...finding,
    code: `${prefix}_${finding.code}`,
  }));
}

function combineVerdicts(left: AuditBridgeVerdict, right: AuditBridgeVerdict): AuditBridgeVerdict {
  if (left === "FAILURE" || right === "FAILURE") return "FAILURE";
  if (left === "BLOCKED" || right === "BLOCKED") return "BLOCKED";
  if (left === "PASS_WITH_WARN" || right === "PASS_WITH_WARN") return "PASS_WITH_WARN";
  return "PASS";
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates).sort((left, right) => left.localeCompare(right));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function uniqueFindings(findings: ShirubeGateFinding[]): ShirubeGateFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\0${finding.path ?? ""}\0${finding.field ?? ""}\0${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueItemFindings(findings: AuditBridgeItemFinding[]): AuditBridgeItemFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\0${finding.path ?? ""}\0${finding.field ?? ""}\0${finding.item_id ?? ""}\0${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueEvidence(evidence: ShirubeGateEvidence[]): ShirubeGateEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.code}\0${item.source}\0${item.detail}\0${item.path ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" ? value : undefined;
}

function fieldExists(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field) && record[field] !== null;
}

function presentString(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
