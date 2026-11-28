import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { buildGuideInput, resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { guideIslandDock, GUIDE_ISLAND_TILE_BUDGET } from "./tutorial-guide-island-dock.js";
import { evaluateGuide, GUIDE_STEPS } from "./tutorial-guide-steps.js";

const ME = "me";
const HOME = { x: 12, y: 12 };
const DOCK = { x: 14, y: 14 };

/** A 5x5 island (10..14) ringed by sea out to 8..16; the player holds its middle, a free dock sits on its corner. */
const islandTiles = (options: { dropSeaAt?: { x: number; y: number }; dock?: Partial<Tile> | null } = {}): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 8; y <= 16; y++) {
    for (let x = 8; x <= 16; x++) {
      if (options.dropSeaAt && options.dropSeaAt.x === x && options.dropSeaAt.y === y) continue;
      const land = x >= 10 && x <= 14 && y >= 10 && y <= 14;
      const tile: Tile = { x, y, terrain: land ? "LAND" : "SEA" };
      if (Math.abs(x - HOME.x) <= 1 && Math.abs(y - HOME.y) <= 1) Object.assign(tile, { ownerId: ME, ownershipState: "SETTLED" });
      if (x === DOCK.x && y === DOCK.y && options.dock !== null) Object.assign(tile, { dockId: "dock-1", fogged: true }, options.dock);
      if (x === HOME.x && y === HOME.y) tile.afc = { ownerId: ME, status: "active" };
      tiles.set(tileKey(x, y), tile);
    }
  }
  return tiles;
};

describe("guide island dock", () => {
  it("finds the free dock on a fully seen island, even fogged", () => {
    expect(guideIslandDock(islandTiles(), ME, HOME)).toEqual({ action: "expand", ...DOCK });
  });

  it("asks to Garrison the player's own dock, then Cross the sea once it is garrisoned", () => {
    expect(guideIslandDock(islandTiles({ dock: { ownerId: ME, ownershipState: "FRONTIER" } }), ME, HOME)?.action).toBe("garrison");
    expect(guideIslandDock(islandTiles({ dock: { ownerId: ME, ownershipState: "SETTLED" } }), ME, HOME)?.action).toBe("cross");
  });

  it("is no island while any coast is unseen, and skips a rival's dock", () => {
    expect(guideIslandDock(islandTiles({ dropSeaAt: { x: 9, y: 12 } }), ME, HOME)).toBeUndefined();
    expect(guideIslandDock(islandTiles({ dock: { ownerId: "rival" } }), ME, HOME)).toBeUndefined();
  });

  it("calls land bigger than its budget a continent", () => {
    const tiles = new Map<string, Tile>();
    const side = Math.ceil(Math.sqrt(GUIDE_ISLAND_TILE_BUDGET)) + 4;
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) tiles.set(tileKey(x + 100, y + 100), { x: x + 100, y: y + 100, terrain: "LAND" });
    tiles.set(tileKey(100, 100), { x: 100, y: 100, terrain: "LAND", ownerId: ME, dockId: "d" });
    expect(guideIslandDock(tiles, ME, undefined)).toBeUndefined();
  });

  // Owner playtest 2026-11-27: on an island, the town step flew the drone 4 legs out to a town across the sea
  // that Expand To can't reach. It now points at the island's dock instead.
  it("the town step marks the island's dock instead of the far town lead", () => {
    resetGuideInputCacheForTests();
    const state = createInitialState();
    state.me = ME;
    state.homeTile = HOME;
    state.tiles = islandTiles();
    state.tilesRevision += 1;
    state.guideTownLead = { x: 60, y: 8 };
    const input = buildGuideInput(state);
    const pastLook = new Set(GUIDE_STEPS.filter((s) => s.id.startsWith("look")).map((s) => s.id));
    const view = evaluateGuide({ ...input, scout: "ready" }, pastLook);
    expect(view).toEqual(
      expect.objectContaining({
        step: expect.objectContaining({ id: "foothold-take-town" }),
        title: "You're on an island: tap the marked dock, then Expand To",
        highlightTiles: [DOCK]
      })
    );
    // Also while the drone is already out toward the lead (the screenshot's state).
    const flying = evaluateGuide({ ...input, scout: "out" }, pastLook);
    expect(flying.kind === "step" && flying.title).toBe("You're on an island: tap the marked dock, then Expand To");
  });

  // Owner 2026-11-27: never send the drone more than one leg to a town; that far, the player is probably on an island.
  describe("a town lead more than one drone leg away", () => {
    const view = (tiles: Map<string, Tile>, lead: { x: number; y: number }) => {
      resetGuideInputCacheForTests();
      const state = createInitialState();
      state.me = ME;
      state.homeTile = HOME;
      state.tiles = tiles;
      state.tilesRevision += 1;
      state.guideTownLead = lead;
      const input = buildGuideInput(state);
      const pastLook = new Set(GUIDE_STEPS.filter((s) => s.id.startsWith("look")).map((s) => s.id));
      return { input, view: evaluateGuide({ ...input, scout: "ready", exploreTarget: () => ({ x: 12, y: 20 }) }, pastLook) };
    };
    // Open land: one coast tile never received, so this is not a fully seen island.
    const open = { dropSeaAt: { x: 9, y: 12 } };

    it("is no drone target: the guide marks a dock on the player's land instead", () => {
      const { input, view: far } = view(islandTiles(open), { x: 60, y: 8 });
      expect(input.townLead).toBeUndefined();
      expect(input.townLeadFar).toBe(true);
      // Not a fully seen island, so the copy doesn't claim one.
      expect(far).toEqual(expect.objectContaining({ title: "No town close by: tap the marked dock, then Expand To", highlightTiles: [DOCK] }));
    });

    it("with no dock seen, asks for a nearby Explore to look for one, not the far town", () => {
      const { view: far } = view(islandTiles({ ...open, dock: null }), { x: 60, y: 8 });
      expect(far).toEqual(
        expect.objectContaining({ title: "No town close by: tap the marked ground, then Explore and Go", why: "Look for a dock. On an island, it's how your troops cross the sea.", highlightTiles: [{ x: 12, y: 20 }] })
      );
    });

    it("still flies to a town one leg away", () => {
      const lead = { x: 25, y: 12 };
      const { input, view: near } = view(islandTiles({ ...open, dock: null }), lead);
      expect(input.townLead).toEqual(lead);
      expect(near).toEqual(expect.objectContaining({ title: "Let's try exploring some more: tap the mark, then Explore and Go", highlightTiles: [lead] }));
    });
  });
});
