import { DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { computeOutpostReachPreview } from "../client-reach-overlay-beacon-preview/client-reach-overlay-beacon-preview.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { PlacementOverlaySyncDeps } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";

// True-3D counterpart to client-placement-preview-2d.ts's Relay Beacon
// preview: while a Relay Beacon is being placed, tint the ground the beacon
// would *newly* bring into reach (blue, same as the 2D ghost). The range
// ring itself is drawn by the shared placement-range marker in
// client-map-3d-placement-overlay.ts.

const NEW_REACH_RISE_ABOVE_HEIGHTFIELD = 0.013;
// OUTPOST reach radius 5 -> an 11x11 disk at most.
const MAX_NEW_REACH_TILES = 11 * 11;

export type BeaconPlacementOverlay = {
  readonly sync: (deps: PlacementOverlaySyncDeps) => void;
  readonly hide: () => void;
};

/** Mean of a tile's four heightfield corners -- where flat tile-sized placement tints sit (shared with the beneficiary highlights). */
export const tileCornerMeanY = (cornerYAt: PlacementOverlaySyncDeps["cornerYAt"], wx: number, wy: number): number => {
  const wxNext = wx + 1 >= WORLD_WIDTH ? 0 : wx + 1;
  const wyNext = wy + 1 >= WORLD_HEIGHT ? 0 : wy + 1;
  return (cornerYAt(wx, wy) + cornerYAt(wxNext, wy) + cornerYAt(wx, wyNext) + cornerYAt(wxNext, wyNext)) / 4;
};

export const createBeaconPlacementOverlay = (scene: Scene): BeaconPlacementOverlay => {
  const reachGeometry = new PlaneGeometry(0.92, 0.92);
  reachGeometry.rotateX(-Math.PI * 0.5);
  const reachMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#96dcff", transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, side: DoubleSide });
  const reachFill = new InstancedMesh(reachGeometry, reachMaterial, MAX_NEW_REACH_TILES);
  reachFill.instanceMatrix.setUsage(DynamicDrawUsage);
  reachFill.frustumCulled = false;
  reachFill.renderOrder = 13;
  reachFill.count = 0;
  reachFill.visible = false;

  scene.add(reachFill);
  const matrix = new Matrix4();

  const placeAt = (index: number, deps: PlacementOverlaySyncDeps, wx: number, wy: number): void => {
    const localX = toroidDelta(deps.sceneOrigin.camX, wx, WORLD_WIDTH) + 0.5;
    const localZ = toroidDelta(deps.sceneOrigin.camY, wy, WORLD_HEIGHT) + 0.5;
    matrix.makeTranslation(localX, tileCornerMeanY(deps.cornerYAt, wx, wy) + NEW_REACH_RISE_ABOVE_HEIGHTFIELD, localZ);
    reachFill.setMatrixAt(index, matrix);
  };

  const commit = (count: number): void => {
    reachFill.count = count;
    reachFill.visible = count > 0;
    if (count === 0) return;
    reachFill.instanceMatrix.clearUpdateRanges();
    reachFill.instanceMatrix.addUpdateRange(0, count * 16);
    reachFill.instanceMatrix.needsUpdate = true;
  };

  const syncNewReach = (deps: PlacementOverlaySyncDeps): void => {
    const { x, y } = deps.state.buildingPlacement;
    if (deps.tileVisibilityStateAt(x, y, deps.state.tiles.get(deps.keyFor(x, y))) !== "visible") {
      commit(0);
      return;
    }
    const reach = resolveMyReachCached(deps.state);
    let count = 0;
    for (const key of computeOutpostReachPreview(x, y, deps.state.tiles)) { // land-gated, same as the 2D preview
      if (count >= MAX_NEW_REACH_TILES) break;
      if (reach.has(key)) continue; // already in reach -- nothing new to show
      const [kx, ky] = key.split(",").map(Number);
      if (!Number.isFinite(kx) || !Number.isFinite(ky)) continue;
      placeAt(count, deps, kx!, ky!);
      count += 1;
    }
    commit(count);
  };

  const hide = (): void => commit(0);

  const sync = (deps: PlacementOverlaySyncDeps): void => {
    if (!deps.state.buildingPlacement.active || deps.state.buildingPlacement.structureType !== "RELAY_BEACON") {
      hide();
      return;
    }
    syncNewReach(deps);
  };

  return { sync, hide };
};
