import { describe, expect, it, vi } from "vitest";
import { syncDockRouteOverlay } from "./client-map-3d-dock-route-sync.js";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { ClientState } from "./client-state/client-state.js";
import type { DockPair } from "./client-types.js";
import type { DockRouteOverlay } from "./client-map-3d-dock-route-overlay.js";

const makeHeightfield = (): Heightfield =>
  ({
    elevationAt: () => 0,
    cornerYAt: () => 0
  }) as unknown as Heightfield;

const makeOverlay = (): DockRouteOverlay => ({
  clear: vi.fn(),
  addSegment: vi.fn(),
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

describe("syncDockRouteOverlay", () => {
  it("adds one segment per hop when the pairing is selected and visible", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, () => route, () => true);
    expect(overlay.addSegment).toHaveBeenCalledTimes(route.length - 1);
  });

  it("adds nothing when nothing is selected", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: undefined, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, () => route, () => true);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("adds nothing when the pairing is not selected", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 99, y: 99 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, () => route, () => true);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("adds nothing when the route is not visible for the player", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, () => route, () => false);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("skips a hop that wraps the toroidal world seam", () => {
    const overlay = makeOverlay();
    const wrappingRoute = [
      { x: 1, y: 1 },
      { x: 900, y: 1 } // far across the world -- must not draw a line straight across the map
    ];
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, () => wrappingRoute, () => true);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("draws a line for every pairing that has the selected dock as an endpoint, not just the first", () => {
    // Regression: a dock can have several connectedDockIds (not just one
    // pairedDockId), so multiple entries in state.dockPairs can share the
    // selected tile as an endpoint. The sync used to `return` after the
    // first match, silently dropping every other connected dock's line.
    const overlay = makeOverlay();
    const secondPair: DockPair = { ax: 1, ay: 1, bx: 8, by: 1 };
    const thirdPair: DockPair = { ax: 5, ay: 5, bx: 1, by: 1 };
    const routeFor = (p: DockPair): Array<{ x: number; y: number }> =>
      p === secondPair ? [{ x: 1, y: 1 }, { x: 8, y: 1 }] : p === thirdPair ? [{ x: 5, y: 5 }, { x: 1, y: 1 }] : route;
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair, secondPair, thirdPair] });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, routeFor, () => true);
    // pair: 2 hops, secondPair: 1 hop, thirdPair: 1 hop = 4 segments total.
    expect(overlay.addSegment).toHaveBeenCalledTimes(4);
  });

  it("anchors segment positions to sceneOrigin, not the live camera position", () => {
    // Regression: segments used to be computed relative to state.camX/camY
    // (the live, continuously-panning camera) instead of sceneOrigin (the
    // stable terrain anchor), so the line drifted with camera pan instead
    // of staying glued to the dock's world position. camX/camY here are far
    // from sceneOrigin to prove the sync doesn't read them.
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair], camX: 500, camY: 500 });
    syncDockRouteOverlay(state, sceneOrigin, makeHeightfield(), overlay, () => route, () => true);
    const firstCall = (overlay.addSegment as ReturnType<typeof vi.fn>).mock.calls[0];
    // With sceneOrigin at (0,0) and route starting at world (1,1), the segment's
    // scene-space start should be near (1.5, 1.5) (tile-center offset), not
    // shifted by the live camera's (500, 500).
    expect(firstCall?.[0]).toBeCloseTo(1.5);
    expect(firstCall?.[1]).toBeCloseTo(1.5);
  });
});
