import { describe, expect, it } from "vitest";
import {
  evaluateMergeAuthority,
  type MergeAuthorityInput,
  type MergeAuthorityReview,
} from "./merge-authority.js";
import { type FrameworkConfig } from "./workflow-config.js";

const headRefOid = "abc123";

function baseConfig(): FrameworkConfig {
  return {
    roles: {
      bindings: {
        architecture_owner: { type: "external", id: "arc" },
        l3_governance_owner: { type: "github_user", id: "cto-login" },
        implementation_lead: { type: "local_agent", id: "codex-adf" },
        reviewer: { type: "external", id: "adf-lead" },
        auditor: { type: "external", id: "codex-auditor" },
        release_owner: { type: "github_user", id: "release-login" },
        human_approver: { type: "github_user", id: "human-login" },
        worker_pool: { type: "local_agent", id: "dev_001" },
      },
    },
    workflow: {
      publishPolicy: "auto_publish",
      outputs: ["github"],
    },
  };
}

function approved(author: string, submittedAt = "2026-05-21T00:00:00Z"): MergeAuthorityReview {
  return {
    author,
    state: "APPROVED",
    commitId: headRefOid,
    submittedAt,
  };
}

function input(overrides: Partial<MergeAuthorityInput> = {}): MergeAuthorityInput {
  return {
    config: baseConfig(),
    pullRequest: {
      number: 185,
      headRefOid,
      baseRefName: "main",
      labels: ["route:fast-merge"],
    },
    reviews: [approved("cto-login")],
    auditLevel: "strict",
    ...overrides,
  };
}

describe("merge authority evaluator", () => {
  it("passes with current-head approval from configured L3 actor", () => {
    const result = evaluateMergeAuthority(input());

    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.required.map((item) => item.role)).toEqual([
        "l3_governance_owner",
      ]);
    }
  });

  it("blocks missing L3 approval", () => {
    const result = evaluateMergeAuthority(input({ reviews: [] }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.reason).toBe("missing_authority_evidence");
      expect(result.missing.map((item) => item.role)).toEqual([
        "l3_governance_owner",
      ]);
    }
  });

  it("blocks wrong actor approval", () => {
    const result = evaluateMergeAuthority(input({ reviews: [approved("someone-else")] }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.missing[0]?.role).toBe("l3_governance_owner");
    }
  });

  it("blocks producer-as-approver", () => {
    const config = baseConfig();
    config.roles!.bindings!.implementation_lead = {
      type: "local_agent",
      id: "cto-login",
    };

    const result = evaluateMergeAuthority(input({ config }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.details.join("\n")).toContain(
        "producer actor cannot satisfy authority evidence",
      );
    }
  });

  it("blocks placeholder authority binding", () => {
    const config = baseConfig();
    config.roles!.bindings!.l3_governance_owner = {
      type: "external",
      id: "todo-l3-governance-owner",
      placeholder: true,
    };

    const result = evaluateMergeAuthority(input({ config }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.details.join("\n")).toContain("placeholder role binding");
    }
  });

  it("blocks non-GitHub authority binding without mapping", () => {
    const config = baseConfig();
    config.roles!.bindings!.l3_governance_owner = {
      type: "external",
      id: "cto-login",
    };

    const result = evaluateMergeAuthority(input({ config }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.details.join("\n")).toContain(
        "does not resolve to a GitHub identity",
      );
    }
  });

  it("blocks stale approval on an older head SHA", () => {
    const result = evaluateMergeAuthority(
      input({
        reviews: [
          {
            ...approved("cto-login"),
            commitId: "old-head",
          },
        ],
      }),
    );

    expect(result.status).toBe("block");
  });

  it("blocks dismissed approval", () => {
    const result = evaluateMergeAuthority(
      input({
        reviews: [
          {
            ...approved("cto-login"),
            dismissed: true,
          },
        ],
      }),
    );

    expect(result.status).toBe("block");
  });

  it("blocks when latest current-head review requests changes after approval", () => {
    const result = evaluateMergeAuthority(
      input({
        reviews: [
          approved("cto-login", "2026-05-21T00:00:00Z"),
          {
            author: "cto-login",
            state: "CHANGES_REQUESTED",
            commitId: headRefOid,
            submittedAt: "2026-05-21T01:00:00Z",
          },
        ],
      }),
    );

    expect(result.status).toBe("block");
  });

  it("blocks label-only approval", () => {
    const result = evaluateMergeAuthority(
      input({
        pullRequest: {
          number: 185,
          headRefOid,
          baseRefName: "main",
          labels: ["route:fast-merge", "audit-passed"],
        },
        reviews: [],
      }),
    );

    expect(result.status).toBe("block");
  });

  it("blocks missing route even with approval evidence", () => {
    const result = evaluateMergeAuthority(
      input({
        pullRequest: {
          number: 185,
          headRefOid,
          baseRefName: "main",
          labels: [],
        },
      }),
    );

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.reason).toBe("missing_route");
    }
  });

  it("requires release and human evidence for route:ceo-approval", () => {
    const result = evaluateMergeAuthority(
      input({
        pullRequest: {
          number: 185,
          headRefOid,
          baseRefName: "main",
          labels: ["route:ceo-approval"],
        },
        reviews: [
          approved("cto-login"),
          approved("release-login"),
          approved("human-login"),
        ],
      }),
    );

    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.required.map((item) => item.role)).toEqual([
        "l3_governance_owner",
        "release_owner",
        "human_approver",
      ]);
    }
  });

  it("blocks route:ceo-approval when release or human evidence is missing", () => {
    const result = evaluateMergeAuthority(
      input({
        pullRequest: {
          number: 185,
          headRefOid,
          baseRefName: "main",
          labels: ["route:ceo-approval"],
        },
        reviews: [approved("cto-login")],
      }),
    );

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.missing.map((item) => item.role)).toEqual([
        "release_owner",
        "human_approver",
      ]);
    }
  });

  it("blocks draft_only remote merge", () => {
    const config = baseConfig();
    config.workflow!.publishPolicy = "draft_only";

    const result = evaluateMergeAuthority(input({ config }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.reason).toBe("publish_policy_draft_only");
    }
  });

  it("supports github_team bindings when membership is supplied", () => {
    const config = baseConfig();
    config.roles!.bindings!.l3_governance_owner = {
      type: "github_team",
      id: "watchout/cto",
    };

    const result = evaluateMergeAuthority(
      input({
        config,
        reviews: [approved("team-member")],
        teamMembers: {
          "watchout/cto": ["team-member"],
        },
      }),
    );

    expect(result.status).toBe("pass");
  });

  it("blocks unknown audit level", () => {
    const result = evaluateMergeAuthority(input({ auditLevel: "unknown" }));

    expect(result.status).toBe("block");
    if (result.status === "block") {
      expect(result.reason).toBe("unknown_audit_level");
    }
  });
});
