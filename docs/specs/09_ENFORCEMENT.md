# 09_ENFORCEMENT.md - Deterministic Enforcement Mechanisms

> **New in v1.1.0** (epic #60: LLM judgment dependency → deterministic script control)
>
> Consolidates all enforcement mechanisms that the framework applies via
> scripts, hooks, CI workflows, and deterministic policy — NOT via LLM judgment.
>
> **Principle**: The framework enforces rules through code that can be audited,
> tested, and reproduced. LLM-based review chains are project governance
> concerns, not framework enforcement.

---

## 1. Framework Mode State Machine (#63)

### States

```
          init / retrofit
               │
               ▼
  ┌──────────────────────┐
  │   active             │
  │   (repo topic:       │
  │    framework-managed) │
  └──────┬───────────────┘
         │  exit (CEO token required)
         ▼
  ┌──────────────────────┐
  │   inactive           │
  │   (topic removed)    │
  └──────────────────────┘
```

### Activation

- `framework init` / `framework retrofit` adds the `framework-managed` repo topic
- All local hooks check for this topic at invocation time
- Topic present → hooks enforce gates; topic absent → hooks are passthrough no-ops

### Exit

- `framework exit` command requires `FRAMEWORK_BYPASS` CEO secret token
- Removes `framework-managed` topic
- Logs exit event to audit log (§2)
- All hooks become no-ops immediately

### Mode Lock

- While `active`, the mode cannot change without the CEO token
- Prevents accidental deactivation by dev bots
- Mode transitions are recorded in the bypass audit log (§2)

---

## 2. Bypass Audit Log (#65)

### Principle

All bypass paths must be:
1. **Authenticated** — require `FRAMEWORK_BYPASS` CEO secret token
2. **Logged** — auto-append to immutable audit record
3. **Verifiable** — any reviewer can enumerate all bypasses

### Bypass Paths Requiring Token

| Bypass Action | Enforcement Point | Without Token | With Token |
|---|---|---|---|
| `--no-verify` (git commit) | **CI** (server-side) | CI detects → merge blocked | allowed + logged |
| `gate reset` | local hook | exit 2, blocked | allowed + logged |
| `SKIP_GATE_*` env vars | local hook + CI | CI detects → merge blocked | allowed + logged |
| `framework exit` | local hook | exit 2, blocked | allowed + logged |

> **Important**: `--no-verify` skips local hooks entirely, so local hooks cannot intercept it.
> Instead, a CI workflow (`bypass-detection.yml`) detects `--no-verify` commits by checking
> for missing hook signatures (e.g., gate check results not present in commit metadata).
> This CI check is configured as a **required status check** on protected branches,
> preventing merge of bypass commits without token validation.

### Audit Log Format

Each bypass auto-appends to a dedicated `audit-log` GitHub Issue:

```
## Bypass Record

- **Timestamp**: ISO 8601
- **Actor**: git user.name / bot identity
- **Action**: --no-verify | gate reset | SKIP_GATE_A | framework exit
- **Reason**: (provided by actor, required)
- **Token validation**: PASS (hash prefix match)
```

### Token Validation

- Token is validated via `gh api` against repository secret
- Only hash-prefix comparison — the full token never appears in logs
- Invalid token → exit 2, no bypass, no log entry

---

## 3. Hook & Settings Integrity (#67)

### Integrity Baseline

At `framework init` / `framework retrofit`:
1. Compute SHA-256 hash of each hook file (`pre-commit`, `pre-code-gate.sh`, etc.)
2. Compute SHA-256 hash of `.claude/settings.json` hook configuration
3. Store in `.framework/integrity.json`

```json
{
  "version": 1,
  "baselineAt": "2026-04-15T00:00:00Z",
  "files": {
    ".husky/pre-commit": "sha256:abc123...",
    ".claude/hooks/pre-code-gate.sh": "sha256:def456...",
    ".claude/settings.json": "sha256:789abc..."
  }
}
```

### Runtime Self-Verification

Each hook, on invocation:
1. Computes its own SHA-256
2. Compares against `.framework/integrity.json`
3. Mismatch → **auto-restore** canonical version from template + log to audit Issue
4. Missing integrity file → warn but proceed (backward compatibility)

### Scheduled CI Verification

GitHub Actions workflow (`integrity-check.yml`):
- Runs on schedule (e.g., daily) and on PR
- Compares all hook files against integrity baseline
- Integrity failure → blocks PR merge (configured as required status check)
- Reports discrepancies as check run annotations

---

## 4. Pre-Tool-Call Gateway / AEGIS (#68)

### Concept

An interceptor layer (via MCP tool middleware or Claude Code hooks) that applies
deterministic policy to every tool call **before** execution.

### Policy Engine

```
Tool call received
  │
  ├── Policy lookup (tool name + context)
  │   │
  │   ├── ALLOW → proceed to tool execution
  │   ├── BLOCK → reject with reason, log
  │   └── PENDING → queue for approval
  │
  └── Audit log append (all outcomes)
```

### Deterministic Policies (Examples)

| Policy | Trigger | Outcome |
|---|---|---|
| No Edit without Read | `Edit` tool called, no prior `Read` of same file in session | BLOCK |
| No file write outside project | `Write` tool path outside project root | BLOCK |
| No Edit on unassigned Issue | No open Issue assigned to current bot | BLOCK |
| Sensitive path protection | Edit to `.env`, credentials, secrets | BLOCK |

### Audit Trail

- Every tool call (allow, block, pending) is logged with:
  - Timestamp, tool name, parameters (sanitized), outcome, policy matched
- Log is append-only and tamper-evident (signed hash chain)
- Stored in `.framework/tool-audit.jsonl`

---

## 5. Session Lifecycle (#69)

### 1-Task-1-Session Principle

```
Session start
  │
  ├── Exactly 1 GitHub Issue assigned
  │   │
  │   ├── Work on that Issue only
  │   ├── Issue closes → session auto-terminates
  │   └── Scope creep detected → warn + block
  │
  └── No Issue assigned
      └── Enter idle mode (framework-runner.sh picks next)
```

### Compaction Rule Re-Injection

When Claude Code triggers compaction (context window management):
1. **Always re-inject**: CLAUDE.md rules, current Issue acceptance criteria
2. **Re-inject on demand**: SSOT sections referenced by current task
3. **Drop**: intermediate outputs, debug logs, prior attempts

### Drift Detection

| Signal | Threshold | Action |
|---|---|---|
| Session duration | > N minutes (configurable) | Trigger drift verification |
| Files touched outside Issue scope | >= 1 | Warn, require justification |
| Compaction count | >= 3 in session | Re-inject full rule set |

### Attention Decay Mitigation (Rhea Pattern)

Long sessions degrade rule adherence. Mitigation:
- **Instructional memory** (rules, constraints) is re-injected at checkpoints
- **Episodic memory** (task progress, decisions) is summarized
- Checkpoint interval: every N tool calls or M minutes

---

## 6. Read-Receipt Enforcement (#64)

### Problem

"Dev bot claims to have read the spec" is unverifiable without deterministic proof.

### 3-Layer Verification (Deterministic Scoring Schema)

Each layer has a deterministic pass/fail criterion — no LLM judgment in scoring.

| Layer | Method | Pass Criterion (deterministic) | What It Proves |
|---|---|---|---|
| 1. File hash | SHA-256 of spec file | `sha256(file) === expected_hash` (exact match) | Correct file was accessed |
| 2. Grounding text | Extract specific values from spec | Exact string match against spec content (e.g., "§3 FR-001 threshold = 80%") | Content was actually parsed |
| 3. Challenge Q&A | Answer factual questions | Answer matches pre-computed answer key (exact or regex match) | Comprehension, not just access |

### Layer 2: Grounding Schema

```json
{
  "specFile": "docs/specs/06_CODE_QUALITY.md",
  "groundingQuestions": [
    {
      "question": "What is the L1 coverage threshold in §3.5?",
      "expectedAnswer": "80%",
      "matchType": "contains"
    },
    {
      "question": "How many categories are in the quality checklist §1.2?",
      "expectedAnswer": "6",
      "matchType": "exact"
    }
  ]
}
```

### Layer 3: Challenge Schema

```json
{
  "challenges": [
    {
      "question": "If D-1 (Health Check) fails after deploy, what is the automatic action?",
      "answerKey": "auto-rollback",
      "matchType": "contains",
      "sourceSection": "06_CODE_QUALITY §4.7"
    }
  ]
}
```

Grounding questions and challenge answer keys are **pre-generated from spec content**
and stored alongside the spec. They update automatically when spec file hash changes.

### Implementation

```
Before task execution:
  1. Identify required specs (from Issue body or SSOT references)
  2. For each spec:
     a. Layer 1: sha256(file) === expected_hash (deterministic)
     b. Layer 2: Extract values → exact/regex match against answer key (deterministic)
     c. Layer 3: Answer challenge → match against pre-computed answer key (deterministic)
  3. All layers pass → proceed
  4. Any layer fails → block task, report to lead
  Scoring: 3/3 pass = PASS, anything less = FAIL. No partial credit.
```

### As PR Check Run

- `read-receipts` check run on PR
- Verifies that the PR author (bot) has valid read receipts for all referenced specs
- Receipts stored in `.framework/read-receipts/` as signed JSON
- Receipts expire when spec file hash changes (forces re-read)

---

## Cross-Reference to Other Specs

| Section | Related Spec | Relationship |
|---|---|---|
| §1 Framework Mode | 05_IMPLEMENTATION §3 (GitHub Issues SSOT) | Mode determines whether hooks enforce |
| §2 Bypass Audit | 06_CODE_QUALITY §4.7 (Gate D) | Bypass of gates is logged |
| §3 Hook Integrity | 06_CODE_QUALITY §4 (CI Pipeline) | Integrity check runs in CI |
| §4 AEGIS Gateway | 07_AI_PROTOCOL §4 (SSOT Layer Matrix) | Gateway enforces layer rules deterministically |
| §5 Session Lifecycle | 07_AI_PROTOCOL §10b (Dev Bot Autonomy) | Session boundary tied to Issue lifecycle |
| §6 Read Receipts | 07_AI_PROTOCOL §4 (Layer Matrix) | Replaces "判断できない → 停止" with verifiable reads |

---

## Gate 2 Hook Integration (IMPL Presence, FR-L4)

> **Effective**: 2026-05-02 (governance-flow.md Pre-impl gate と同 effective)
> **Owner**: lead-bot + codex-auditor
> **Ref**: `02_GENERATION_CHAIN.md` Gate 2 (IMPL Presence), `04b_IMPL_FORMAT.md`, `lead-impl-workflow/SPEC.md` FR-L4

### Flow

```
Step 3 (Technical / SSOT freeze)
  → Step 3.4 Lead IMPL Authoring (parent SPEC FR-L1)
      ├─ lead-bot が IMPL.md を起草 (04b_IMPL_FORMAT.md 準拠)
      ├─ Gate 2 IMPL Presence (機械的 check、framework gate validate impl)
      │     - WARNING のみ発行、IMPL.md 存在 / §1〜§10 header / evidence label / Closes link を deterministic に check
      └─ Pre-impl gate (codex-auditor 6 項目意味判断)
           - 指示書品質 (3) / 抽象整合 (2) / 実装可能性 (1)
           - PASS 後に dev-bot dispatch
  → Step 3.5 (Task Decomposition)
  → Step 4 (Dev Start)
```

Feasibility PoC + per-FR traceability matrix は parent SPEC FR-L6 で別 scope (Sub-PR 0.4 / 0.5 で land 予定)、本 section の射程外。

### Hook integration points

| Hook | Trigger | Action |
|---|---|---|
| `framework gate validate impl` | CI on PR open / IMPL.md commit | Gate 2 IMPL Presence deterministic check (WARNING) |
| `lead-bot dispatch` | IMPL.md commit + Gate 2 通過 | codex-auditor に Pre-impl gate dispatch |
| `dev-bot dispatch` | Pre-impl gate PASS | 5-section 指示書 (Interface contract / Required / Forbidden / Test fixtures / Open decisions) を dev-bot に渡す |

### Failure modes

- **Gate 2 WARNING のみ**: lead-bot が root cause を分析、L1 lead 判断で BLOCK or 進行を決定 (機械 gate 自体は exit 0)
- **Pre-impl gate FAIL (auditor BLOCK)**: lead-bot に差戻し、5-section 指示書の品質 / 抽象整合 / 実装可能性を修正してから再 dispatch
- **Step 3.4 skip 検知**: dev-bot dispatch 時に対象 feature directory に IMPL.md 不在 → exit 2 (block) + 明確エラー出力 (parent IMPL §3 で deterministic 化予定、`framework feasibility-check` CLI 拡張で対応)

詳細 lifecycle は `~/.claude/rules/governance-flow.md` の Pre-impl gate section (2026-05-02 effective、CEO directive `c4fb8e6c`) 参照。

---

## Change History

| Date | Change |
|------|--------|
| 2026-04-17 | v1.1.0 — New spec created. Consolidates enforcement mechanisms from epic #60 (LLM → deterministic control) |
| 2026-05-02 | v1.2.0 — Gate 2 Hook Integration section 追加 (IMPL Presence FR-L4 / Pre-impl gate)、Sub-PR 0.2 (lead-impl-workflow Phase 0.2)。cycle 2 で親 SPEC 整合化 (Feasibility PoC は別 scope) |
