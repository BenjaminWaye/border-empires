import { describe, test, expect } from "vitest";
import {
  BASE_PALETTE,
  RESERVED_COLORS,
  normalizeHex,
  colorDistance,
  isTaken,
  suggestAlternative,
  pickSuggestedPalette,
  assignUniqueColor,
} from "./player-color-allocation.js";

// ---------------------------------------------------------------------------
// 1. normalizeHex
// ---------------------------------------------------------------------------

describe("normalizeHex", () => {
  test("accepts #rrggbb", () => {
    expect(normalizeHex("#ff0000")).toBe("#ff0000");
    expect(normalizeHex("#aBcDeF")).toBe("#abcdef");
  });

  test("expands #rgb", () => {
    expect(normalizeHex("#f00")).toBe("#ff0000");
    expect(normalizeHex("#0a0")).toBe("#00aa00");
    expect(normalizeHex("#f0a")).toBe("#ff00aa");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
  });

  test("rejects invalid inputs", () => {
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#ggg")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2–4. isTaken
// ---------------------------------------------------------------------------

describe("isTaken", () => {
  test("returns true for exact match in taken set", () => {
    const taken = new Set(["#ff0000", "#00ff00"]);
    expect(isTaken("#ff0000", taken)).toBe(true);
  });

  test("returns true for barbarian reserved even with empty taken", () => {
    expect(isTaken("#2f3842", new Set())).toBe(true);
  });

  test("returns false when hex not in set", () => {
    const taken = new Set(["#ff0000"]);
    expect(isTaken("#000000", taken)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. BASE_PALETTE integrity
// ---------------------------------------------------------------------------

describe("BASE_PALETTE", () => {
  test("has exactly 100 entries, all normalizable, all unique, none reserved", () => {
    expect(BASE_PALETTE.length).toBe(100);
    const seen = new Set<string>();
    for (const entry of BASE_PALETTE) {
      const norm = normalizeHex(entry);
      expect(norm).not.toBeNull();
      expect(norm).toBe(entry); // already normalised
      expect(RESERVED_COLORS.has(norm!)).toBe(false);
      expect(seen.has(norm!)).toBe(false);
      seen.add(norm!);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. BASE_PALETTE spacing
// ---------------------------------------------------------------------------

describe("BASE_PALETTE spacing", () => {
  test("no two adjacent entries have colorDistance < 18", () => {
    for (let i = 0; i < BASE_PALETTE.length - 1; i++) {
      const d = colorDistance(BASE_PALETTE[i], BASE_PALETTE[i + 1]);
      expect(d).toBeGreaterThanOrEqual(18);
    }
  });
});

// ---------------------------------------------------------------------------
// 7–8. suggestAlternative
// ---------------------------------------------------------------------------

describe("suggestAlternative", () => {
  test("returns a free color when desired is taken", () => {
    const taken = new Set(["#ff0000"]);
    const result = suggestAlternative("#ff0000", taken);
    expect(normalizeHex(result)).not.toBeNull();
    expect(isTaken(result, taken)).toBe(false);
    expect(result).not.toBe("#ff0000");
  });

  test("result has colorDistance >= 22 from desired", () => {
    const taken = new Set(["#ff0000"]);
    const result = suggestAlternative("#ff0000", taken);
    expect(colorDistance(result, "#ff0000")).toBeGreaterThanOrEqual(22);
  });

  test("returns a valid hex for any palette colour", () => {
    // for each palette entry, if we mark it as taken, suggestAlternative must find something
    for (const entry of BASE_PALETTE) {
      const taken = new Set([entry]);
      const result = suggestAlternative(entry, taken);
      const norm = normalizeHex(result);
      expect(norm).not.toBeNull();
      expect(isTaken(norm!, taken)).toBe(false);
      expect(colorDistance(norm!, entry)).toBeGreaterThanOrEqual(22);
    }
  });
});

// ---------------------------------------------------------------------------
// 9–10. pickSuggestedPalette
// ---------------------------------------------------------------------------

describe("pickSuggestedPalette", () => {
  test("returns 6 distinct palette entries when nothing is taken", () => {
    const result = pickSuggestedPalette(6, new Set());
    expect(result).toHaveLength(6);
    const unique = new Set(result);
    expect(unique.size).toBe(6);
    for (const c of result) {
      expect(BASE_PALETTE.includes(c)).toBe(true);
    }
  });

  test("none in taken", () => {
    const first5 = new Set(BASE_PALETTE.slice(0, 5));
    const result = pickSuggestedPalette(6, first5);
    expect(result).toHaveLength(6);
    for (const c of result) {
      expect(first5.has(c)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 11–12. assignUniqueColor
// ---------------------------------------------------------------------------

describe("assignUniqueColor", () => {
  test("deterministic across two calls", () => {
    const taken = new Set<string>();
    const a = assignUniqueColor("ai-1", taken);
    const b = assignUniqueColor("ai-1", taken);
    expect(a).toBe(b);
    expect(normalizeHex(a)).not.toBeNull();
  });

  test("returns distinct colors for different seeds", () => {
    const taken = new Set<string>();
    const c1 = assignUniqueColor("ai-1", taken);
    const c2 = assignUniqueColor("ai-2", taken);
    expect(c1).not.toBe(c2);
  });

  test("with all 100 palette entries taken still returns a valid hex", () => {
    const allTaken = new Set<string>(BASE_PALETTE);
    const result = assignUniqueColor("fallback", allTaken);
    expect(normalizeHex(result)).not.toBeNull();
    expect(RESERVED_COLORS.has(normalizeHex(result)!)).toBe(false);
  });
});
