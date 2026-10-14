import { describe, expect, it, vi } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { createDockRouteSync, dockRouteScenePaths, syncDockRouteOverlay } from "./client-map-3d-dock-route-sync.js";
import type { ClientState } from "./client-state/client-state.js";
import type { DockPair } from "./client-types.js";
import type { DockRouteOverlay } from "./client-map-3d-dock-route-overlay.js";

const makeOverlay = (): DockRouteOverlay => ({
  clear: vi.fn(),
  addPath: vi.fn(),
  commit: vi.fn(),
  tick: vi.fn(),
  dispose: vi.fn()
});

const makeState = (overrides: Partial<ClientState>): ClientState => ({ camX: 0, camY: 0, dockPairs: [], ...overrides }) as ClientState;

const sceneOrigin = { camX: 0, camY: 0 };

const pair: DockPair = { ax: 1, ay: 1, bx: 3, by: 1 };
const route = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 }
];

const addedPaths = (overlay: DockRouteOverlay): Array<Array<{ x: number; z: number }>> =>
  (overlay.addPath as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as Array<{ x: number; z: number }>);

describe("syncDockRouteOverlay", () => {
  it("adds one continuous path per route when the pairing is selected and visible", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, overlay, () => route, () => true);
    expect(addedPaths(overlay)).toHaveLength(1);
    expect(addedPaths(overlay)[0]).toHaveLength(route.length);
  });

  it("adds nothing when nothing is selected", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: undefined, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, overlay, () => route, () => true);
    expect(overlay.addPath).not.toHaveBeenCalled();
  });

  it("adds nothing when the pairing is not selected", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 99, y: 99 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, overlay, () => route, () => true);
    expect(overlay.addPath).not.toHaveBeenCalled();
  });

  it("adds nothing when the route is not visible for the player", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, overlay, () => route, () => false);
    expect(overlay.addPath).not.toHaveBeenCalled();
  });

  it("does not bridge a hop that is not an adjacent step", () => {
    const overlay = makeOverlay();
    const brokenRoute = [
      { x: 1, y: 1 },
      { x: 200, y: 1 } // far across the world -- must not draw a line straight across the map
    ];
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, overlay, () => brokenRoute, () => true);
    expect(overlay.addPath).not.toHaveBeenCalled();
  });

  it("draws a line for every pairing that has the selected dock as an endpoint, not just the first", () => {
    // Regression: a dock can have several connectedDockIds (not just one
    // pairedDockId), so multiple entries in state.dockPairs can share the
    // selected tile as an endpoint. The sync used to `return` after the
    // first match, silently dropping every other connected dock's line.
    const overlay = makeOverlay();
    const secondPair: DockPair = { ax: 1, ay: 1, bx: 2, by: 2 };
    const thirdPair: DockPair = { ax: 5, ay: 5, bx: 1, by: 1 };
    const routeFor = (p: DockPair): Array<{ x: number; y: number }> =>
      p === secondPair ? [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] : p === thirdPair ? [{ x: 1, y: 2 }, { x: 1, y: 1 }] : route;
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair, secondPair, thirdPair] });
    syncDockRouteOverlay(state, sceneOrigin, overlay, routeFor, () => true);
    expect(addedPaths(overlay)).toHaveLength(3);
  });

  it("anchors positions to sceneOrigin, not the live camera position", () => {
    // Regression: positions used to be computed relative to state.camX/camY
    // (the live, continuously-panning camera) instead of sceneOrigin (the
    // stable terrain anchor), so the line drifted with camera pan.
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair], camX: 500, camY: 500 });
    syncDockRouteOverlay(state, sceneOrigin, overlay, () => route, () => true);
    const first = addedPaths(overlay)[0]![0]!;
    expect(first.x).toBeCloseTo(1.5);
    expect(first.z).toBeCloseTo(1.5);
  });
});

describe("dockRouteScenePaths", () => {
  it("keeps a route continuous across the world seam instead of dropping that hop", () => {
    // Regression: the hop from the last column back to column 0 used to be
    // skipped, leaving a gap in the line exactly where it wrapped.
    const seamRoute = [{ x: WORLD_WIDTH - 1, y: 5 }, { x: 0, y: 5 }, { x: 1, y: 5 }];
    const paths = dockRouteScenePaths(seamRoute, { camX: 0, camY: 5 });
    expect(paths).toHaveLength(1);
    expect(paths[0]!.map((p) => p.x)).toEqual([-0.5, 0.5, 1.5]);
  });

  it("does not flip to the other side of the map where the route passes opposite the scene origin", () => {
    // Regression: each point was placed with its own half-world wrap, so a
    // hop straddling the point opposite the origin jumped from +W/2 to -W/2
    // and drew a stray line across the whole map.
    const half = WORLD_WIDTH / 2;
    const farRoute = [{ x: half - 1, y: 0 }, { x: half, y: 0 }, { x: half + 1, y: 0 }];
    const xs = dockRouteScenePaths(farRoute, { camX: 0, camY: 0 })[0]!.map((p) => p.x);
    for (let i = 1; i < xs.length; i += 1) expect(Math.abs(xs[i]! - xs[i - 1]!)).toBe(1);
  });

  it("places the route point nearest the scene origin at its true position", () => {
    // A route longer than half the world: the end the player is looking at
    // must land where its tiles are, whichever end the route starts from.
    const longRoute = Array.from({ length: Math.floor(WORLD_WIDTH * 0.75) }, (_, i) => ({ x: i, y: 0 }));
    const last = longRoute[longRoute.length - 1]!;
    const paths = dockRouteScenePaths(longRoute, { camX: last.x, camY: 0 });
    const xs = paths[0]!.map((p) => p.x);
    expect(xs[xs.length - 1]).toBeCloseTo(0.5);
  });
});


describe("cached dock route discovery", () => {
  it("refreshes a selected dock after garrison vision arrives without moving the camera", () => {
    const overlay = makeOverlay();
    const sync = createDockRouteSync(overlay);
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair], fogDisabled: false,
      discoveredDockTiles: new Set(["1,1"]) });
    const visible = () => state.discoveredDockTiles.has("3,1");
    sync(state, sceneOrigin, () => route, visible);
    expect(overlay.addPath).not.toHaveBeenCalled();
    state.discoveredDockTiles.add("3,1");
    sync(state, sceneOrigin, () => route, visible);
    expect(overlay.addPath).toHaveBeenCalledOnce();
    sync(state, sceneOrigin, () => route, visible);
    expect(overlay.commit).toHaveBeenCalledTimes(2);
  });

  it("clears administrative routes when fog is restored with the same selection", () => {
    const overlay = makeOverlay();
    const sync = createDockRouteSync(overlay);
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair], fogDisabled: true,
      discoveredDockTiles: new Set() });
    sync(state, sceneOrigin, () => route, () => state.fogDisabled);
    expect(overlay.addPath).toHaveBeenCalledOnce();
    state.fogDisabled = false;
    sync(state, sceneOrigin, () => route, () => state.fogDisabled);
    expect(overlay.clear).toHaveBeenCalledTimes(2);
    expect(overlay.addPath).toHaveBeenCalledOnce();
  });
});
