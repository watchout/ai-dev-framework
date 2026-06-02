export type WorkOrderRiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
export type WorkOrderLane = "Fast" | "Governed" | "Stop";

export interface WorkOrderDeliveryDefaults {
  profileId: string;
  riskClass: WorkOrderRiskClass;
  lane: WorkOrderLane;
  deliveryStrategy: string;
  runnerPolicy: string;
  auditTiming: string;
  prMode: string;
  inherited: {
    lane: boolean;
    deliveryStrategy: boolean;
    runnerPolicy: boolean;
    auditTiming: boolean;
    prMode: boolean;
  };
}

export interface WorkOrderDeliveryResolution {
  defaults: WorkOrderDeliveryDefaults | null;
  gaps: string[];
}

type JsonObject = Record<string, unknown>;

const RISK_CLASSES = ["R0", "R1", "R2", "R3", "R4"] as const;
const RISK_TO_LANE: Record<WorkOrderRiskClass, WorkOrderLane> = {
  R0: "Fast",
  R1: "Fast",
  R2: "Fast",
  R3: "Governed",
  R4: "Stop",
};

const REQUIRED_OWNER_FIELDS = [
  "architecture_owner",
  "implementation_owner",
  "review_owner",
  "audit_owner",
  "merge_authority",
] as const;

const REQUIRED_ENVELOPE_FIELDS = [
  "work_unit",
  "scope",
  "non_goals",
  "allowed_files",
  "allowed_actions",
  "forbidden_actions",
  "verification_commands",
  "stop_conditions",
  "fallback_next_work_policy",
] as const;

const EMPTY_VALUE =
  /^(?:tbd|todo|pending|unknown|not\s+applicable|n\/a|na|none|null|-)(?:[\s.。,:;_-]|$)/i;

export function resolveWorkOrderDeliveryDefaults(
  profile: Record<string, unknown> | null,
  workOrder: Record<string, unknown>,
): WorkOrderDeliveryResolution {
  const gaps: string[] = [];

  for (const field of REQUIRED_OWNER_FIELDS) {
    if (!hasConcreteKey(workOrder, [field, toCamelCase(field)])) {
      gaps.push(`owner:${field}`);
    }
  }

  for (const field of REQUIRED_ENVELOPE_FIELDS) {
    if (!hasConcreteKey(workOrder, [field, toCamelCase(field)])) {
      gaps.push(`envelope:${field}`);
    }
  }

  if (!profile) {
    gaps.push("delivery_profile");
    return { defaults: null, gaps };
  }

  const profileId = stringValue(findValue(profile, ["profile_id", "profileId"]));
  if (!profileId) {
    gaps.push("delivery_profile.profile_id");
  }

  const declaredProfileRef = stringValue(
    findValue(workOrder, ["delivery_profile_ref", "delivery_profile", "profile_id"]),
  );
  if (declaredProfileRef && profileId && declaredProfileRef !== profileId) {
    gaps.push(`delivery_profile_ref:${declaredProfileRef}!=${profileId}`);
  }

  const riskClass = normalizeRiskClass(
    findValue(workOrder, ["risk_class", "risk", "riskClass"]),
  );
  if (!riskClass) {
    gaps.push("risk_class");
    return { defaults: null, gaps };
  }

  const strategyByRisk = objectValue(findValue(profile, ["strategy_by_risk", "strategyByRisk"]));
  if (!strategyByRisk) {
    gaps.push("delivery_profile.strategy_by_risk");
    return { defaults: null, gaps };
  }

  const riskDefaults = objectValue(strategyByRisk[riskClass]);
  if (!riskDefaults) {
    gaps.push(`delivery_profile.strategy_by_risk.${riskClass}`);
    return { defaults: null, gaps };
  }

  const profileDeliveryStrategy = stringValue(
    findValue(riskDefaults, ["delivery_strategy", "deliveryStrategy"]),
  );
  const profileRunnerPolicy = resolveProfileRunnerPolicy(profile, riskClass);
  const profileAuditTiming = stringValue(findValue(riskDefaults, ["audit_timing", "auditTiming"]));
  const profilePrMode = stringValue(findValue(riskDefaults, ["pr_mode", "prMode"]));
  const inheritedLane = !hasConcreteKey(workOrder, ["lane"]);
  const inheritedDeliveryStrategy = !hasConcreteKey(workOrder, [
    "delivery_strategy",
    "deliveryStrategy",
  ]);
  const inheritedRunnerPolicy = !hasConcreteKey(workOrder, ["runner_policy", "runnerPolicy"]);
  const inheritedAuditTiming = !hasConcreteKey(workOrder, ["audit_timing", "auditTiming"]);
  const inheritedPrMode = !hasConcreteKey(workOrder, ["pr_mode", "prMode"]);

  const lane = normalizeLane(findValue(workOrder, ["lane"])) ?? RISK_TO_LANE[riskClass];
  const deliveryStrategy =
    stringValue(findValue(workOrder, ["delivery_strategy", "deliveryStrategy"])) ??
    profileDeliveryStrategy;
  const runnerPolicy =
    stringValue(findValue(workOrder, ["runner_policy", "runnerPolicy"])) ??
    profileRunnerPolicy;
  const auditTiming =
    stringValue(findValue(workOrder, ["audit_timing", "auditTiming"])) ??
    profileAuditTiming;
  const prMode =
    stringValue(findValue(workOrder, ["pr_mode", "prMode"])) ?? profilePrMode;

  if (!profileDeliveryStrategy) gaps.push(`delivery_profile.${riskClass}.delivery_strategy`);
  if (!profileRunnerPolicy) gaps.push(`delivery_profile.${riskClass}.runner_policy`);
  if (!profileAuditTiming) gaps.push(`delivery_profile.${riskClass}.audit_timing`);
  if (!profilePrMode) gaps.push(`delivery_profile.${riskClass}.pr_mode`);
  if (!deliveryStrategy) gaps.push("delivery_strategy");
  if (!runnerPolicy) gaps.push("runner_policy");
  if (!auditTiming) gaps.push("audit_timing");
  if (!prMode) gaps.push("pr_mode");

  const allowedRunnerPolicies = stringArrayValue(
    findValue(profile, ["allowed_runner_policies", "allowedRunnerPolicies"]),
  );
  if (
    runnerPolicy &&
    allowedRunnerPolicies.length > 0 &&
    !allowedRunnerPolicies.includes(runnerPolicy)
  ) {
    gaps.push(`runner_policy:${runnerPolicy}:not_allowed`);
  }

  if (lane !== RISK_TO_LANE[riskClass]) {
    gaps.push(`lane:${lane}:expected:${RISK_TO_LANE[riskClass]}`);
  }

  if ((riskClass === "R3" || riskClass === "R4") && runnerPolicy === "codex_native_fast_lane") {
    gaps.push(`${riskClass}.runner_policy:codex_native_fast_lane`);
  }

  if (riskClass === "R3" && auditTiming === "after_pr") {
    gaps.push("R3.audit_timing:after_pr");
  }

  if (riskClass === "R4") {
    if (deliveryStrategy !== "serial_gate") {
      gaps.push(`R4.delivery_strategy:${deliveryStrategy}`);
    }
    if (auditTiming !== "before_execution") {
      gaps.push(`R4.audit_timing:${auditTiming}`);
    }
    if (prMode !== "blocked_until_approved") {
      gaps.push(`R4.pr_mode:${prMode}`);
    }
  }

  if (!profileId || !deliveryStrategy || !runnerPolicy || !auditTiming || !prMode) {
    return { defaults: null, gaps };
  }

  return {
    defaults: {
      profileId,
      riskClass,
      lane,
      deliveryStrategy,
      runnerPolicy,
      auditTiming,
      prMode,
      inherited: {
        lane: inheritedLane,
        deliveryStrategy: inheritedDeliveryStrategy,
        runnerPolicy: inheritedRunnerPolicy,
        auditTiming: inheritedAuditTiming,
        prMode: inheritedPrMode,
      },
    },
    gaps,
  };
}

