import { describe, expect, it } from "vitest";
import type { DockPair, Tile, TileMenuView } from "../client-types.js";
import { connectedDockStops, crossDockTarget, dispatchDockCrossAction, findCrossTarget, injectDockCrossAction, injectDockNavigatorRow, stepDockNavigator } from "./client-dock-navigator.js";

const routeOfLength = (hops: number): Array<{ x: number; y: number }> => Array.from({ length: hops + 1 }, (_, i) => ({ x: i, y: 0 }));

// Origin dock at (10, 10) linked to three docks; the second pair lists the
// origin as its "b" end to cover both orientations.
const dockPairs: DockPair[] = [
  { ax: 10, ay: 10, bx: 40, by: 10, route: routeOfLength(30) },
  { ax: 15, ay: 12, bx: 10, by: 10, route: routeOfLength(7) },
  { ax: 10, ay: 10, bx: 10, by: 30, route: routeOfLength(20) },
  { ax: 99, ay: 99, bx: 98, by: 98 } // unrelated pair
];

const discovery = { fogDisabled: false, discoveredDockTiles: new Set(["10,10", "40,10", "15,12", "10,30", "13,14"]) };
const makeState = () => ({ ...discovery, dockPairs, camX: 10, camY: 10, camSubX: 0.3, camSubY: 0.4, me: "me", tiles: new Map<string, Tile>() });

const makeView = (): TileMenuView => ({ title: "", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] });

describe("connectedDockStops", () => {
  it("lists every dock linked to the selected one, nearest by sea route first", () => {
    expect(connectedDockStops(dockPairs, 10, 10).map((stop) => [stop.x, stop.y, stop.distance])).toEqual([
      [15, 12, 7],
      [10, 30, 20],
      [40, 10, 30]
    ]);
  });

  it("says 'away' rather than 'by sea' when no route was shipped for a link", () => {
    const state = { ...discovery, dockPairs: [{ ax: 10, ay: 10, bx: 13, by: 14 }], camX: 10, camY: 10, camSubX: 0, camSubY: 0, me: "me", tiles: new Map<string, Tile>() };
    expect(stepDockNavigator(state, 10, 10, "next")).toBe("Dock 1/1 · 7 tiles away");
  });

  it("is empty for a tile with no dock links", () => {
    expect(connectedDockStops(dockPairs, 1, 1)).toEqual([]);
  });
});

describe("stepDockNavigator", () => {
  it("steps the camera through connected docks in order and wraps around", () => {
    const state = makeState();
    expect(stepDockNavigator(state, 10, 10, "next")).toBe("Dock 1/3 · 7 tiles by sea");
    expect([state.camX, state.camY, state.camSubX, state.camSubY]).toEqual([15, 12, 0, 0]);
    stepDockNavigator(state, 10, 10, "next");
    expect([state.camX, state.camY]).toEqual([10, 30]);
    stepDockNavigator(state, 10, 10, "next");
    stepDockNavigator(state, 10, 10, "next");
    expect([state.camX, state.camY]).toEqual([15, 12]);
  });

  it("goes to the farthest-listed dock when stepping back from the origin", () => {
    const state = makeState();
    stepDockNavigator(state, 10, 10, "prev");
    expect([state.camX, state.camY]).toEqual([40, 10]);
  });

  it("returns the camera to the origin dock on Back", () => {
    const state = makeState();
    stepDockNavigator(state, 10, 10, "next");
    expect(stepDockNavigator(state, 10, 10, "home")).toBe("3 connected docks");
    expect([state.camX, state.camY]).toEqual([10, 10]);
  });
});

