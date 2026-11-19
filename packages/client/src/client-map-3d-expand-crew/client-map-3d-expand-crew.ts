import type { Mesh, Scene } from "three";
import type { ClientState } from "../client-state/client-state.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createFrontierClaimPlatePool, disposeFrontierClaimPlatePool } from "../client-map-3d-frontier-claim-plate/client-map-3d-frontier-claim-plate.js";
import { syncFrontierClaimPlates } from "../client-map-3d-frontier-claim-plates.js";
import { createUnitMotionGate, type UnitMotionGate } from "../client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";
import { createExpandCrewSoldiers } from "./client-map-3d-expand-crew-soldiers.js";

// The claim plates and the expand crew's soldiers
// (client-map-3d-expand-crew-soldiers.ts) together, so the 3D map creates,
// syncs and disposes them as one piece. The plates are returned for the
// caller to add to its scene; the soldiers add themselves once their model
// has loaded.
export type FrontierClaimVisuals = {
  readonly objects: readonly Mesh[];
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

export const createFrontierClaimVisuals = (scene: Scene, motionGate: UnitMotionGate = createUnitMotionGate()): FrontierClaimVisuals => {
  const plates = createFrontierClaimPlatePool();
  const soldiers = createExpandCrewSoldiers(scene);
  const sync: FrontierClaimVisuals["sync"] = (state, keyFor, heightfield, originX, originY, markerRise, wrapX, wrapY, isHillsAt) => {
    motionGate.recordFrame(performance.now());
    const animate = motionGate.shouldAnimate();
    const nowEpochMs = Date.now();
    const placed = syncFrontierClaimPlates(state, keyFor, heightfield, plates, originX, originY, markerRise, wrapX, wrapY, isHillsAt, animate, nowEpochMs);
    soldiers.update(placed, nowEpochMs, animate);
  };
  const dispose = (): void => {
    disposeFrontierClaimPlatePool(plates);
    soldiers.dispose();
  };
  return { objects: plates, sync, dispose };
};
