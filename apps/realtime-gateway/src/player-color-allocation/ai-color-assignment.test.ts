import { describe, expect, test } from "vitest";
import { aiDisplayNameForId } from "@border-empires/shared";
import { seedAiColors } from "../gateway-app/seed-ai-colors.js";
import { AI_COLOR_CANDIDATES, assignAiColors } from "./ai-color-assignment.js";
import { colorBlindSafeDistance, okLightness } from "./perceptual-color-distance.js";
import { RESERVED_COLORS } from "./player-color-allocation.js";

const TWENTY_AI_IDS = Array.from({ length: 20 }, (_, i) => `ai-${i + 1}`);

const seeded = async (ids: readonly string[]): Promise<Map<string, string>> => {
  const colors = new Map<string, string>();
  await seedAiColors(new Set(ids), async (id, color) => {
    colors.set(id, color);
  });
  return colors;
};

const closestPair = (colors: Map<string, string>): number => {
  const entries = [...colors.values()];
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) min = Math.min(min, colorBlindSafeDistance(entries[i]!, entries[j]!));
  }
  return min;
};

describe("colorBlindSafeDistance", () => {
  test("treats a red/green pair as closer than RGB distance suggests", () => {
    // Same lightness, opposite on the red-green axis: obvious to normal vision, near-identical to a deuteranope.
    expect(colorBlindSafeDistance("#ff0000", "#e25822")).toBeLessThan(0.05);
    expect(colorBlindSafeDistance("#1f77b4", "#ff7f0e")).toBeGreaterThan(0.1);
  });
});

describe("seeded AI colours (playtest 2026-11-12: two 'A' empires red vs green)", () => {
  test("every pair of the 20 default AIs stays distinguishable for colour-blind viewers", async () => {
    // The old hash-walk seeding gave Elin #ff0000 and Clara #e25822: 0.001 apart.
    expect(closestPair(await seeded(TWENTY_AI_IDS))).toBeGreaterThan(0.05);
  });

  test("Alden and Astrid share a crest letter, so they differ strongly in lightness, not just hue", async () => {
    expect(aiDisplayNameForId("ai-1")).toBe("Alden");
    expect(aiDisplayNameForId("ai-11")).toBe("Astrid");
    const colors = await seeded(TWENTY_AI_IDS);
    const alden = colors.get("ai-1")!;
    const astrid = colors.get("ai-11")!;
    expect(Math.abs(okLightness(alden) - okLightness(astrid))).toBeGreaterThan(0.2);
    expect(colorBlindSafeDistance(alden, astrid)).toBeGreaterThan(0.3);
  });

  test("is deterministic, unique, never reserved and never grey", async () => {
    const first = await seeded(TWENTY_AI_IDS);
    const second = await seeded([...TWENTY_AI_IDS].reverse());
    expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
    expect(new Set(first.values()).size).toBe(20);
    for (const color of first.values()) {
      expect(RESERVED_COLORS.has(color)).toBe(false);
      expect(AI_COLOR_CANDIDATES).toContain(color);
    }
  });

  test("keeps clear of colours already taken", () => {
    const taken = new Set(["#f3c300"]);
    const colors = assignAiColors(["ai-1", "ai-2"], aiDisplayNameForId, taken);
    for (const color of colors.values()) {
      expect(taken.has(color)).toBe(false);
      expect(colorBlindSafeDistance(color, "#f3c300")).toBeGreaterThan(0.1);
    }
  });

  test("falls back to free palette colours when AIs outnumber the candidates", () => {
    const ids = Array.from({ length: AI_COLOR_CANDIDATES.length + 5 }, (_, i) => `ai-${i + 1}`);
    const colors = assignAiColors(ids);
    expect(new Set(colors.values()).size).toBe(ids.length);
  });
});