describe("injectDockNavigatorRow", () => {
  it("adds one navigator row to a linked dock's menu", () => {
    const view = makeView();
    const tile = { x: 10, y: 10, dockId: "dock-1" } as Tile;
    injectDockNavigatorRow(view, tile, makeState());
    injectDockNavigatorRow(view, tile, makeState());
    expect(view.overviewLines).toHaveLength(1);
    expect(view.overviewLines[0]!.html).toContain('data-dock-nav-origin="10,10"');
  });

  it("adds nothing for a non-dock tile", () => {
    const view = makeView();
    injectDockNavigatorRow(view, { x: 10, y: 10 } as Tile, makeState());
    expect(view.overviewLines).toHaveLength(0);
  });
});


describe("undiscovered connected docks", () => {
  it("does not show navigation or move the camera from an enemy dock to hidden links", () => {
    const state = { ...makeState(), discoveredDockTiles: new Set(["10,10"]) };
    const view = makeView();
    injectDockNavigatorRow(view, { x: 10, y: 10, terrain: "LAND", dockId: "a", ownerId: "enemy", ownershipState: "SETTLED" }, state);
    expect(view.overviewLines).toEqual([]);
    expect(stepDockNavigator(state, 10, 10, "next")).toBeUndefined();
    expect([state.camX, state.camY]).toEqual([10, 10]);
  });

  it("allows navigation as linked docks are discovered after garrisoning", () => {
    const state = { ...makeState(), discoveredDockTiles: new Set(["10,10", "15,12"]) };
    expect(stepDockNavigator(state, 10, 10, "next")).toBe("Dock 1/1 · 7 tiles by sea");
    expect([state.camX, state.camY]).toEqual([15, 12]);
  });
});