function resolveProfileRunnerPolicy(
  profile: JsonObject,
  riskClass: WorkOrderRiskClass,
): string | null {
  const runnerPolicyByRisk = objectValue(
    findValue(profile, ["runner_policy_by_risk", "runnerPolicyByRisk"]),
  );
  const byRisk = runnerPolicyByRisk ? stringValue(runnerPolicyByRisk[riskClass]) : null;
  if (byRisk) return byRisk;

  const defaultRunnerPolicy = stringValue(
    findValue(profile, ["default_runner_policy", "defaultRunnerPolicy"]),
  );
  if (!defaultRunnerPolicy) return null;

  const runnerPolicies = objectValue(findValue(profile, ["runner_policies", "runnerPolicies"]));
  const policy = objectValue(runnerPolicies?.[defaultRunnerPolicy]);
  const eligibleRiskClasses = stringArrayValue(
    policy?.eligible_risk_classes ?? policy?.eligibleRiskClasses,
  );
  if (eligibleRiskClasses.length === 0 || eligibleRiskClasses.includes(riskClass)) {
    return defaultRunnerPolicy;
  }

  return "runner_agnostic_manual";
}

function normalizeRiskClass(value: unknown): WorkOrderRiskClass | null {
  const normalized = stringValue(value)?.toUpperCase();
  if (RISK_CLASSES.includes(normalized as WorkOrderRiskClass)) {
    return normalized as WorkOrderRiskClass;
  }
  return null;
}

function normalizeLane(value: unknown): WorkOrderLane | null {
  const normalized = stringValue(value)?.toLowerCase();
  switch (normalized) {
    case "fast":
      return "Fast";
    case "governed":
      return "Governed";
    case "stop":
      return "Stop";
    default:
      return null;
  }
}

function hasConcreteKey(value: JsonObject, keys: string[]): boolean {
  const found = findValue(value, keys);
  return found !== undefined && hasConcreteValue(found);
}

function hasConcreteValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 && !EMPTY_VALUE.test(normalized);
  }
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return value === true;
  if (Array.isArray(value)) return value.length > 0 && value.some(hasConcreteValue);
  if (typeof value === "object") {
    const entries = Object.values(value as JsonObject);
    return entries.length > 0 && entries.some(hasConcreteValue);
  }
  return false;
}

function findValue(value: JsonObject, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  return undefined;
}

function objectValue(value: unknown): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && !EMPTY_VALUE.test(trimmed) ? trimmed : null;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
