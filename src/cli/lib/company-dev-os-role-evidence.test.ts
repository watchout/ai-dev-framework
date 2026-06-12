import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  COMPANY_DEV_OS_ROLE_EVIDENCE_MARKER,
  driftCheckCompanyDevOsRoleEvidence,
  parseCompanyDevOsRoleEvidenceJson,
  parseCompanyDevOsRoleEvidenceMarkdown,
  renderCompanyDevOsRoleEvidence,
  type CompanyDevOsRoleEvidence,
} from "./company-dev-os-role-evidence.js";
import {
  type CompanyDevOsRoleProfile,
} from "./company-dev-os-role-profile.js";

const REPO_ROOT = process.cwd();

function withRoleEvidenceFixture<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-company-dev-os-evidence-"));
  try {
    for (const filePath of [
      "AGENTS.md",
      "CLAUDE.md",
      ".codex/instructions.md",
      ".agents/skills/company-dev-os-runtime/SKILL.md",
    ]) {
      const target = path.join(dir, filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, filePath), target);
    }
    fs.cpSync(
      path.join(REPO_ROOT, ".shirube", "company-dev-os"),
      path.join(dir, ".shirube", "company-dev-os"),
      { recursive: true },
    );
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function renderAuditEvidence(dir: string): CompanyDevOsRoleEvidence {
  const result = renderCompanyDevOsRoleEvidence(dir, {
    repo: "watchout/ai-dev-framework",
    pr: 392,
    head: "534f227dad85274f4d752e68aa7fce432431c118",
    role: "audit",
    recordedBy: "adf-lead",
    recordedAt: "2026-06-12T09:37:45.000Z",
  });

  expect(result.passed).toBe(true);
  expect(result.evidence).toBeDefined();
  return result.evidence as CompanyDevOsRoleEvidence;
}

function readProfile(dir: string): CompanyDevOsRoleProfile {
  return JSON.parse(
    fs.readFileSync(
      path.join(dir, ".shirube", "company-dev-os", "roles", "audit.role.json"),
      "utf-8",
    ),
  ) as CompanyDevOsRoleProfile;
}

function writeProfile(dir: string, profile: CompanyDevOsRoleProfile): void {
  fs.writeFileSync(
    path.join(dir, ".shirube", "company-dev-os", "roles", "audit.role.json"),
    JSON.stringify(profile, null, 2),
    "utf-8",
  );
}

describe("renderCompanyDevOsRoleEvidence", () => {
  it("emits a shirube role evidence block with current profile and skill hashes", () => {
    const result = renderCompanyDevOsRoleEvidence(REPO_ROOT, {
      repo: "watchout/ai-dev-framework",
      pr: 392,
      head: "534f227dad85274f4d752e68aa7fce432431c118",
      role: "audit",
      recordedBy: "adf-lead",
      recordedAt: "2026-06-12T09:37:45.000Z",
    });

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.markdown).toContain(`<!-- ${COMPANY_DEV_OS_ROLE_EVIDENCE_MARKER} -->`);
    expect(result.markdown).toContain("role: audit");
    expect(result.evidence).toEqual(
      expect.objectContaining({
        repo: "watchout/ai-dev-framework",
        pr: "392",
        role: "audit",
        role_profile: ".shirube/company-dev-os/roles/audit.role.json",
        role_profile_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        skill_bindings: expect.stringMatching(/^company-dev-os-runtime:[a-f0-9]{64}$/),
        authority_can_edit_files: false,
        authority_can_merge: false,
      }),
    );
  });
});

