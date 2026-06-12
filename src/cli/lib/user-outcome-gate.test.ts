import { describe, expect, it } from "vitest";
import { evaluateUserOutcomeGate } from "./user-outcome-gate.js";

describe("user outcome gate", () => {
  it("blocks AUN recovery claims when visible user outcome still fails", () => {
    const report = evaluateUserOutcomeGate({
      subject: "AUN recovery canary",
      claim_text: "AUN complete recovery is done and usable.",
      proof: {
        expected_user_outcome: "A user can see conversational thread behavior rather than queue ACK/script output.",
        outcome_evidence_uri: "fixture://aun-recovery-canary/visible-output",
        outcome_verdict: "FAIL",
        negative_controls_checked: [
          "queue ack only",
          "script-style output",
          "no conversational thread stream",
        ],
      },
    });

    expect(report.verdict).toBe("BLOCK");
    expect(report.claim_blocked).toBe(true);
    expect(report.claim_terms_detected).toEqual(expect.arrayContaining(["done", "complete", "recovered", "usable"]));
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["outcome_verdict_fail", "completion_claim_without_user_outcome"]),
    );
  });

  it("passes completion claims with outcome PASS evidence and negative controls", () => {
    const report = evaluateUserOutcomeGate({
      subject: "Shirube M0",
      claim_text: "Shirube M0 is usable.",
      proof: {
        expected_user_outcome: "Operator can inspect next actions and blockers without manual guesswork.",
        outcome_evidence_uri: "https://github.com/watchout/ai-dev-framework/pull/313#issuecomment-1",
        outcome_verdict: "PASS",
        negative_controls_checked: ["no chat-only audit", "no label-only pass", "no unreviewed deployed head"],
      },
    });

    expect(report.verdict).toBe("PASS");
    expect(report.outcome_satisfied).toBe(true);
    expect(report.claim_blocked).toBe(false);
  });

  it("blocks PASS outcome proof with blank or placeholder evidence fields", () => {
    const report = evaluateUserOutcomeGate({
      subject: "Shirube M0",
      claim_text: "Shirube M0 is usable.",
      proof: {
        expected_user_outcome: "   ",
        outcome_evidence_uri: "TBD",
        outcome_verdict: "PASS",
        negative_controls_checked: [" ", "pending", "none"],
      },
    });

    expect(report.verdict).toBe("BLOCK");
    expect(report.outcome_satisfied).toBe(false);
    expect(report.claim_blocked).toBe(true);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "missing_expected_user_outcome",
        "missing_outcome_evidence_uri",
        "missing_negative_controls_checked",
        "completion_claim_without_user_outcome",
      ]),
    );
  });

  it("allows waived outcome only with actor and reason", () => {
    const blocked = evaluateUserOutcomeGate({
      subject: "Shirube M0",
      claim_text: "Shirube M0 is complete.",
      proof: {
        expected_user_outcome: "Operator can inspect next actions.",
        outcome_evidence_uri: "fixture://waiver",
        outcome_verdict: "WAIVED",
        negative_controls_checked: ["known UI unavailable"],
      },
    });
    expect(blocked.verdict).toBe("BLOCK");
    expect(blocked.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_waiver_actor", "missing_waiver_reason"]),
    );

    const allowed = evaluateUserOutcomeGate({
      subject: "Shirube M0",
      claim_text: "Shirube M0 is complete.",
      proof: {
        expected_user_outcome: "Operator can inspect next actions.",
        outcome_evidence_uri: "fixture://waiver",
        outcome_verdict: "WAIVED",
        negative_controls_checked: ["known UI unavailable"],
        waiver_actor: "ceo",
        waiver_reason: "time-boxed M0 internal-only acceptance",
      },
    });
    expect(allowed.verdict).toBe("PASS");
    expect(allowed.outcome_satisfied).toBe(true);
  });

  it("blocks waived outcome proof with blank or placeholder waiver fields", () => {
    const report = evaluateUserOutcomeGate({
      subject: "Shirube M0",
      claim_text: "Shirube M0 is complete.",
      proof: {
        expected_user_outcome: "Operator can inspect next actions.",
        outcome_evidence_uri: "fixture://waiver",
        outcome_verdict: "WAIVED",
        negative_controls_checked: ["known UI unavailable"],
        waiver_actor: " ",
        waiver_reason: "pending",
      },
    });

    expect(report.verdict).toBe("BLOCK");
    expect(report.outcome_satisfied).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_waiver_actor", "missing_waiver_reason"]),
    );
  });

  it("does not block non-completion statements", () => {
    const report = evaluateUserOutcomeGate({
      subject: "Shirube M0",
      claim_text: "Shirube M0 implementation is in progress.",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.claim_blocked).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain("no_completion_claim_detected");
  });
});
