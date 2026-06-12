import * as fs from "node:fs";
import * as path from "node:path";

export const REQUIRED_ROLE_NAMES = [
  "architecture_owner",
  "l3_governance_owner",
  "implementation_lead",
  "reviewer",
  "auditor",
  "release_owner",
  "human_approver",
  "worker_pool",
] as const;

export type RequiredRoleName = (typeof REQUIRED_ROLE_NAMES)[number];

export const ROLE_TARGET_TYPES = [
  "human",
  "local_agent",
  "mcp_agent",
  "channel",
  "github_user",
  "github_team",
  "external",
] as const;

export type RoleTargetType = (typeof ROLE_TARGET_TYPES)[number];

export type PublishPolicy =
  | "draft_only"
  | "approval_required"
  | "auto_publish";

export interface LifecycleSinkConfig {
  enabled?: boolean;
  type?: string;
  path?: string;
}

export interface RoleBinding {
  type: RoleTargetType;
  id: string;
  placeholder?: boolean;
}

export interface RoleConfig {
  bindings?: Partial<Record<RequiredRoleName, RoleBinding>>;
}

export interface WorkflowConfig {
  publishPolicy?: PublishPolicy;
  outputs?: string[];
  lifecycleSink?: LifecycleSinkConfig;
  requireRepoTopic?: boolean;
}

export interface FrameworkConfig {
  provider?: Record<string, unknown>;
  docs_layers?: Record<string, unknown>;
  roles?: RoleConfig;
  workflow?: WorkflowConfig;
  [key: string]: unknown;
}

export interface ReadyRoles {
  status: "ready";
  bindings: Record<RequiredRoleName, RoleBinding>;
}

export interface SetupRequired {
  status: "setup_required";
  missingRoles: RequiredRoleName[];
  placeholderRoles: RequiredRoleName[];
}

export type RoleResolution = ReadyRoles | SetupRequired;

export interface RoleSeparationViolation {
  producerRole: RequiredRoleName;
  authorityRole: RequiredRoleName;
  target: string;
}

export interface WorkflowDecision {
  status: "allowed" | "blocked" | "setup_required";
  reason?: string;
  missingRoles?: RequiredRoleName[];
  placeholderRoles?: RequiredRoleName[];
}

const DEFAULT_OUTPUTS = ["local_files"];
const PRODUCER_ROLES: RequiredRoleName[] = ["implementation_lead", "worker_pool"];
const AUTHORITY_ROLES: RequiredRoleName[] = [
  "architecture_owner",
  "l3_governance_owner",
  "reviewer",
  "auditor",
  "release_owner",
  "human_approver",
];

export function createDefaultFrameworkConfig(): FrameworkConfig {
  return {
    provider: { default: "claude" },
    docs_layers: { enabled: true },
    roles: {
      bindings: Object.fromEntries(
        REQUIRED_ROLE_NAMES.map((role) => [
          role,
          createRolePlaceholder(role),
        ]),
      ) as Record<RequiredRoleName, RoleBinding>,
    },
    workflow: {
      publishPolicy: "draft_only",
      outputs: DEFAULT_OUTPUTS,
    },
  };
}

export function createRolePlaceholder(role: RequiredRoleName): RoleBinding {
  return {
    type: "external",
    id: `todo-${role.split("_").join("-")}`,
    placeholder: true,
  };
}

export function ensureMissingRequiredRolePlaceholders(
  config: FrameworkConfig,
  requiredRoles: readonly RequiredRoleName[] = REQUIRED_ROLE_NAMES,
): RequiredRoleName[] {
  config.roles ??= {};
  config.roles.bindings ??= {};

  const added: RequiredRoleName[] = [];
  for (const role of requiredRoles) {
    if (config.roles.bindings[role]) {
      continue;
    }
    config.roles.bindings[role] = createRolePlaceholder(role);
    added.push(role);
  }
  return added;
}

export function loadFrameworkConfig(projectDir: string): FrameworkConfig {
  const configPath = path.join(projectDir, ".framework", "config.json");
  if (!fs.existsSync(configPath)) {
    return createDefaultFrameworkConfig();
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(".framework/config.json must contain a JSON object");
  }
  return parsed as FrameworkConfig;
}

