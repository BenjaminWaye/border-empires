import { DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { landingGroundKeysForSelection } from "../client-dock-landing/client-dock-landing.js";
import { hostileLandingGroundKeys } from "../client-dock-landing/client-dock-landing-threat.js";
import {
  HOSTILE_LANDING_COLOR,
  HOSTILE_LANDING_FILL_ALPHA,
  LANDING_GROUND_COLOR,
  LANDING_GROUND_FILL_ALPHA
} from "../client-dock-landing/client-dock-landing-style.js";
import { tileCornerMeanY } from "../client-map-3d-beacon-placement-overlay/client-map-3d-beacon-placement-overlay.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import type { SelectionRangeOverlaysDeps } from "../client-map-3d-selection-range-overlays/client-map-3d-selection-range-overlays.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";

// True-3D counterpart of client-dock-landing-2d.ts, synced every frame by the
// selection-range overlay hub:
// - always on, the viewer's coast where a hostile dock's crossings can land
//   (hostileLandingGroundKeys), in warning orange;
// - selecting a dock tints the ground its sea lanes can land on, at both ends
//   (landingGroundKeysForSelection), in sea-foam.

const LANDING_RISE_ABOVE_HEIGHTFIELD = 0.015;
const HOSTILE_RISE_ABOVE_HEIGHTFIELD = 0.014;
// A dock's own landing ground is at most 9 tiles; this covers a dock with 7 links plus its own shore.
const MAX_LANDING_TILES = 72;
// Hostile docks facing the viewer's coast, x 9 tiles each.
const MAX_HOSTILE_LANDING_TILES = 512;

export type DockLandingGroundOverlay = {
  readonly sync: (deps: SelectionRangeOverlaysDeps) => void;
  readonly dispose: () => void;
};

type TintLayer = {
  readonly fill: (deps: SelectionRangeOverlaysDeps, keys: Iterable<string>) => void;
  readonly dispose: () => void;
};

const createTintLayer = (scene: Scene, color: string, opacity: number, capacity: number, rise: number, renderOrder: number): TintLayer => {
  const geometry = new PlaneGeometry(0.9, 0.9);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity, depthTest: false, depthWrite: false, side: DoubleSide });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  const matrix = new Matrix4();

  const fill = (deps: SelectionRangeOverlaysDeps, keys: Iterable<string>): void => {
    let count = 0;
    for (const key of keys) {
      if (count >= capacity) break;
      const [wx, wy] = key.split(",").map(Number) as [number, number];
      if (deps.tileVisibilityStateAt(wx, wy, deps.state.tiles.get(key)) === "unexplored") continue;
      const localX = toroidDelta(deps.sceneOrigin.camX, wx, WORLD_WIDTH) + 0.5;
      const localZ = toroidDelta(deps.sceneOrigin.camY, wy, WORLD_HEIGHT) + 0.5;
      matrix.makeTranslation(localX, tileCornerMeanY(deps.cornerYAt, wx, wy) + rise, localZ);
      mesh.setMatrixAt(count, matrix);
      count += 1;
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { fill, dispose };
};

export const createDockLandingGroundOverlay = (scene: Scene): DockLandingGroundOverlay => {
  const hostile = createTintLayer(scene, HOSTILE_LANDING_COLOR, HOSTILE_LANDING_FILL_ALPHA + 0.1, MAX_HOSTILE_LANDING_TILES, HOSTILE_RISE_ABOVE_HEIGHTFIELD, 21);
  const selection = createTintLayer(scene, LANDING_GROUND_COLOR, LANDING_GROUND_FILL_ALPHA + 0.1, MAX_LANDING_TILES, LANDING_RISE_ABOVE_HEIGHTFIELD, 22);

  const sync = (deps: SelectionRangeOverlaysDeps): void => {
    hostile.fill(deps, hostileLandingGroundKeys(deps.state, resolveMyReachCached(deps.state), Date.now()));
    selection.fill(deps, landingGroundKeysForSelection(deps.state));
  };

  const dispose = (): void => {
    hostile.dispose();
    selection.dispose();
  };

  return { sync, dispose };
};
