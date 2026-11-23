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
    expect(run("rival", []).at(-1)).toBe("default");
  });

  it("draws the owner's chosen design for every viewer, not the viewer's own", () => {
    expect(run("rival", [["rival", { musterFlag: "flag-chevron" }]]).at(-1)).toBe("flag-chevron");
    expect(run("rival", [["me", { musterFlag: "flag-chevron" }]]).at(-1)).toBe("default");
  });

  it("a cosmetic changes nothing a rival reads: fill, owner colour, ADVANCE and position are identical", () => {
    for (const mode of ["HOLD", "ADVANCE"] as const) {
      const standard = run("rival", [], mode);
      const cosmetic = run("rival", [["rival", { musterFlag: "flag-chevron" }]], mode);
      expect(cosmetic.slice(0, -1)).toEqual(standard.slice(0, -1));
      expect(standard[5]).toBe(mode === "ADVANCE");
    }
  });

  it("shows the siege ring timing only on the viewer's own flag", () => {
    expect(run("me", [])[8]).toBe(9_000);
    expect(run("rival", [])[8]).toBe(0);
  });
});