// Playtest Run 4: Mark held a dock for two days on an island and never crossed; nothing said the dock was the way off.
describe("Cross the sea", () => {
  const dockTile = (x: number, y: number, ownerId?: string, ownershipState: Tile["ownershipState"] = "SETTLED"): Tile =>
    ({ x, y, terrain: "LAND", dockId: `d${x}${y}`, ...(ownerId ? { ownerId, ownershipState } : {}) } as Tile);
  /** Every dock in the fixture is known to the client; the listed ones are your garrisoned docks. */
  const withOwned = (...keys: Array<[number, number]>) => {
    const state = { ...makeState(), allies: [] as string[], activeTruces: [] as NonNullable<Parameters<typeof findCrossTarget>[0]["activeTruces"]> };
    for (const [x, y] of [[10, 10], [15, 12], [10, 30], [40, 10], [1, 1], [2, 2], [9, 9]] as Array<[number, number]>) state.tiles.set(`${x},${y}`, dockTile(x, y));
    for (const [x, y] of keys) state.tiles.set(`${x},${y}`, dockTile(x, y, "me"));
    return state;
  };

  it("is a tile action on your own garrisoned dock when a lane leads to new ground, never on someone else's", () => {
    const mine = makeView();
    injectDockCrossAction(mine, dockTile(10, 10, "me"), withOwned([10, 10]));
    expect(mine.actions[0]).toMatchObject({ id: "dock_cross_sea", label: "Cross the sea", cost: "7 tiles" });
    const theirs = makeView();
    injectDockCrossAction(theirs, dockTile(10, 10, "rival"), withOwned());
    expect(theirs.actions).toEqual([]);
  });

  // Review of PR #2942: on a frontier dock Garrison must stay the main button, and only a garrisoned dock reveals its lanes.
  it("isn't offered on your frontier dock", () => {
    const state = withOwned();
    state.tiles.set("10,10", dockTile(10, 10, "me", "FRONTIER"));
    const view = makeView();
    injectDockCrossAction(view, dockTile(10, 10, "me", "FRONTIER"), state);
    expect(view.actions).toEqual([]);
  });

  it("pressed, selects the far dock and opens its sheet", () => {
    const state = { ...withOwned([10, 10]), selected: { x: 10, y: 10 } as { x: number; y: number } | undefined };
    const opened: Tile[] = [];
    expect(dispatchDockCrossAction("dock_cross_sea", { x: 10, y: 10 }, state, (t) => opened.push(t))).toBe(true);
    expect(state.selected).toEqual({ x: 15, y: 12 });
    expect([state.camX, state.camY]).toEqual([15, 12]);
    expect(opened.map((t) => `${t.x},${t.y}`)).toEqual(["15,12"]);
    expect(dispatchDockCrossAction("build_fort", { x: 10, y: 10 }, state, () => undefined)).toBe(false);
  });

  it("goes to the nearest dock you don't own, or the one the navigator is showing", () => {
    const state = withOwned([10, 10]);
    expect(crossDockTarget(state, 10, 10)).toMatchObject({ x: 15, y: 12 });
    stepDockNavigator(state, 10, 10, "next");
    expect(crossDockTarget(state, 10, 10)).toMatchObject({ x: 10, y: 30 });
  });

  it("skips a lane that ends at your own dock", () => {
    expect(findCrossTarget(withOwned([10, 10], [15, 12]), 10, 10)).toMatchObject({ x: 10, y: 30 });
  });

  // Review of PR #2942: an ally's or truce partner's dock offers neither Expand To nor Attack.
  it("skips an ally's and a truce partner's dock", () => {
    const state = withOwned([10, 10]);
    state.tiles.set("15,12", dockTile(15, 12, "friend"));
    state.tiles.set("10,30", dockTile(10, 30, "pact"));
    state.allies = ["friend"];
    state.activeTruces = [{ otherPlayerId: "pact", otherPlayerName: "Pact", startedAt: 0, endsAt: 1, createdByPlayerId: "pact" }];
    expect(findCrossTarget(state, 10, 10)).toMatchObject({ x: 40, y: 10 });
  });

  // Review of PR #2942: a far dock the client has no data for would select it but open nothing.
  it("never targets a far dock the client doesn't have", () => {
    const state = withOwned([10, 10]);
    state.tiles.delete("15,12");
    state.tiles.delete("10,30");
    state.tiles.delete("40,10");
    expect(findCrossTarget(state, 10, 10)).toBeUndefined();
  });

  // Mark's case: his only lane joined his own two docks. Follow the chain out from the far one.
  it("follows a lane to your own dock onward to the first new ground, and counts the whole route", () => {
    const pairs: DockPair[] = [{ ax: 1, ay: 1, bx: 2, by: 2, route: routeOfLength(60) }, { ax: 2, ay: 2, bx: 9, by: 9, route: routeOfLength(5) }];
    const state = { ...withOwned([1, 1], [2, 2]), dockPairs: pairs, camX: 1, camY: 1 };
    expect(findCrossTarget(state, 1, 1)).toMatchObject({ x: 9, y: 9, distance: 65 });
  });

  it("offers no button when every lane only joins your own docks", () => {
    const pairs: DockPair[] = [{ ax: 1, ay: 1, bx: 2, by: 2 }];
    const state = { ...withOwned([1, 1], [2, 2]), dockPairs: pairs, camX: 1, camY: 1 };
    expect(findCrossTarget(state, 1, 1)).toBeUndefined();
    const view = makeView();
    injectDockCrossAction(view, dockTile(1, 1, "me"), state);
    expect(view.actions).toEqual([]);
  });

  // Mark's Connected docks row was missing: the far end wasn't in this device's discoveredDockTiles.
  it("lists your garrisoned dock's lanes even when this device never discovered the far end", () => {
    const state = { ...withOwned([10, 10]), discoveredDockTiles: new Set<string>() };
    const view = makeView();
    injectDockNavigatorRow(view, dockTile(10, 10, "me"), state);
    expect(view.overviewLines.map((l) => l.html).join("")).toContain("3 connected docks");
  });

  it("still hides a stranger's lane whose ends were never discovered", () => {
    const state = { ...withOwned(), discoveredDockTiles: new Set<string>() };
    expect(findCrossTarget(state, 10, 10)).toBeUndefined();
  });
});
