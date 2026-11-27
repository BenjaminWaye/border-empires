import { describe, expect, it, vi } from "vitest";
import type { PlayerCosmeticSelection } from "@border-empires/shared";

import { addMusterFlagForTile } from "./client-map-3d-muster-fill.js";

const place = { sceneX: 1, sceneZ: 2, surfaceY: 0.5, wx: 10, wy: 20, tileKey: "10,20", siegeResolvesAt: 9_000 };

const run = (ownerId: string, cosmetics: Array<[string, PlayerCosmeticSelection]>, mode: "HOLD" | "ADVANCE" = "HOLD") => {
  const addMuster = vi.fn();
  addMusterFlagForTile(
    { addMuster },
    { ownerId, muster: { ownerId, amount: 50, mode, updatedAt: 0 } },
    place,
    {
      state: { me: "me", manpowerCap: 1_000, manpower: 500, musterAmountRateByTile: new Map(), playerCosmetics: new Map(cosmetics) },
      effectiveOverlayColor: (id) => (id === "me" ? "#00ff00" : "#ff0000")
    }
  );
  return addMuster.mock.calls[0] as unknown[];
};

describe("addMusterFlagForTile", () => {
  it("draws the standard flag for an owner with no cosmetic", () => {
    expect(run("rival", [])[9]).toBe("default");
  });

  it("draws the owner's chosen design for every viewer, not the viewer's own", () => {
    expect(run("rival", [["rival", { musterFlag: "flag-high-noble" }]])[9]).toBe("flag-high-noble");
    expect(run("rival", [["me", { musterFlag: "flag-high-noble" }]])[9]).toBe("default");
  });

  it("a cosmetic changes nothing a rival reads: fill, owner colour, ADVANCE and position are identical", () => {
    for (const mode of ["HOLD", "ADVANCE"] as const) {
      const standard = run("rival", [], mode);
      const cosmetic = run("rival", [["rival", { musterFlag: "flag-high-noble" }]], mode);
      expect(cosmetic.slice(0, 9)).toEqual(standard.slice(0, 9));
      expect(standard[5]).toBe(mode === "ADVANCE");
    }
  });

  it("shows the siege ring timing only on the viewer's own flag", () => {
    expect(run("me", [])[8]).toBe(9_000);
    expect(run("rival", [])[8]).toBe(0);
  });

  it("carries the owner's House crest, yours and rivals' alike, and nothing for a House without one", () => {
    expect(run("rival", [["rival", { crest: "crest-kraken" }]])[10]).toBe("crest-kraken");
    expect(run("me", [["me", { crest: "crest-anchor" }]])[10]).toBe("crest-anchor");
    expect(run("rival", [["me", { crest: "crest-anchor" }]])[10]).toBeUndefined();
    // A crest changes nothing a rival reads either.
    expect(run("rival", [["rival", { crest: "crest-kraken" }]]).slice(0, 10)).toEqual(run("rival", []).slice(0, 10));
  });
});
