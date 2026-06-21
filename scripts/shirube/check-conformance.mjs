import { buildResult, isMain, parseArgs, readStructuredFile, safeRun, verdictFromFindings } from "./lib.mjs";

export function runConformanceCheck(options = {}) {
  const input = options.fixture
    ? readStructuredFile(options.fixture)
    : {
        repo_spec: readStructuredFile(options["repo-spec"] ?? ".shirube/repo-spec.yaml"),
        matrix: readStructuredFile(options.matrix ?? ".shirube/design-conformance-matrix.json"),
      };
  return evaluateConformance(input);
}

export function evaluateConformance(input) {
  const repoSpec = input.repo_spec ?? {};
  const matrix = Array.isArray(input.matrix) ? input.matrix : input.matrix?.controls ?? [];
  const mapped = new Map(matrix.map((entry) => [entry.control_id, entry]));
  const findings = [];
  const requiredControls = requiredControlIds(repoSpec);

  for (const control of requiredControls) {
    const entry = mapped.get(control);
    if (!entry) {
      findings.push({ severity: "BLOCK", code: "control_unmapped", control_id: control, message: `${control} has no matrix entry.` });
      continue;
    }
    if (!entry.mapped_impl) {
      findings.push({ severity: "BLOCK", code: "control_missing_impl_map", control_id: control, message: `${control} has no mapped_impl reference.` });
    }
    if (!entry.mapped_test) {
      findings.push({ severity: "BLOCK", code: "control_missing_test_map", control_id: control, message: `${control} has no mapped_test reference.` });
    }
    if (Object.prototype.hasOwnProperty.call(entry, "implemented") || Object.prototype.hasOwnProperty.call(entry, "implementation_status")) {
      findings.push({
        severity: "BLOCK",
        code: "meaning_judgment_in_matrix",
        control_id: control,
        message: "Design conformance matrix must record mapping existence only, not implementation status.",
      });
    }
  }

  const verdict = verdictFromFindings(findings);
  return buildResult({
    gate: "design-conformance",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Add control mapping entries with mapped_impl and mapped_test only; do not claim controls are implemented.",
      doc_ref: ".shirube/design-conformance-matrix.json",
    },
    matrix: {
      required_controls: requiredControls,
      mapped_controls: matrix.map((entry) => entry.control_id).filter(Boolean),
    },
  });
}

export function requiredControlIds(repoSpec) {
  const gates = Array.isArray(repoSpec.required_gates) ? repoSpec.required_gates.map((gate) => `gate:${gate}`) : [];
  const soc2 = Array.isArray(repoSpec.soc2_categories) ? repoSpec.soc2_categories.map((category) => `soc2:${category}`) : [];
  const iso = repoSpec.iso42001_applicability === true ? ["iso42001:applicability"] : [];
  return [...new Set([...gates, ...soc2, ...iso])].sort((a, b) => a.localeCompare(b));
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  safeRun(() => runConformanceCheck(options));
}