describe("parseCompanyDevOsRoleEvidence", () => {
  it("parses markdown evidence blocks and JSON fixtures", () => {
    withRoleEvidenceFixture((dir) => {
      const evidence = renderAuditEvidence(dir);
      const markdown = [
        "before",
        `<!-- ${COMPANY_DEV_OS_ROLE_EVIDENCE_MARKER} -->`,
        `repo: ${evidence.repo}`,
        `pr: ${evidence.pr}`,
        `head: ${evidence.head}`,
        `role: ${evidence.role}`,
        `llm: ${evidence.llm}`,
        `role_profile: ${evidence.role_profile}`,
        `role_profile_hash: ${evidence.role_profile_hash}`,
        `skill_bindings: ${evidence.skill_bindings}`,
        `runtime_entrypoints: ${evidence.runtime_entrypoints}`,
        `authority_can_edit_files: ${evidence.authority_can_edit_files}`,
        `authority_can_apply_fixes: ${evidence.authority_can_apply_fixes}`,
        `authority_can_commit: ${evidence.authority_can_commit}`,
        `authority_can_create_pr: ${evidence.authority_can_create_pr}`,
        `authority_can_merge: ${evidence.authority_can_merge}`,
        `recorded_by: ${evidence.recorded_by}`,
        `recorded_at: ${evidence.recorded_at}`,
        "",
      ].join("\n");

      expect(parseCompanyDevOsRoleEvidenceMarkdown(markdown)).toEqual([
        expect.objectContaining({
          role: "audit",
          head: evidence.head,
          authority_can_edit_files: false,
        }),
      ]);
      expect(parseCompanyDevOsRoleEvidenceJson({ evidence })).toEqual([
        expect.objectContaining({
          role: "audit",
          head: evidence.head,
          authority_can_edit_files: false,
        }),
      ]);
    });
  });
});

describe("driftCheckCompanyDevOsRoleEvidence", () => {
  it("passes for current exact-head role evidence", () => {
    withRoleEvidenceFixture((dir) => {
      const evidence = renderAuditEvidence(dir);

      const result = driftCheckCompanyDevOsRoleEvidence(dir, {
        evidence,
        expectedRepo: "watchout/ai-dev-framework",
        expectedPr: 392,
        expectedHead: "534f227dad85274f4d752e68aa7fce432431c118",
      });

      expect(result.passed).toBe(true);
      expect(result.findings).toEqual([]);
    });
  });

  it("blocks role profile hash drift", () => {
    withRoleEvidenceFixture((dir) => {
      const evidence = renderAuditEvidence(dir);
      const profile = readProfile(dir);
      profile.purpose = "changed audit profile";
      writeProfile(dir, profile);

      const result = driftCheckCompanyDevOsRoleEvidence(dir, { evidence });

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "profile_hash_mismatch",
            role: "audit",
          }),
        ]),
      );
    });
  });

  it("blocks skill binding hash drift", () => {
    withRoleEvidenceFixture((dir) => {
      const evidence = renderAuditEvidence(dir);
      fs.appendFileSync(
        path.join(
          dir,
          ".shirube",
          "company-dev-os",
          "skills",
          "company-dev-os-runtime.skill.md",
        ),
        "\nchanged skill binding\n",
        "utf-8",
      );

      const result = driftCheckCompanyDevOsRoleEvidence(dir, { evidence });

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "skill_hash_mismatch",
            role: "audit",
          }),
        ]),
      );
    });
  });

  it("blocks missing exact head when a head is required", () => {
    withRoleEvidenceFixture((dir) => {
      const evidence = renderAuditEvidence(dir);
      delete (evidence as Partial<CompanyDevOsRoleEvidence>).head;

      const result = driftCheckCompanyDevOsRoleEvidence(dir, {
        evidence,
        expectedHead: "534f227dad85274f4d752e68aa7fce432431c118",
      });

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing_head",
            role: "audit",
          }),
        ]),
      );
    });
  });

  it("blocks forbidden authority claims", () => {
    withRoleEvidenceFixture((dir) => {
      const evidence = renderAuditEvidence(dir);
      evidence.authority_can_edit_files = true;

      const result = driftCheckCompanyDevOsRoleEvidence(dir, { evidence });

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "forbidden_authority",
            role: "audit",
            field: "authority_can_edit_files",
          }),
        ]),
      );
    });
  });
});
