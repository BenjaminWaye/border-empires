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
    syncDockRouteOverlay(state, makeHeightfield(), overlay, () => route, () => true);
    expect(overlay.addSegment).toHaveBeenCalledTimes(route.length - 1);
  });

  it("adds nothing when nothing is selected", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: undefined, dockPairs: [pair] });
    syncDockRouteOverlay(state, makeHeightfield(), overlay, () => route, () => true);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("adds nothing when the pairing is not selected", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 99, y: 99 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, makeHeightfield(), overlay, () => route, () => true);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("adds nothing when the route is not visible for the player", () => {
    const overlay = makeOverlay();
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, makeHeightfield(), overlay, () => route, () => false);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });

  it("skips a hop that wraps the toroidal world seam", () => {
    const overlay = makeOverlay();
    const wrappingRoute = [
      { x: 1, y: 1 },
      { x: 900, y: 1 } // far across the world -- must not draw a line straight across the map
    ];
    const state = makeState({ selected: { x: 1, y: 1 }, dockPairs: [pair] });
    syncDockRouteOverlay(state, makeHeightfield(), overlay, () => wrappingRoute, () => true);
    expect(overlay.addSegment).not.toHaveBeenCalled();
  });
});
