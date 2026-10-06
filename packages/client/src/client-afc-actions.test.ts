import { describe, expect, it } from "vitest";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";
import { afcModuleActionsForTile, buildAfcActionForTile, isValidAfcLandingTile } from "./client-afc-actions.js";

const availability = (enabled: boolean, reason: string, detail?: string) => ({
  disabled: !enabled,
  ...(reason ? { disabledReason: reason } : {}),
  ...(detail ? { detail } : {})
});

const stateWith = (techIds: string[]): ClientState =>
  ({
    me: "me",
    techIds,
    techCatalog: [
      { id: "masonry", name: "Masonry", manifestCategory: "AFC_MODULE" },
      { id: "workshops", name: "Workshops", manifestCategory: "AFC_MODULE" },
      { id: "crystal-lattices", name: "Aether Resonance Core", manifestCategory: "AFC_MODULE" },
      { id: "agriculture", name: "Agriculture" }
    ]
  }) as unknown as ClientState;

const afcTile = (afc: Partial<NonNullable<Tile["afc"]>>): Tile =>
  ({ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", ...afc } }) as Tile;

describe("afcModuleActionsForTile", () => {
  it("offers Call down for researched modules not docked here, and shows incoming ones with time left", () => {
    const tile = afcTile({ houseModules: ["masonry"], modules: ["masonry"], incomingModules: [{ techId: "workshops", arrivesAt: 31_000 }] });

    const actions = afcModuleActionsForTile(stateWith(["masonry", "workshops", "crystal-lattices", "agriculture"]), tile, availability, 1_000);

    expect(actions).toEqual([
      { id: "redeploy_afc_module:workshops", label: "Workshops incoming", disabled: true, disabledReason: "Lands in 30s" },
      {
        id: "redeploy_afc_module:crystal-lattices",
        label: "Call down Aether Resonance Core",
        disabled: false,
        detail: "Lands here in 1m • leaves its current AFC now"
      }
    ]);
  });

  it("disables Call down onto an AFC that already holds 8 modules", () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const actions = afcModuleActionsForTile(stateWith(["crystal-lattices"]), afcTile({ modules: eight }), availability, 1_000);
    expect(actions).toEqual([
      { id: "redeploy_afc_module:crystal-lattices", label: "Call down Aether Resonance Core", disabled: true, disabledReason: "AFC full (8/8): build another AFC" }
    ]);
  });

  it("offers nothing on someone else's AFC", () => {
    const tile = { ...afcTile({}), ownerId: "enemy", afc: { ownerId: "enemy", status: "active" } } as Tile;
    expect(afcModuleActionsForTile(stateWith(["masonry"]), tile, availability)).toEqual([]);
  });
});

describe("free AFC rebuild after losing the last one", () => {
  const plain = (ownershipState: "SETTLED" | "FRONTIER", x = 2): Tile => ({ x, y: 1, terrain: "LAND", ownerId: "me", ownershipState }) as Tile;
  const stateOf = (tiles: Tile[]): ClientState => ({ me: "me", gold: 0, tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])) }) as unknown as ClientState;

  it("offers Build AFC for free on any owned tile, even with no Coin, and accepts FRONTIER landing tiles", () => {
    const frontier = plain("FRONTIER");
    const state = stateOf([frontier]);
    expect(buildAfcActionForTile(state, frontier, availability)).toEqual({ id: "build_afc", label: "Build AFC", disabled: false, detail: "Free: your last AFC was lost" });
    expect(isValidAfcLandingTile(state, frontier)).toBe(true);
  });

  it("goes back to the paid, AFC-only button once the player owns an AFC", () => {
    const frontier = plain("FRONTIER");
    const state = stateOf([frontier, afcTile({})]);
    expect(buildAfcActionForTile(state, frontier, availability)).toBeUndefined();
    expect(isValidAfcLandingTile(state, frontier)).toBe(false);
  });
});