export function saveFrameworkConfig(
  projectDir: string,
  config: FrameworkConfig,
): void {
  const frameworkDir = path.join(projectDir, ".framework");
  if (!fs.existsSync(frameworkDir)) {
    fs.mkdirSync(frameworkDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(frameworkDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}

export function resolveRequiredRoles(
  config: FrameworkConfig,
  requiredRoles: readonly RequiredRoleName[] = REQUIRED_ROLE_NAMES,
): RoleResolution {
  const bindings = config.roles?.bindings ?? {};
  const missingRoles: RequiredRoleName[] = [];
  const placeholderRoles: RequiredRoleName[] = [];
  const resolved: Partial<Record<RequiredRoleName, RoleBinding>> = {};

  for (const role of requiredRoles) {
    const binding = bindings[role];
    if (!binding) {
      missingRoles.push(role);
      continue;
    }
    if (!isValidRoleBinding(binding)) {
      missingRoles.push(role);
      continue;
    }
    if (binding.placeholder) {
      placeholderRoles.push(role);
      continue;
    }
    resolved[role] = binding;
  }

  if (missingRoles.length > 0 || placeholderRoles.length > 0) {
    return {
      status: "setup_required",
      missingRoles,
      placeholderRoles,
    };
  }

  return {
    status: "ready",
    bindings: resolved as Record<RequiredRoleName, RoleBinding>,
  };
}

export function evaluatePublishWorkflow(
  config: FrameworkConfig,
): WorkflowDecision {
  const policy = config.workflow?.publishPolicy ?? "draft_only";
  const outputs = config.workflow?.outputs ?? DEFAULT_OUTPUTS;

  if (policy === "draft_only") {
    return {
      status: "blocked",
      reason: "publish_policy_draft_only",
    };
  }

  const roles = resolveRequiredRoles(config);
  if (roles.status === "setup_required") {
    return {
      status: "setup_required",
      missingRoles: roles.missingRoles,
      placeholderRoles: roles.placeholderRoles,
    };
  }

  if (policy === "approval_required") {
    const approver = roles.bindings.human_approver;
    if (!approver || approver.placeholder) {
      return {
        status: "setup_required",
        missingRoles: ["human_approver"],
        placeholderRoles: [],
      };
    }
    return {
      status: "blocked",
      reason: "approval_required",
    };
  }

  if (policy === "auto_publish") {
    if (!outputs.includes("github")) {
      return {
        status: "blocked",
        reason: "github_output_required",
      };
    }
    return { status: "allowed" };
  }

  return {
    status: "blocked",
    reason: "unknown_publish_policy",
  };
}

export function validateRoleSeparation(
  bindings: Record<RequiredRoleName, RoleBinding>,
): RoleSeparationViolation[] {
  const violations: RoleSeparationViolation[] = [];

  for (const producerRole of PRODUCER_ROLES) {
    const producer = bindings[producerRole];
    const producerTarget = roleTargetKey(producer);
    const producerActor = roleActorKey(producer);
    for (const authorityRole of AUTHORITY_ROLES) {
      const authority = bindings[authorityRole];
      const authorityTarget = roleTargetKey(authority);
      const authorityActor = roleActorKey(authority);
      if (producerTarget === authorityTarget) {
        violations.push({
          producerRole,
          authorityRole,
          target: producerTarget,
        });
        continue;
      }
      if (producerActor === authorityActor) {
        violations.push({
          producerRole,
          authorityRole,
          target: `actor:${producerActor}`,
        });
      }
    }
  }

  return violations;
}

export function formatRoleSeparationViolation(
  violation: RoleSeparationViolation,
): string {
  return `${violation.producerRole} and ${violation.authorityRole} share ${violation.target}`;
}

export function canGenerateLocalDraft(config: FrameworkConfig): WorkflowDecision {
  const outputs = config.workflow?.outputs ?? DEFAULT_OUTPUTS;
  if (!outputs.includes("local_files")) {
    return {
      status: "blocked",
      reason: "local_files_output_required",
    };
  }
  return { status: "allowed" };
}

export function isValidRoleBinding(value: unknown): value is RoleBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<RoleBinding>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.type === "string" &&
    (ROLE_TARGET_TYPES as readonly string[]).includes(candidate.type)
  );
}

function roleTargetKey(binding: RoleBinding): string {
  return `${binding.type}:${binding.id}`;
}

function roleActorKey(binding: RoleBinding): string {
  return binding.id.trim().toLowerCase();
}
