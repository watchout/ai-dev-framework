import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  COMPANY_DEV_OS_ROLE_NAMES,
  hashCompanyDevOsRoleProfile,
  validateCompanyDevOsRoleProfiles,
  type CompanyDevOsRoleName,
  type CompanyDevOsRoleProfile,
} from "./company-dev-os-role-profile.js";

const REPO_ROOT = process.cwd();

function withRoleProfileFixture<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-company-dev-os-roles-"));
  try {
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

function readProfile(dir: string, role: CompanyDevOsRoleName): CompanyDevOsRoleProfile {
  return JSON.parse(
    fs.readFileSync(
      path.join(dir, ".shirube", "company-dev-os", "roles", `${role}.role.json`),
      "utf-8",
    ),
  ) as CompanyDevOsRoleProfile;
}

function writeProfile(
  dir: string,
  role: CompanyDevOsRoleName,
  profile: CompanyDevOsRoleProfile,
): void {
  fs.writeFileSync(
    path.join(dir, ".shirube", "company-dev-os", "roles", `${role}.role.json`),
    JSON.stringify(profile, null, 2),
    "utf-8",
  );
}

describe("validateCompanyDevOsRoleProfiles", () => {
  it("validates bundled Company Dev OS role profiles", () => {
    const result = validateCompanyDevOsRoleProfiles(REPO_ROOT);

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.required_roles).toEqual([...COMPANY_DEV_OS_ROLE_NAMES]);
    expect(result.profiles.map((profile) => profile.role)).toEqual([
      ...COMPANY_DEV_OS_ROLE_NAMES,
    ]);
    expect(result.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "audit",
          path: ".shirube/company-dev-os/roles/audit.role.json",
          role_profile_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
  });

  it("blocks mutation authority for non-implementation roles", () => {
    withRoleProfileFixture((dir) => {
      const profile = readProfile(dir, "audit");
      profile.authority.can_edit_files = true;
      writeProfile(dir, "audit", profile);

      const result = validateCompanyDevOsRoleProfiles(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "forbidden_authority",
            role: "audit",
            field: "authority.can_edit_files",
          }),
        ]),
      );
    });
  });

  it("blocks implementation self-approval and merge authority", () => {
    withRoleProfileFixture((dir) => {
      const profile = readProfile(dir, "implementation");
      profile.authority.can_approve = true;
      profile.authority.can_merge = true;
      writeProfile(dir, "implementation", profile);

      const result = validateCompanyDevOsRoleProfiles(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "forbidden_self_approval",
            role: "implementation",
            field: "authority.can_approve",
          }),
          expect.objectContaining({
            code: "forbidden_merge",
            role: "implementation",
            field: "authority.can_merge",
          }),
        ]),
      );
    });
  });

  it("reports missing role profiles deterministically", () => {
    withRoleProfileFixture((dir) => {
      fs.rmSync(
        path.join(dir, ".shirube", "company-dev-os", "roles", "qa.role.json"),
      );

      const result = validateCompanyDevOsRoleProfiles(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing_profile",
            role: "qa",
          }),
        ]),
      );
    });
  });

  it("reports invalid schema and role mismatches deterministically", () => {
    withRoleProfileFixture((dir) => {
      const profile = readProfile(dir, "arc");
      profile.schema = "wrong-schema" as CompanyDevOsRoleProfile["schema"];
      profile.role = "audit";
      writeProfile(dir, "arc", profile);

      const result = validateCompanyDevOsRoleProfiles(dir);

      expect(result.passed).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_schema",
            role: "arc",
            field: "schema",
          }),
          expect.objectContaining({
            code: "invalid_role",
            role: "arc",
            field: "role",
          }),
        ]),
      );
    });
  });
});

describe("hashCompanyDevOsRoleProfile", () => {
  it("uses stable object-key ordering for hashes", () => {
    withRoleProfileFixture((dir) => {
      const profile = readProfile(dir, "cto");
      const reordered = {
        role: profile.role,
        schema: profile.schema,
        llm: profile.llm,
        purpose: profile.purpose,
        may: profile.may,
        must_not: profile.must_not,
        required_input: profile.required_input,
        required_output: profile.required_output,
        required_skills: profile.required_skills,
        runtime_entrypoints: profile.runtime_entrypoints,
        handoff_targets: profile.handoff_targets,
        authority: {
          can_go_no_go: profile.authority.can_go_no_go,
          can_merge: profile.authority.can_merge,
          can_create_pr: profile.authority.can_create_pr,
          can_commit: profile.authority.can_commit,
          can_apply_fixes: profile.authority.can_apply_fixes,
          can_approve: profile.authority.can_approve,
          can_edit_files: profile.authority.can_edit_files,
        },
      } as CompanyDevOsRoleProfile;

      expect(hashCompanyDevOsRoleProfile(reordered)).toBe(
        hashCompanyDevOsRoleProfile(profile),
      );
    });
  });
});
