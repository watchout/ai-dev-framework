import { describe, expect, it } from "vitest";
import { validateLlmControlDesign } from "./llm-control-design-validator.js";

const completeAutomationSpec = `
# Automation Design

This design adds queue automation and GitHub Actions orchestration.

## Source of Truth
GitHub Issues are the task queue SSOT.

## Control split
deterministic control owns queue state. LLM judgment drafts summaries only.

## Hook justification
PreToolUse is used only to block unsafe tool calls.

## Runtime adapter boundary
The LLM runtime adapter only invokes the model and returns structured results.

## Startup context
Startup uses a bounded restart pack.

## Mechanical gates
CI gate and branch protection block unsafe merges.

## Authority
CTO/L3 and human_approver approval are required.
`;

describe("validateLlmControlDesign", () => {
  it("passes automation specs with all required LLM control sections", () => {
    const result = validateLlmControlDesign([
      { path: "docs/spec.md", content: completeAutomationSpec },
    ]);

    expect(result.automationDetected).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("blocks automation specs missing Source of Truth", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: completeAutomationSpec.replace("## Source of Truth", "## Context"),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_section",
        message: "Missing LLM Control Design section: Source of Truth",
      }),
    );
  });

  it("blocks automation specs missing runtime adapter boundary", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: completeAutomationSpec.replace(
          "## Runtime adapter boundary",
          "## Runtime notes",
        ),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_section",
        message: "Missing LLM Control Design section: runtime adapter boundary",
      }),
    );
  });

  it("blocks designs that assign queue state transition to the LLM adapter", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: `${completeAutomationSpec}\nThe LLM adapter owns queue state transition.`,
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "llm_owns_state_transition" }),
    );
  });

  it("blocks designs that assign finalization or delivery to the LLM adapter", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: `${completeAutomationSpec}\nThe LLM adapter performs finalization and delivery.`,
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "llm_owns_finalization" }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "llm_owns_delivery" }),
    );
  });

  it("does not block explicit LLM ownership prohibition text", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: `${completeAutomationSpec}
The LLM adapter must not own queue state transition, finalization, or delivery.`,
      },
    ]);

    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("does not treat static PR or CI wording as automation by itself", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: "This static docs change fixes a PR description typo and updates CI wording.",
      },
    ]);

    expect(result.automationDetected).toBe(false);
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("treats GitHub Issue generation as automation", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: "This design generates GitHub Issues from accepted task specs.",
      },
    ]);

    expect(result.automationDetected).toBe(true);
    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_section",
        message: "Missing LLM Control Design section: Source of Truth",
      }),
    );
  });

  it("treats pull request generation as automation", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: "This design generates pull requests from completed implementation output.",
      },
    ]);

    expect(result.automationDetected).toBe(true);
    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_section",
        message: "Missing LLM Control Design section: Source of Truth",
      }),
    );
  });

  it("does not over-block non-automation specs", () => {
    const result = validateLlmControlDesign([
      {
        path: "docs/spec.md",
        content: "This copy-only change updates static product messaging.",
      },
    ]);

    expect(result.automationDetected).toBe(false);
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });
});
