import { describe, expect, test } from "vitest";
import { MIN_EMPIRE_COLOR_DELTA_E, ciede2000 } from "@border-empires/shared";
import { ACTIVE_EMPIRE_WINDOW_MS, buildTakenColorSet } from "./build-taken-color-set.js";
import { colorPickRejection } from "./color-pick-rejection.js";
import { assignUniqueColor, pickSuggestedPalette, suggestAlternative } from "./player-color-allocation.js";
import { TakenColorSet } from "./taken-color-set.js";

const NOW = 1_800_000_000_000;

const takenWith = (empires: Array<{ playerId: string; name?: string; color: string }>): TakenColorSet =>
  new TakenColorSet(empires.map((empire) => empire.color), empires);

describe("buildTakenColorSet", () => {
  const deps = {
    now: () => NOW,
    profileStore: {
      listAllNamed: async () => [
        { playerId: "me", name: "Me", tileColor: "#00ff00", updatedAt: NOW },
        { playerId: "rosa", name: "Rosa", tileColor: "#FABEBE", updatedAt: NOW - 1000 },
        { playerId: "old", name: "Old", tileColor: "#1f77b4", updatedAt: NOW - ACTIVE_EMPIRE_WINDOW_MS - 1 }
      ]
    },
    profileOverrides: { entries: () => new Map([["ai-1", { tileColor: "#3f51b5" }]]).entries() }
  };

  test("active empires: recent profiles and live overrides, never the player themself", async () => {
    const taken = await buildTakenColorSet("me", deps);
    const active = taken.activeEmpires.map((empire) => `${empire.playerId}:${empire.name}:${empire.color}`).sort();
    expect(active).toEqual(["ai-1:Alden:#3f51b5", "rosa:Rosa:#fabebe"]);
  });

  test("an inactive profile still blocks its exact colour", async () => {
    const taken = await buildTakenColorSet("me", deps);
    expect(taken.has("#1f77b4")).toBe(true);
    expect(taken.has("#00ff00")).toBe(false);
  });
});

describe("colorPickRejection", () => {
  const taken = takenWith([{ playerId: "rosa", name: "Rosa", color: "#fabebe" }]);

  test("rejects a pale pink next to a rival's pale pink (playtest 2026-11-27) with a terse reason", () => {
    // #f7b6d2 is 9.4 from #fabebe: the pair the playtester mixed up.
    const rejection = colorPickRejection("#f7b6d2", taken);
    expect(rejection?.message).toBe("Too close to Rosa's colour.");
    expect(ciede2000(rejection!.suggestion, "#fabebe")).toBeGreaterThanOrEqual(MIN_EMPIRE_COLOR_DELTA_E);
  });

  test("an exact match is still 'already taken'", () => {
    expect(colorPickRejection("#fabebe", taken)?.message).toBe("That colour is already taken by another empire.");
  });

  test("accepts a colour far enough from every active empire", () => {
    expect(colorPickRejection("#1f77b4", taken)).toBeUndefined();
  });

  test("a plain Set only checks exact colours", () => {
    expect(colorPickRejection("#f7b6d2", new Set(["#fabebe"]))).toBeUndefined();
  });

  test("names ending in s take a bare apostrophe", () => {
    const rejection = colorPickRejection("#f7b6d2", takenWith([{ playerId: "silas", name: "Silas", color: "#fabebe" }]));
    expect(rejection?.message).toBe("Too close to Silas' colour.");
  });
});

describe("allocation keeps the minimum distance", () => {
  const taken = takenWith([
    { playerId: "a", color: "#fabebe" },
    { playerId: "b", color: "#1f77b4" },
    { playerId: "c", color: "#f3c300" },
    { playerId: "d", color: "#00ffff" }
  ]);
  const farFromAll = (hex: string): boolean => taken.activeEmpires.every((empire) => ciede2000(hex, empire.color) >= MIN_EMPIRE_COLOR_DELTA_E);

  test("suggested swatches are all far enough", () => {
    const suggestions = pickSuggestedPalette(6, taken);
    expect(suggestions).toHaveLength(6);
    for (const hex of suggestions) expect(farFromAll(hex)).toBe(true);
  });

  test("a suggested alternative is far enough", () => {
    expect(farFromAll(suggestAlternative("#f7b6d2", taken))).toBe(true);
  });

  test("an auto-assigned guest colour is far enough", () => {
    for (const seed of ["guest-1", "guest-2", "guest-3"]) expect(farFromAll(assignUniqueColor(seed, taken))).toBe(true);
  });

  test("a full map still hands a guest a colour nobody holds exactly", () => {
    const crowded = takenWith(Array.from({ length: 400 }, (_, i) => ({ playerId: `p${i}`, color: `#${(i * 40_000 + 0x101010).toString(16).slice(-6).padStart(6, "0")}` })));
    const color = assignUniqueColor("guest-9", crowded);
    expect(crowded.has(color)).toBe(false);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
