# Shirube Golden Cases

This directory stores calibration cases for LLM-assisted audits.

Golden cases are not runtime enforcement. They provide stable examples so audits
remain rubric-based, evidence-bound, and repeatable across repositories.

## Required Case Shape

Each case should include:

- case id
- target audit rubric
- input artifact references
- expected PASS / FAIL / N/A outcomes
- required evidence for each FAIL
- explanation for unsupported claims marked UNVERIFIED instead of FAIL
- applicable standards: SOC 2 primary, ISO/IEC 42001 secondary when AI is in scope,
  and NIST SSDF / OWASP LLM / SLSA engineering references when applicable

## Initial Case Set

Recommended starter cases:

- valid Spec with complete Cell decomposition
- Spec missing rollback plan
- Cell touching forbidden path
- Impl adding unapproved dependency
- MCP tool descriptor injection risk
- memory privacy boundary violation
- post-merge verification without evidence artifacts

## Usage

Use cases to calibrate LLM audit behavior. An LLM audit must still output
structured PASS / FAIL / N/A findings, and every FAIL must cite evidence.
