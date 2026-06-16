/**
 * Type-safe JSON parse utilities.
 * Replaces bare JSON.parse() calls that silently throw on malformed input.
 * Ref: #343
 */

export type SafeParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Parse JSON and return a Result instead of throwing.
 * Use when callers need to handle parse failures explicitly.
 */
export function safeJsonParse<T>(raw: string): SafeParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Parse JSON and return a fallback value on failure.
 * Use for optional cached state files that can be reset to default.
 */
export function parseJsonOrDefault<T>(raw: string, fallback: T): T {
  const result = safeJsonParse<T>(raw);
  return result.ok ? result.value : fallback;
}

/**
 * Parse JSON and throw with a descriptive message on failure.
 * Use when callers want a thrown error but with context about which file failed.
 */
export function parseJsonOrThrow<T>(raw: string, context: string): T {
  const result = safeJsonParse<T>(raw);
  if (!result.ok) {
    throw new Error(`Failed to parse JSON (${context}): ${result.error}`);
  }
  return result.value;
}
