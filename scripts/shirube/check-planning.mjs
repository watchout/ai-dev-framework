import { asBoolean, buildResult, isMain, parseArgs, planningFields, present, readStructuredFile, safeRun, verdictFromFindings } from "./lib.mjs";

export function runPlanningCheck(options = {}) {
  const source = options.fixture
    ? readStructuredFile(options.fixture)
    : readStructuredFile(options["planning-file"] ?? options["repo-spec"] ?? ".shirube/repo-spec.yaml");
  return evaluatePlanning(source);
}

export function evaluatePlanning(source) {
  const fields = planningFields(source);
  const findings = [];

  if (asBoolean(fields.premise_required) && !present(fields.premise_ref)) {
    findings.push({
      severity: "BLOCK",
      code: "missing_premise_ref",
      message: "premise_required is true but premise_ref is missing.",
    });
  }

  if (present(fields.premise_ref) && !asBoolean(fields.premise_confirmed) && !present(fields.premise_confirmation_ref)) {
    findings.push({
      severity: "BLOCK",
      code: "missing_premise_confirmation",
      message: "premise_ref exists but premise confirmation evidence is missing.",
    });
  }

  if (asBoolean(fields.inventory_required) && !present(fields.inventory_ref)) {
    findings.push({
      severity: "BLOCK",
      code: "missing_inventory_ref",
      message: "inventory_required is true but inventory_ref is missing.",
    });
  }

  if (present(fields.inventory_ref) && !asBoolean(fields.inventory_confirmed) && !present(fields.inventory_confirmation_ref)) {
    findings.push({
      severity: "BLOCK",
      code: "missing_inventory_confirmation",
      message: "inventory_ref exists but inventory confirmation evidence is missing.",
    });
  }

  if (asBoolean(fields.owner_confirmation_required) && !present(fields.owner_confirmation_ref)) {
    findings.push({
      severity: "WARN",
      code: "missing_owner_confirmation",
      message: "owner_confirmation_required is true but owner_confirmation_ref is missing.",
    });
  }

  const verdict = verdictFromFindings(findings);
  return buildResult({
    gate: "planning",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Add structured premise, inventory, or owner confirmation references before progressing.",
      doc_ref: "docs/standards/shirube-ai-development-governance-standard-v1.md",
    },
    observed: {
      premise_required: asBoolean(fields.premise_required),
      premise_ref: fields.premise_ref ?? null,
      inventory_required: asBoolean(fields.inventory_required),
      inventory_ref: fields.inventory_ref ?? null,
      owner_confirmation_required: asBoolean(fields.owner_confirmation_required),
      owner_confirmation_ref: fields.owner_confirmation_ref ?? null,
    },
  });
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  safeRun(() => runPlanningCheck(options));
}
