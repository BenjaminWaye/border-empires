// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Group, InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createMapGuideOverlay } from "../client-map-3d-map-guide-overlay.js";
import { mapGuideRingTiles } from "./client-map-guide-ring-tiles.js";

const scoutTiles = [{ x: 501, y: 7 }, { x: 502, y: 7 }, { x: 503, y: 7 }];
// More onboarding rings than the 3D overlay's 32-marker cap.
const crowdedState = (wallNowMs: number) => ({
  onboardingHighlightTiles: Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0 })),
  houseCharges: undefined,
  houseChargeFocusId: undefined,
  tiles: new Map(),
  me: "p1",
  scoutFindingHighlight: { tiles: scoutTiles, until: wallNowMs + 8_000 }
});

describe("mapGuideRingTiles", () => {
  it("puts a tapped scout find ahead of other rings, so the 3D marker cap cannot drop it", () => {
    const tiles = mapGuideRingTiles(crowdedState(1_000), 1_000);
    expect(tiles.slice(0, 3)).toEqual(scoutTiles);
    expect(tiles).toHaveLength(43);
  });

  it("returns only the onboarding rings once the scout highlight has run out", () => {
    const state = crowdedState(1_000);
    expect(mapGuideRingTiles(state, 10_000)).toBe(state.onboardingHighlightTiles);
  });

  // Review 2026-11-21: scout rings were appended last, so with 32+ other markers true 3D dropped them
  // while the 2D canvas still drew them.
  it("rings every scout tile in true 3D even with more than 32 other markers", () => {
    const scene = new Scene();
    const overlay = createMapGuideOverlay(scene);
    overlay.sync(crowdedState(Date.now()) as never, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0 }), 0);
    const group = scene.getObjectByName("onboarding-checklist-highlight-overlay") as Group;
    const rings = group.children[0] as InstancedMesh;
    const placed = new Set<string>();
    const matrix = new Matrix4();
    const position = new Vector3();
    for (let i = 0; i < rings.count; i += 1) {
      rings.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      placed.add(`${position.x},${position.z}`);
    }
    for (const tile of scoutTiles) expect(placed.has(`${tile.x},${tile.y}`)).toBe(true);
    overlay.dispose();
  });
});
