import { InstancedMesh, Matrix4, Quaternion, type Mesh, Vector3 } from "three";
import type { ClientState } from "../client-state/client-state.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createAncillaryFigureAssets, PERSON_H, PERSON_Y } from "../client-map-3d-ancillary-figures/client-map-3d-ancillary-figures.js";
import {
  createFrontierClaimPlatePool,
  disposeFrontierClaimPlatePool,
  FRONTIER_CLAIM_PLATE_CAP
} from "../client-map-3d-frontier-claim-plate/client-map-3d-frontier-claim-plate.js";
import { syncFrontierClaimPlates, type PlacedFrontierClaim } from "../client-map-3d-frontier-claim-plates.js";
import { EXPAND_CREW_MANUAL, expandCrewFigurePose } from "../client-expand-crew/client-expand-crew.js";
import { createUnitMotionGate, type UnitMotionGate } from "../client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";

// 3D expand crew: the ancillaries that walk out onto a neutral tile and stake
// it while its claim plate fills (client-expand-crew.ts holds the paths; the
// 2D canvas twin is client-expand-crew-2d/). The same black pinprick figures
// as the settle overlay and construction crew, so they read as the same
// "people". One instanced mesh for every claim.
const MAX_FIGURES = FRONTIER_CLAIM_PLATE_CAP * EXPAND_CREW_MANUAL;

export type ExpandCrewLayer = {
  readonly mesh: InstancedMesh;
  readonly update: (placed: readonly PlacedFrontierClaim[], nowEpochMs: number, animate: boolean) => void;
  readonly dispose: () => void;
};

export const createExpandCrewLayer = (): ExpandCrewLayer => {
  const { geometry, material } = createAncillaryFigureAssets();
  // Drawn in the transparent pass after the claim plate (renderOrder 7, no
  // depth test) so the plate doesn't wash over the figures standing on it.
  material.transparent = true;
  const mesh = new InstancedMesh(geometry, material, MAX_FIGURES);
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  mesh.count = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identity = new Quaternion();

  const update: ExpandCrewLayer["update"] = (placed, nowEpochMs, animate) => {
    if (placed.length === 0 && mesh.count === 0) return;
    let count = 0;
    for (const { claim, sceneX, sceneZ, surfaceY, fromSurfaceY } of placed) {
      for (let i = 0; i < claim.crew && count < MAX_FIGURES; i += 1) {
        const pose = expandCrewFigurePose(claim, i, nowEpochMs, animate);
        if (!pose || pose.height <= 0) continue;
        // Still on (or stepping off) the origin tile: stand on its ground.
        const outside = Math.max(0, -pose.x, pose.x - 1, -pose.y, pose.y - 1);
        const groundY = surfaceY + (fromSurfaceY - surfaceY) * Math.min(1, outside * 2);
        // Sinking: shrink from the feet up, so they settle into the claim.
        position.set(sceneX + pose.x, groundY + PERSON_Y - PERSON_H * 0.5 * (1 - pose.height), sceneZ + pose.y);
        matrix.compose(position, identity, scale.set(1, pose.height, 1));
        mesh.setMatrixAt(count, matrix);
        count += 1;
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    mesh.dispose();
    geometry.dispose();
    material.dispose();
  };

  return { mesh, update, dispose };
};

// The claim plates and the expand crew together, so the 3D map creates,
// syncs and disposes them as one piece.
export type FrontierClaimVisuals = {
  readonly objects: readonly (Mesh | InstancedMesh)[];
  readonly sync: (...args: SyncArgs) => void;
  readonly dispose: () => void;
};

type SyncArgs = [
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  heightfield: Heightfield,
  originX: number,
  originY: number,
  markerRise: number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number,
  isHillsAt: (x: number, y: number) => boolean
];

export const createFrontierClaimVisuals = (motionGate: UnitMotionGate = createUnitMotionGate()): FrontierClaimVisuals => {
  const plates = createFrontierClaimPlatePool();
  const crew = createExpandCrewLayer();
  const sync: FrontierClaimVisuals["sync"] = (state, keyFor, heightfield, originX, originY, markerRise, wrapX, wrapY, isHillsAt) => {
    motionGate.recordFrame(performance.now());
    const animate = motionGate.shouldAnimate();
    const placed = syncFrontierClaimPlates(state, keyFor, heightfield, plates, originX, originY, markerRise, wrapX, wrapY, isHillsAt, animate);
    crew.update(placed, Date.now(), animate);
  };
  const dispose = (): void => {
    disposeFrontierClaimPlatePool(plates);
    crew.dispose();
  };
  return { objects: [...plates, crew.mesh], sync, dispose };
};
