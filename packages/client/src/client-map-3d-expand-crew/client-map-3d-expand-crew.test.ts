import { describe, expect, it } from "vitest";
import { expandCrewArmour } from "./client-map-3d-expand-crew.js";
import type { ClientState } from "../client-state/client-state.js";

const stateWith = (tiles: Array<{ x: number; y: number; ownerId: string; type?: string }>, revision: number, lancet = false) =>
  ({
    me: "me",
    playerCosmetics: new Map(lancet ? [["me", { ancillaries: "ancillaries-lancet-guard" }]] : []),
    tilesRevision: revision,
    tiles: new Map(
      tiles.map((t) => [`${t.x},${t.y}`, { x: t.x, y: t.y, terrain: "LAND", ownerId: t.ownerId, ...(t.type ? { economicStructure: { type: t.type } } : {}) }])
    )
  }) as unknown as Pick<ClientState, "tiles" | "me" | "tilesRevision" | "playerCosmetics">;

describe("expandCrewArmour", () => {
  it("wears the standard armour without a Titanium Weapons Factory", () => {
    expect(expandCrewArmour(stateWith([{ x: 1, y: 1, ownerId: "me", type: "UMBRITE_WEAPONS_FACTORY" }], 1))).toBe("standard");
  });

  it("wears the heavy armour the player's attack soldiers wear once it owns a Titanium Weapons Factory", () => {
    expect(expandCrewArmour(stateWith([{ x: 1, y: 1, ownerId: "me", type: "TITANIUM_WEAPONS_FACTORY" }], 2))).toBe("heavy");
  });

  it("ignores another empire's factory", () => {
    expect(expandCrewArmour(stateWith([{ x: 1, y: 1, ownerId: "rival", type: "TITANIUM_WEAPONS_FACTORY" }], 3))).toBe("standard");
  });

  it("wears the Lancet guard when the player shows it, unless titanium armour must show", () => {
    expect(expandCrewArmour(stateWith([], 4, true))).toBe("lancet");
    expect(expandCrewArmour(stateWith([{ x: 1, y: 1, ownerId: "me", type: "TITANIUM_WEAPONS_FACTORY" }], 5, true))).toBe("heavy");
  });
});
