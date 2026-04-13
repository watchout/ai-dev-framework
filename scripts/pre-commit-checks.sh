#!/bin/bash
#
# Pre-commit content-level checks based on docs/specs/06_CODE_QUALITY.md:
#   §1.3 #8 (完全性):   no console.log in production source (non-test)
#   §3.4 (作成原則):     no .skip / .only in test files
#   §1.3 #4 (セキュリティ): hardcoded secret detection
#   §4.4 (CI合格条件):   front-load a subset of required CI checks
#
# Escape hatches (place in the file as a comment):
#   // pre-commit-allow: console-log    — file may contain console.log
#                                         (e.g., hook-script generators)
#   // pre-commit-allow: skip-only      — file may contain .skip/.only inside
#                                         string fixtures demonstrating them
#   // pre-commit-allow: secret         — file may contain hardcoded test tokens
#
# Per-line escape:
#   // allowed                          — single-line exemption for console.log
#
# Bypass entire script: git commit --no-verify (NOT recommended)
#
set -e
ERRORS=0

say() { printf "%s\n" "$*"; }

# file_has_allow <file> <token>  — returns 0 if file opts out of the named check.
file_has_allow() {
  grep -q "pre-commit-allow: $2" "$1" 2>/dev/null
}

# ─────────────────────────────────────────────
# §1.3 #8 完全性: console.log detection (production src only)
# ─────────────────────────────────────────────
CONSOLE_LOGS_ALL=$(grep -rEln "(^|\s|;|\{)console\.log\s*\(" \
  --include="*.ts" --include="*.tsx" src/ 2>/dev/null || true)
CONSOLE_ERRORS=""
for f in $CONSOLE_LOGS_ALL; do
  case "$f" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) continue ;;
  esac
  if file_has_allow "$f" "console-log"; then continue; fi
  hits=$(grep -En "(^|\s|;|\{)console\.log\s*\(" "$f" | grep -v "// allowed" || true)
  if [ -n "$hits" ]; then
    CONSOLE_ERRORS="${CONSOLE_ERRORS}${f}:\n${hits}\n"
  fi
done
if [ -n "$CONSOLE_ERRORS" ]; then
  say ""
  say "ERROR: console.log found (docs/specs/06_CODE_QUALITY.md §1.3 #8 完全性 violation):"
  printf "%b" "$CONSOLE_ERRORS"
  say ""
  say "  Fix: remove console.log from production code, append '// allowed' to a single"
  say "       line, or add '// pre-commit-allow: console-log' to the file if it"
  say "       intentionally generates scripts containing console.log."
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# §3.4 テスト作成原則: .skip / .only / xdescribe
# ─────────────────────────────────────────────
SKIP_FILES=$(grep -rEln "(describe|it|test)\.(skip|only)\s*\(|\b(xdescribe|xit|xtest)\s*\(" \
  --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" --include="*.spec.tsx" \
  . 2>/dev/null | grep -v node_modules | grep -v dist || true)
SKIP_ERRORS=""
for f in $SKIP_FILES; do
  if file_has_allow "$f" "skip-only"; then continue; fi
  hits=$(grep -En "(describe|it|test)\.(skip|only)\s*\(|\b(xdescribe|xit|xtest)\s*\(" "$f" || true)
  if [ -n "$hits" ]; then
    SKIP_ERRORS="${SKIP_ERRORS}${f}:\n${hits}\n"
  fi
done
if [ -n "$SKIP_ERRORS" ]; then
  say ""
  say "ERROR: .skip / .only / xdescribe found in tests (docs/specs/06_CODE_QUALITY.md §3.4 violation):"
  printf "%b" "$SKIP_ERRORS"
  say ""
  say "  Fix: remove .skip/.only. Skipped tests are forbidden in the main branch."
  say "       For files containing string fixtures demonstrating the pattern,"
  say "       add '// pre-commit-allow: skip-only' to the file."
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# §1.3 #4 セキュリティ: hardcoded secret detection
# ─────────────────────────────────────────────
SECRET_FILES=$(grep -rEln "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" src/ 2>/dev/null || true)
SECRET_ERRORS=""
for f in $SECRET_FILES; do
  if file_has_allow "$f" "secret"; then continue; fi
  hits=$(grep -En "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})" "$f" | grep -v "// allowed-secret" || true)
  if [ -n "$hits" ]; then
    SECRET_ERRORS="${SECRET_ERRORS}${f}:\n${hits}\n"
  fi
done
if [ -n "$SECRET_ERRORS" ]; then
  say ""
  say "ERROR: potential hardcoded secret (docs/specs/06_CODE_QUALITY.md §1.3 #4 セキュリティ violation):"
  printf "%b" "$SECRET_ERRORS"
  say ""
  say "  Fix: move to environment variable, append '// allowed-secret' per line,"
  say "       or add '// pre-commit-allow: secret' to the file if it contains test fixtures."
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# Verdict
# ─────────────────────────────────────────────
if [ $ERRORS -gt 0 ]; then
  say ""
  say "Pre-commit checks failed ($ERRORS errors). See docs/specs/06_CODE_QUALITY.md."
  say "Emergency bypass (not recommended): git commit --no-verify"
  exit 1
fi

say "OK Pre-commit content checks passed"
exit 0
