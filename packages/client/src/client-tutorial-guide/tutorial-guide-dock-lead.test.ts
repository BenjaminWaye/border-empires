import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { buildGuideInput, resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { guideDockLead } from "./tutorial-guide-dock-lead.js";
import { evaluateGuide, GUIDE_STEPS } from "./tutorial-guide-steps.js";

const ME = "me";
const HOME = { x: 12, y: 12 };
/** The coast tile never received: the dock the lead should find sits there. */
const UNSEEN_DOCK = { x: 9, y: 12 };

/** A 5x5 island (10..14) in a sea from 6 to 20, one coast tile (UNSEEN_DOCK) never received, an islet at (18,18). */
const world = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 6; y <= 20; y++) {
    for (let x = 6; x <= 20; x++) {
      if (x === UNSEEN_DOCK.x && y === UNSEEN_DOCK.y) continue;
      const land = (x >= 10 && x <= 14 && y >= 10 && y <= 14) || (x === 18 && y === 18);
      const tile: Tile = { x, y, terrain: land ? "LAND" : "SEA" };
      if (Math.abs(x - HOME.x) <= 1 && Math.abs(y - HOME.y) <= 1) Object.assign(tile, { ownerId: ME, ownershipState: "SETTLED" });
      if (x === HOME.x && y === HOME.y) tile.afc = { ownerId: ME, status: "active" };
      if (x === 18 && y === 18) tile.dockId = "islet";
      tiles.set(tileKey(x, y), tile);
    }
  }
  return tiles;
};

const pairs = [
  { ax: UNSEEN_DOCK.x, ay: UNSEEN_DOCK.y, bx: 60, by: 60 },
  { ax: 18, ay: 18, bx: 61, by: 61 }
];

const anyLeg = (): boolean => true;

describe("guide dock lead", () => {
  it("picks the nearest unexplored dock the player could walk to, from the world's dock list", () => {
    expect(guideDockLead(world(), new Set(), ME, HOME, pairs, anyLeg)).toEqual(UNSEEN_DOCK);
  });

  // QA review of PR #3029: a seen dock not on the player's known land may lie across water, so Expand To there
  // could fail; and a dock beyond one leg would be pulled back to the leg range every flight, never reached.
  it("skips a dock the player has seen, and one beyond a drone leg", () => {
    const tiles = world();
    tiles.set(tileKey(UNSEEN_DOCK.x, UNSEEN_DOCK.y), { ...UNSEEN_DOCK, terrain: "LAND", dockId: "d" });
    // The islet dock (18,18) is seen too; only (60,60) and (61,61) are left, both unexplored.
    expect(guideDockLead(tiles, new Set(), ME, HOME, pairs, anyLeg)).toEqual({ x: 60, y: 60 });
    expect(guideDockLead(world(), new Set([tileKey(UNSEEN_DOCK.x, UNSEEN_DOCK.y)]), ME, HOME, pairs, anyLeg)?.x).not.toBe(UNSEEN_DOCK.x);
    expect(guideDockLead(world(), new Set(), ME, HOME, pairs, (dock) => dock.x < 20)).toEqual(UNSEEN_DOCK);
    expect(guideDockLead(world(), new Set(), ME, HOME, pairs, () => false)).toBeUndefined();
  });

  it("skips a dock across water the player has seen", () => {
    // An unseen dock on a known LAND tile ringed by seen sea: no overland route.
    const tiles = world();
    tiles.delete(tileKey(18, 18));
    expect(guideDockLead(tiles, new Set(), ME, HOME, [{ ax: 18, ay: 18, bx: 13, by: 30 }], anyLeg)).toEqual({ x: 13, y: 30 });
  });

  // Owner 2026-11-27: like the town lead, when the nearest town is too far for one drone leg and no dock shows,
  // the guide marks where the closest dock is and asks for Explore there.
  it("the town step marks the dock lead for Explore, then waits while the drone flies", () => {
    resetGuideInputCacheForTests();
    const state = createInitialState();
    state.me = ME;
    state.homeTile = HOME;
    state.tiles = world();
    state.tilesRevision += 1;
    state.dockPairs = pairs;
    state.guideTownLead = { x: 70, y: 12 };
    const input = buildGuideInput(state);
    expect(input.townLeadFar).toBe(true);
    const pastLook = new Set(GUIDE_STEPS.filter((s) => s.id.startsWith("look")).map((s) => s.id));
    const ready = evaluateGuide({ ...input, scout: "ready" }, pastLook);
    expect(ready).toEqual(expect.objectContaining({ title: "Find a dock: tap the mark, then Explore and Go", highlightTiles: [UNSEEN_DOCK] }));
    const flying = evaluateGuide({ ...input, scout: "out" }, pastLook);
    expect(flying).toEqual(expect.objectContaining({ title: "Your drone is flying: wait for its report", highlightTiles: [] }));
  });
});
