#!/usr/bin/env bash
set -euo pipefail

# Shirube tier / protected route / completion / audit label setup.
# Usage: ./setup-labels.sh [org/repo]
REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

upsert_label() {
  local name="$1"
  local description="$2"
  local color="$3"

  gh label create "$name" \
    --description "$description" \
    --color "$color" \
    --repo "$REPO" \
    2>/dev/null \
    || gh label edit "$name" \
      --description "$description" \
      --color "$color" \
      --repo "$REPO"
}

echo "Setting up Shirube labels for $REPO..."

# Tier labels
upsert_label "tier:nano" "Nano tier: existing contract, CI Gate 0 only" "0E8A16"
upsert_label "tier:standard" "Standard tier: known domain, PR Design required" "1D76DB"
upsert_label "tier:full" "Full tier: new domain/protected surface" "B60205"

# Protected category labels
upsert_label "protected:auth" "Protected: security/auth/credentials/tokens/encryption" "e4e669"
upsert_label "protected:permission" "Protected: permission or access-control semantics" "e4e669"
upsert_label "protected:db" "Protected: DB schema/migration/persistence/data-loss risk" "e4e669"
upsert_label "protected:api" "Protected: public API/external protocol/response shape" "e4e669"
upsert_label "protected:mcp-contract" "Protected: MCP tool contract or structured output schema" "e4e669"
upsert_label "protected:routing" "Protected: agent routing/claim/finalize/recovery semantics" "e4e669"
upsert_label "protected:queue" "Protected: queue lifecycle or merge queue behavior" "e4e669"
upsert_label "protected:runtime" "Protected: process lifecycle/runtime adapter/live transport" "e4e669"
upsert_label "protected:deploy" "Protected: production deploy/release rollout" "e4e669"
upsert_label "protected:customer-impact" "Protected: customer impact/external send/billing-pricing" "e4e669"
upsert_label "protected:governance" "Protected: governance/branch protection/gate bypass policy" "e4e669"

# Completion labels
upsert_label "complete:pending" "Merged but not complete; post-merge evidence pending" "FBCA04"
upsert_label "complete:done" "Complete with required post-merge evidence" "0E8A16"

# Audit signal labels
upsert_label "audit:green" "Audit: no blocker found" "0E8A16"
upsert_label "audit:yellow" "Audit: non-blocking finding; follow-up or accepted debt required" "FBCA04"
upsert_label "audit:red" "Audit: hard-gate blocker; merge blocked" "B60205"

echo "Done."
