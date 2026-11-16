import { LineSegments, Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { createSelectionRangeOverlays } from "./client-map-3d-selection-range-overlays.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Regression (review): the reach tint was clipped to visible land in true-3D,
// but its square outline was still drawn over the sea and into the fog. The
// 2D reach highlight is fill only, so the 3D reach ring is too.
describe("createSelectionRangeOverlays reach ring", () => {
  it("draws the selected town's reach as clipped fill with no square outline", () => {
    const tiles = new Map<string, Tile>();
    tiles.set(keyFor(20, 20), { x: 20, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", townType: "FARMING" } as Tile);
    for (let y = 17; y <= 23; y += 1) tiles.set(keyFor(21, y), { x: 21, y, terrain: "SEA" });
    const scene = new Scene();
    const overlays = createSelectionRangeOverlays(scene);
    const visibility = (_x: number, _y: number, tile?: Tile): TileVisibilityState => (tile ? "visible" : "unexplored");
    overlays.sync({
      state: { selected: { x: 20, y: 20 }, tiles, dockPairs: [] } as unknown as ClientState,
      keyFor,
      wrapX: (x) => x,
      wrapY: (y) => y,
      tileVisibilityStateAt: visibility,
      sceneOrigin: { camX: 20, camY: 20 },
      cornerYAt: () => 0
    });
    const reachFill = scene.children.find((child): child is Mesh => child instanceof Mesh && child.renderOrder === 20);
    const reachBorder = scene.children.find((child): child is LineSegments => child instanceof LineSegments && child.renderOrder === 21);
    expect(reachFill?.visible).toBe(true);
    expect(reachFill?.geometry.drawRange.count).toBe(6);
    expect(reachBorder?.visible).toBe(false);
    overlays.dispose();
  });
});
