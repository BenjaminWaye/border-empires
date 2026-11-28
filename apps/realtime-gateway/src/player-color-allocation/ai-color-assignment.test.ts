import { describe, expect, test } from "vitest";
import { MIN_EMPIRE_COLOR_DELTA_E, ciede2000, defaultHouseCrestFor } from "@border-empires/shared";
import { humanColorsForAiSeeding, seedAiColors } from "../gateway-app/seed-ai-colors.js";
import { AI_COLOR_CANDIDATES, AI_EXTRA_COLOR_CANDIDATES, assignAiColors } from "./ai-color-assignment.js";
import { colorBlindSafeDistance } from "./perceptual-color-distance.js";
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
    // 20 AIs is past what the greedy pick can keep 0.05 apart (it managed 0.053
    // with the pre-House names' initials only by luck; 0.039 with crests or no marks).
    expect(closestPair(await seeded(TWENTY_AI_IDS))).toBeGreaterThan(0.035);
  });

  test("AIs that share a crest are pushed well apart", async () => {
    expect(defaultHouseCrestFor("ai-1")).toBe(defaultHouseCrestFor("ai-13"));
    const colors = await seeded(TWENTY_AI_IDS);
    for (const a of TWENTY_AI_IDS) {
      for (const b of TWENTY_AI_IDS) {
        if (a < b && defaultHouseCrestFor(a) === defaultHouseCrestFor(b)) expect(colorBlindSafeDistance(colors.get(a)!, colors.get(b)!)).toBeGreaterThan(0.1);
      }
    }
  });

  test("is deterministic, unique, never reserved and never grey", async () => {
    const first = await seeded(TWENTY_AI_IDS);
    const second = await seeded([...TWENTY_AI_IDS].reverse());
    expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
    expect(new Set(first.values()).size).toBe(20);
    for (const color of first.values()) {
      expect(RESERVED_COLORS.has(color)).toBe(false);
      expect([...AI_COLOR_CANDIDATES, ...AI_EXTRA_COLOR_CANDIDATES]).toContain(color);
    }
  });

  test("keeps clear of colours already taken", () => {
    const taken = new Set(["#f3c300"]);
    const colors = assignAiColors(["ai-1", "ai-2"], defaultHouseCrestFor, taken);
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

const closestDeltaE = (colors: Iterable<string>, others: Iterable<string> = []): number => {
  const list = [...colors];
  const rest = [...others];
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) min = Math.min(min, ciede2000(list[i]!, list[j]!));
    for (const other of rest) min = Math.min(min, ciede2000(list[i]!, other));
  }
  return min;
};

describe("minimum empire colour distance (owner rule 2026-11-27: rival pale pink read as own)", () => {
  test("the 20 default AIs are each at least MIN_EMPIRE_COLOR_DELTA_E apart", async () => {
    // The old seeding left two of them 5.1 apart (CIEDE2000).
    expect(closestDeltaE((await seeded(TWENTY_AI_IDS)).values())).toBeGreaterThanOrEqual(MIN_EMPIRE_COLOR_DELTA_E);
  });

  test("AIs keep the distance from active human colours too", () => {
    const humans = new Set(["#fabebe", "#1f77b4", "#39ff14", "#ff5722"]);
    const colors = assignAiColors(TWENTY_AI_IDS, defaultHouseCrestFor, humans);
    expect(closestDeltaE(colors.values(), humans)).toBeGreaterThanOrEqual(MIN_EMPIRE_COLOR_DELTA_E);
  });

  test("seeding only counts active human empires as taken", async () => {
    const now = 1_800_000_000_000;
    const humans = await humanColorsForAiSeeding(new Set(["ai-1"]), {
      now: () => now,
      profileStore: {
        listAllNamed: async () => [
          { playerId: "ai-1", name: "Alden", tileColor: "#ff0000", updatedAt: now },
          { playerId: "ai-30", name: "Old AI", tileColor: "#00ff00", updatedAt: now },
          { playerId: "human-recent", name: "Rosa", tileColor: "#FABEBE", updatedAt: now - 1000 },
          { playerId: "human-gone", name: "Gone", tileColor: "#123456", updatedAt: now - 60 * 24 * 3600 * 1000 }
        ]
      },
      profileOverrides: { entries: () => new Map([["human-live", { tileColor: "#3f51b5" }]]).entries() }
    });
    expect([...humans].sort()).toEqual(["#3f51b5", "#fabebe"]);
  });
});
