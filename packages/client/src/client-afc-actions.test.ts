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

const moduleRows = (actions: ReturnType<typeof afcModuleActionsForTile>) => actions.filter((action) => action.id.startsWith("redeploy_afc_module:"));

const afcTile = (afc: Partial<NonNullable<Tile["afc"]>>): Tile =>
  ({ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", ...afc } }) as Tile;

describe("afcModuleActionsForTile", () => {
  it("offers Call down for researched modules not docked here, and shows incoming ones with time left", () => {
    const tile = afcTile({ houseModules: ["masonry"], modules: ["masonry"], incomingModules: [{ techId: "workshops", arrivesAt: 31_000 }] });

    const actions = moduleRows(afcModuleActionsForTile(stateWith(["masonry", "workshops", "crystal-lattices", "agriculture"]), tile, availability, 1_000));

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
    const actions = moduleRows(afcModuleActionsForTile(stateWith(["crystal-lattices"]), afcTile({ modules: eight }), availability, 1_000));
    expect(actions).toEqual([
      { id: "redeploy_afc_module:crystal-lattices", label: "Call down Aether Resonance Core", disabled: true, disabledReason: "AFC full (8/8): build another AFC" }
    ]);
  });

  it("leads with Send scout drone on your own active AFC", () => {
    const actions = afcModuleActionsForTile(stateWith([]), afcTile({}), availability, 1_000);
    expect(actions.map((action) => action.id)).toEqual(["afc_scout_drone"]);
    expect(afcModuleActionsForTile(stateWith([]), afcTile({ status: "inactive" }), availability, 1_000)).toEqual([]);
  });

  it("offers nothing on someone else's AFC", () => {
    const tile = { ...afcTile({}), ownerId: "enemy", afc: { ownerId: "enemy", status: "active" } } as Tile;
    expect(afcModuleActionsForTile(stateWith(["masonry"]), tile, availability)).toEqual([]);
  });
});

describe("paid AFC recovery after losing the last one", () => {
  const plain = (ownershipState: "SETTLED" | "FRONTIER", x = 2): Tile => ({ x, y: 1, terrain: "LAND", ownerId: "me", ownershipState }) as Tile;
  const stateOf = (tiles: Tile[]): ClientState => ({ me: "me", gold: 0, tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])) }) as unknown as ClientState;

  it("quotes the shared replacement price, disables unaffordable orders, and accepts FRONTIER sites", () => {
    const frontier = plain("FRONTIER");
    const state = stateOf([frontier]);
    expect(buildAfcActionForTile(state, frontier, availability)).toEqual({ id: "build_afc", label: "Call down replacement AFC", disabled: true, disabledReason: "Need 20 gold", detail: "20 gold · 60-second landing" });
    expect(isValidAfcLandingTile(state, frontier)).toBe(true);
  });

  it("goes back to the paid, AFC-only button once the player owns an AFC", () => {
    const frontier = plain("FRONTIER");
    const state = stateOf([frontier, afcTile({})]);
    expect(buildAfcActionForTile(state, frontier, availability)).toBeUndefined();
    expect(isValidAfcLandingTile(state, frontier)).toBe(false);
  });
});

describe("Build AFC on empty land", () => {
  const plain = (x: number): Tile => ({ x, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }) as Tile;
  const withModules = (count: number): Tile => afcTile({ modules: ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, count) });
  const richState = (tiles: Tile[]): ClientState => ({ me: "me", gold: 10_000, tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])) }) as unknown as ClientState;

  // Owner request 2026-11-14: Build AFC sat on the AFC itself, from the first module. It belongs on the
  // empty tile the new AFC lands on, once one of your AFCs has 6 modules docked.
  it("is offered on an empty tile once an AFC has 6 modules, never on the AFC itself", () => {
    const afc = withModules(6);
    const empty = plain(10);
    const state = richState([afc, empty]);
    expect(buildAfcActionForTile(state, empty, availability)).toMatchObject({ id: "build_afc", label: "Build AFC", disabled: false });
    expect(buildAfcActionForTile(state, afc, availability)).toBeUndefined();
  });

  it("is hidden while every AFC has fewer than 6 modules docked, counting none in transit", () => {
    const empty = plain(10);
    expect(buildAfcActionForTile(richState([withModules(5), empty]), empty, availability)).toBeUndefined();
    const arriving = afcTile({ modules: ["a", "b", "c", "d", "e"], incomingModules: [{ techId: "f", arrivesAt: 1 }] });
    expect(buildAfcActionForTile(richState([arriving, empty]), empty, availability)).toBeUndefined();
  });

  it("is hidden on a tile that can't take an AFC", () => {
    const frontier = { ...plain(10), ownershipState: "FRONTIER" } as Tile;
    expect(buildAfcActionForTile(richState([withModules(6), frontier]), frontier, availability)).toBeUndefined();
  });
});
