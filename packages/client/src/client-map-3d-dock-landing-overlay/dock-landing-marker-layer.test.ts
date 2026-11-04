import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { SelectionRangeOverlaysDeps } from "../client-map-3d-selection-range-overlays/client-map-3d-selection-range-overlays.js";
import type { Tile } from "../client-types.js";
import { createLandingMarkerLayer } from "./dock-landing-marker-layer.js";

// A harbour with sea along its north side: the dock (40,40) and the beaches
// (39,40) and (41,40) each face water on exactly one side.
const deps = (): SelectionRangeOverlaysDeps => {
  const tiles = new Map<string, Tile>();
  for (let x = 38; x <= 42; x += 1) {
    tiles.set(`${x},39`, { x, y: 39, terrain: "SEA" });
    tiles.set(`${x},40`, { x, y: 40, terrain: "LAND" });
    tiles.set(`${x},41`, { x, y: 41, terrain: "LAND" });
  }
  const state = createInitialState();
  state.tiles = tiles;
  return {
    state,
    keyFor: (x, y) => `${x},${y}`,
    wrapX: (x) => x,
    wrapY: (y) => y,
    tileVisibilityStateAt: (x) => (x === 99 ? "unexplored" : "visible"),
    sceneOrigin: { camX: 40, camY: 40 },
    cornerYAt: () => 0
  };
};

const look = { color: "#5fe3d4", fillOpacity: 0.3, edgeOpacity: 0.8, chevronOpacity: 1, waterlineOpacity: 0.7, rise: 0.01, renderOrder: 24 };

const meshCounts = (scene: Scene): number[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh).map((mesh) => mesh.count);

describe("createLandingMarkerLayer", () => {
  it("gives every landing tile a fill, an edge, a waterline per water side and two chevrons", () => {
    const scene = new Scene();
    const layer = createLandingMarkerLayer(scene, look, 16);
    layer.fill(deps(), ["39,40", "40,40", "41,40"], 0);
    // fill, edge, waterline, chevrons -- in creation order.
    expect(meshCounts(scene)).toEqual([3, 3, 3, 6]);
  });

  it("draws no waterline for an inland tile and skips unexplored ones", () => {
    const scene = new Scene();
    const layer = createLandingMarkerLayer(scene, look, 16);
    layer.fill(deps(), ["40,41", "99,40"], 0);
    expect(meshCounts(scene)).toEqual([1, 1, 0, 2]);
  });

  it("stops at its capacity and removes its meshes on dispose", () => {
    const scene = new Scene();
    const layer = createLandingMarkerLayer(scene, look, 2);
    layer.fill(deps(), ["39,40", "40,40", "41,40"], 0);
    expect(meshCounts(scene)).toEqual([2, 2, 2, 4]);
    layer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
