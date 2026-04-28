import { describe, expect, it } from "vitest";
import { createInitialState } from "./client-state.js";
import { createClientOriginSelection } from "./client-origin-selection.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const createSelector = () => {
  const state = createInitialState();
  state.me = "me";
  return {
    state,
    selector: createClientOriginSelection({
      state,
      keyFor,
      wrapX: (x) => wrap(x, 450),
      wrapY: (y) => wrap(y, 450)
    })
  };
};

const addTile = (state: ReturnType<typeof createInitialState>, tile: Tile): void => {
  state.tiles.set(keyFor(tile.x, tile.y), tile);
};

describe("createClientOriginSelection", () => {
  it("prefers the adjacent origin with the strongest attack multiplier", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 10, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    addTile(state, {
      x: 11,
      y: 10,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "LIGHT_OUTPOST", status: "active" }
    });

    expect(selector.pickOriginForTarget(10, 10)).toMatchObject({ x: 11, y: 10 });
  });

  it("applies owned outpost attack bonuses when ranking siege outposts", () => {
    const { state, selector } = createSelector();
    state.techIds = ["outpost-doctrine"];
    state.techCatalog = [
      {
        id: "outpost-doctrine",
        name: "Outpost Doctrine",
        tier: 1,
        description: "",
        mods: {},
        effects: { outpostAttackMult: 1.2 },
        requirements: { gold: 0, resources: {} }
      }
    ];
    addTile(state, { x: 20, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    addTile(state, {
      x: 20,
      y: 19,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "LIGHT_OUTPOST", status: "active" }
    });
    addTile(state, {
      x: 21,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      siegeOutpost: { ownerId: "me", status: "active" }
    });

    expect(selector.pickOriginForTarget(20, 20)).toMatchObject({ x: 21, y: 20 });
  });
});
