import { describe, expect, it } from "vitest";
import type { DockPair, Tile, TileMenuView } from "../client-types.js";
import { connectedDockStops, injectDockNavigatorRow, stepDockNavigator } from "./client-dock-navigator.js";

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
const makeState = () => ({ ...discovery, dockPairs, camX: 10, camY: 10, camSubX: 0.3, camSubY: 0.4 });

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
    const state = { ...discovery, dockPairs: [{ ax: 10, ay: 10, bx: 13, by: 14 }], camX: 10, camY: 10, camSubX: 0, camSubY: 0 };
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
