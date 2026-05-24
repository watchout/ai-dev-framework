import { describe, expect, it } from "vitest";
import { validateDataAuthorityDesign } from "./data-authority-design-validator.js";

const completeDataSpec = `
# Agent Registry Data Model

This design adds PostgreSQL tables for agent identity, routing, and queue state.

## Data Authority / Normalization
The canonical table for mutable agent identity is agent_registry. It is the single source of truth.
Queue rows store agent_registry_id as a reference and do not duplicate agent display name, routing status, or provider identity.
Database constraints use PRIMARY KEY, UNIQUE, NOT NULL, and FOREIGN KEY references. Program code resolves current bot metadata through a registry resolver.
Projection rows are derived from agent_registry with source_version and are regenerated when the source changes.
`;

describe("validateDataAuthorityDesign", () => {
  it("passes DB/state designs with explicit data authority and integrity rules", () => {
    const result = validateDataAuthorityDesign([
      { path: "docs/design/core/SSOT-4_DATA_MODEL.md", content: completeDataSpec },
    ]);

    expect(result.dataSurfaceDetected).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("blocks DB/state designs missing Data Authority / Normalization", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/design/features/agent-registry.md",
        content: "This feature adds database tables for agent identity and routing state.",
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_section",
      }),
    );
  });

  it("blocks authority sections that do not name the canonical owner", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/design/core/SSOT-4_DATA_MODEL.md",
        content: completeDataSpec.replace(
          "The canonical table for mutable agent identity is agent_registry. It is the single source of truth.",
          "Agent data appears in the tables described below.",
        ),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_canonical_owner",
      }),
    );
  });

  it("blocks authority sections that omit DB/programmatic integrity", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/design/core/SSOT-4_DATA_MODEL.md",
        content: completeDataSpec.replace(
          "Database constraints use PRIMARY KEY, UNIQUE, NOT NULL, and FOREIGN KEY references. Program code resolves current bot metadata through a registry resolver.",
          "Application code should keep the tables aligned.",
        ),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_reference_integrity",
      }),
    );
  });

  it("blocks duplicated mutable agent facts across tables", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/design/features/aun-agent-registry.md",
        content: `${completeDataSpec}
The implementation stores agent identity in multiple tables so each consumer can read it directly.`,
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "mutable_fact_duplicated",
      }),
    );
  });

  it("does not block explicit duplicate-data prohibition text", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/design/features/aun-agent-registry.md",
        content: `${completeDataSpec}
The implementation must not store same information or mutable facts in multiple tables.`,
      },
    ]);

    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("blocks projections or caches without derivation and invalidation rules", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/design/core/SSOT-4_DATA_MODEL.md",
        content: completeDataSpec.replace(
          "Projection rows are derived from agent_registry with source_version and are regenerated when the source changes.",
          "A projection table stores the bot routing view.",
        ),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "projection_without_derivation",
      }),
    );
  });

  it("does not over-block non-data static docs", () => {
    const result = validateDataAuthorityDesign([
      {
        path: "docs/spec.md",
        content: "This copy-only change updates static product messaging.",
      },
    ]);

    expect(result.dataSurfaceDetected).toBe(false);
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });
});
