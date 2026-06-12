import { describe, it, expect } from "vitest";
import { safeJsonParse, parseJsonOrDefault, parseJsonOrThrow } from "./safe-json.js";

describe("safeJsonParse", () => {
  it("returns ok:true and parsed value for valid JSON", () => {
    const result = safeJsonParse<{ x: number }>('{"x":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.x).toBe(1);
  });

  it("returns ok:false with error message for invalid JSON", () => {
    const result = safeJsonParse("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it("handles empty string", () => {
    expect(safeJsonParse("").ok).toBe(false);
  });

  it("handles null literal", () => {
    const result = safeJsonParse<null>("null");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

describe("parseJsonOrDefault", () => {
  it("returns parsed value on valid JSON", () => {
    const result = parseJsonOrDefault<{ a: number }>('{"a":42}', { a: 0 });
    expect(result.a).toBe(42);
  });

  it("returns fallback on invalid JSON", () => {
    const result = parseJsonOrDefault("{bad}", { a: 99 });
    expect(result.a).toBe(99);
  });
});

describe("parseJsonOrThrow", () => {
  it("returns parsed value on valid JSON", () => {
    const result = parseJsonOrThrow<{ ok: boolean }>('{"ok":true}', "test");
    expect(result.ok).toBe(true);
  });

  it("throws with context on invalid JSON", () => {
    expect(() => parseJsonOrThrow("{bad}", "my-file.json")).toThrow("my-file.json");
  });
});
