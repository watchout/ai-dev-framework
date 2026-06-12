#!/bin/bash
# Shirube tier system labels setup
# Usage: ./setup-labels.sh [org/repo]
REPO=${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}

echo "Setting up Shirube labels for $REPO..."

# Tier labels
gh label create "tier:nano"     --description "Nano tier: existing contract, CI Gate 0 only"   --color "0E8A16" --repo "$REPO" 2>/dev/null || gh label edit "tier:nano"     --description "Nano tier: existing contract, CI Gate 0 only"   --color "0E8A16" --repo "$REPO"
gh label create "tier:standard" --description "Standard tier: known domain, PR Design required" --color "1D76DB" --repo "$REPO" 2>/dev/null || gh label edit "tier:standard" --description "Standard tier: known domain, PR Design required" --color "1D76DB" --repo "$REPO"
gh label create "tier:full"     --description "Full tier: new domain/protected surface"         --color "B60205" --repo "$REPO" 2>/dev/null || gh label edit "tier:full"     --description "Full tier: new domain/protected surface"         --color "B60205" --repo "$REPO"

# Protected surface labels
gh label create "protected:auth"       --description "Protected: auth/credentials/token"         --color "e4e669" --repo "$REPO" 2>/dev/null || true
gh label create "protected:db"         --description "Protected: DB schema/migration"             --color "e4e669" --repo "$REPO" 2>/dev/null || true
gh label create "protected:api"        --description "Protected: public API/MCP contract"         --color "e4e669" --repo "$REPO" 2>/dev/null || true
gh label create "protected:routing"    --description "Protected: agent routing/queue"             --color "e4e669" --repo "$REPO" 2>/dev/null || true
gh label create "protected:runtime"    --description "Protected: process lifecycle/live transport" --color "e4e669" --repo "$REPO" 2>/dev/null || true
gh label create "protected:deploy"     --description "Protected: production deploy/billing"       --color "e4e669" --repo "$REPO" 2>/dev/null || true
gh label create "protected:governance" --description "Protected: governance/branch protection"    --color "e4e669" --repo "$REPO" 2>/dev/null || true

# Lifecycle labels
gh label create "complete:pending" --description "Merged but not yet complete (evidence pending)" --color "FBCA04" --repo "$REPO" 2>/dev/null || true
gh label create "complete:done"    --description "Complete with evidence"                         --color "0E8A16" --repo "$REPO" 2>/dev/null || true

# Audit signal labels
gh label create "audit:green"  --description "Audit: no blocker found"               --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "audit:yellow" --description "Audit: non-blocking finding (follow-up)" --color "FBCA04" --repo "$REPO" 2>/dev/null || true
gh label create "audit:red"    --description "Audit: hard-gate blocker, merge blocked" --color "B60205" --repo "$REPO" 2>/dev/null || true

echo "Done."
