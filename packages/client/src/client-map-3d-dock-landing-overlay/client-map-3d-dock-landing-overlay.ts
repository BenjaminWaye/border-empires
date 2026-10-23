import { DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { landingGroundKeysForSelection } from "../client-dock-landing/client-dock-landing.js";
import { LANDING_GROUND_COLOR, LANDING_GROUND_FILL_ALPHA } from "../client-dock-landing/client-dock-landing-style.js";
import { tileCornerMeanY } from "../client-map-3d-beacon-placement-overlay/client-map-3d-beacon-placement-overlay.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import type { SelectionRangeOverlaysDeps } from "../client-map-3d-selection-range-overlays/client-map-3d-selection-range-overlays.js";

// True-3D counterpart of client-dock-landing-2d.ts: selecting a dock tints
// the ground its sea lanes can land on, at both ends (landingGroundKeysForSelection).
// Synced every frame by the selection-range overlay hub.

const LANDING_RISE_ABOVE_HEIGHTFIELD = 0.015;
// A dock's own landing ground is at most 9 tiles; this covers a dock with 7 links plus its own shore.
const MAX_LANDING_TILES = 72;

export type DockLandingGroundOverlay = {
  readonly sync: (deps: SelectionRangeOverlaysDeps) => void;
  readonly dispose: () => void;
};

export const createDockLandingGroundOverlay = (scene: Scene): DockLandingGroundOverlay => {
  const geometry = new PlaneGeometry(0.9, 0.9);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({
    toneMapped: false,
    color: LANDING_GROUND_COLOR,
    transparent: true,
    opacity: LANDING_GROUND_FILL_ALPHA + 0.1,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const fill = new InstancedMesh(geometry, material, MAX_LANDING_TILES);
  fill.instanceMatrix.setUsage(DynamicDrawUsage);
  fill.frustumCulled = false;
  fill.renderOrder = 22;
  fill.count = 0;
  fill.visible = false;
  scene.add(fill);
  const matrix = new Matrix4();

  const sync = (deps: SelectionRangeOverlaysDeps): void => {
    let count = 0;
    for (const key of landingGroundKeysForSelection(deps.state)) {
      if (count >= MAX_LANDING_TILES) break;
      const [wx, wy] = key.split(",").map(Number) as [number, number];
      if (deps.tileVisibilityStateAt(wx, wy, deps.state.tiles.get(key)) === "unexplored") continue;
      const localX = toroidDelta(deps.sceneOrigin.camX, wx, WORLD_WIDTH) + 0.5;
      const localZ = toroidDelta(deps.sceneOrigin.camY, wy, WORLD_HEIGHT) + 0.5;
      matrix.makeTranslation(localX, tileCornerMeanY(deps.cornerYAt, wx, wy) + LANDING_RISE_ABOVE_HEIGHTFIELD, localZ);
      fill.setMatrixAt(count, matrix);
      count += 1;
    }
    fill.count = count;
    fill.visible = count > 0;
    if (count === 0) return;
    fill.instanceMatrix.clearUpdateRanges();
    fill.instanceMatrix.addUpdateRange(0, count * 16);
    fill.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(fill);
    geometry.dispose();
    material.dispose();
  };

  return { sync, dispose };
};
