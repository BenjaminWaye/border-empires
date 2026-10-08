import { describe, test, expect } from "vitest";
import { MIN_PERCEPTUAL_GAP, perceptualDistance } from "./perceptual-color-distance.js";
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

  test("rejects a near-identical blue even though the hex differs", () => {
    expect(isTaken("#0082c8", new Set(["#1f77b4"]))).toBe(true);
    expect(isTaken("#2196f3", new Set(["#03a9f4"]))).toBe(true);
  });

  test("rejects a colour that is nearly the barbarian grey", () => {
    expect(isTaken("#303a44", new Set())).toBe(true);
  });

  test("accepts a clearly different colour", () => {
    expect(isTaken("#ff0000", new Set(["#1f77b4"]))).toBe(false);
    expect(isTaken("#ff7f0e", new Set(["#1f77b4"]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. BASE_PALETTE integrity
// ---------------------------------------------------------------------------

describe("BASE_PALETTE", () => {
  test("has at least 40 entries, all normalizable, all unique, none reserved", () => {
    expect(BASE_PALETTE.length).toBeGreaterThanOrEqual(40);
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
  test("every pair, and every entry against the reserved colours, clears the perceptual gap", () => {
    for (let i = 0; i < BASE_PALETTE.length; i++) {
      for (let j = i + 1; j < BASE_PALETTE.length; j++) {
        expect(perceptualDistance(BASE_PALETTE[i]!, BASE_PALETTE[j]!)).toBeGreaterThanOrEqual(MIN_PERCEPTUAL_GAP);
      }
      for (const reserved of RESERVED_COLORS) {
        expect(perceptualDistance(BASE_PALETTE[i]!, reserved)).toBeGreaterThanOrEqual(MIN_PERCEPTUAL_GAP);
      }
    }
  });

  test("no two adjacent entries have colorDistance < 18", () => {
    for (let i = 0; i < BASE_PALETTE.length - 1; i++) {
      const d = colorDistance(BASE_PALETTE[i], BASE_PALETTE[i + 1]);
      expect(d).toBeGreaterThanOrEqual(18);
    }
  });

  test("cross-pair spot-check: colour groups are visually distinct", () => {
    // Reds should be far from greens, blues far from oranges, etc.
    expect(colorDistance("#ff0000", "#39ff14")).toBeGreaterThanOrEqual(80);
    expect(colorDistance("#ff0000", "#00ffff")).toBeGreaterThanOrEqual(80);
    expect(colorDistance("#e6194b", "#2ca02c")).toBeGreaterThanOrEqual(50);
    expect(colorDistance("#1f77b4", "#ff7f0e")).toBeGreaterThanOrEqual(50);
    expect(colorDistance("#9467bd", "#bcbd22")).toBeGreaterThanOrEqual(30);
    expect(colorDistance("#2b3d26", "#ff0000")).toBeGreaterThanOrEqual(30);
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

  test("suggestions stay distinct from taken colours and from each other", () => {
    const taken = new Set(["#1f77b4"]);
    const result = pickSuggestedPalette(6, taken);
    for (const c of result) expect(isTaken(c, taken)).toBe(false);
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        expect(perceptualDistance(result[i]!, result[j]!)).toBeGreaterThanOrEqual(MIN_PERCEPTUAL_GAP);
      }
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

  test("with every palette entry taken still returns a valid, distinct hex", () => {
    const allTaken = new Set<string>(BASE_PALETTE);
    const result = assignUniqueColor("fallback", allTaken);
    expect(normalizeHex(result)).not.toBeNull();
    expect(isTaken(result, allTaken)).toBe(false);
  });

  test("never refuses: with the wheel saturated it returns the most distinct colour", () => {
    const saturated = new Set<string>(BASE_PALETTE);
    for (let h = 0; h < 360; h += 4) {
      for (const [s, l] of [[0.6, 0.5], [0.75, 0.35], [0.5, 0.7]] as const) saturated.add(hslHex(h, s, l));
    }
    const result = assignUniqueColor("crowded", saturated);
    expect(normalizeHex(result)).not.toBeNull();
  });

  test("two AIs get perceptually distinct colours", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 40; i++) taken.add(assignUniqueColor(`ai-${i}`, taken));
    const colors = [...taken];
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        expect(perceptualDistance(colors[i]!, colors[j]!)).toBeGreaterThanOrEqual(MIN_PERCEPTUAL_GAP);
      }
    }
  });
});

function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.min(255, Math.round((v + m) * 255)).toString(16).padStart(2, "0");
  return `#${hex(r!)}${hex(g!)}${hex(b!)}`;
}
