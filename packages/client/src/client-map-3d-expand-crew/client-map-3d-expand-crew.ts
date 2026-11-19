import type { Mesh, Scene, Texture } from "three";
import type { ClientState } from "../client-state/client-state.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createFrontierClaimPlatePool, disposeFrontierClaimPlatePool } from "../client-map-3d-frontier-claim-plate/client-map-3d-frontier-claim-plate.js";
import { syncFrontierClaimPlates } from "../client-map-3d-frontier-claim-plates.js";
import { createUnitMotionGate, type UnitMotionGate } from "../client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";
import { createExpandCrewSoldiers } from "./client-map-3d-expand-crew-soldiers.js";
import { localPlayerSquadGear } from "../client-battle-overlay/client-battle-overlay.js";
import { marineModelFor, type MarineModelKey } from "../client-map-3d-popup-marine/popup-marine-gear.js";

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
  isHillsAt: (x: number, y: number) => boolean,
  // This player's territory colour as the map draws it (effectiveOverlayColor):
  // the crew's tint, so the diplomacy lens matches its marching companies.
  ownerColor: string
];

// The armour this player's expand crew wears: the same as its marching and
// fighting soldiers (heavy with a Titanium Weapons Factory), read off its own
// tiles -- crew claims are always this player's own.
export const expandCrewArmour = (state: Pick<ClientState, "tiles" | "me" | "tilesRevision">): MarineModelKey =>
  marineModelFor(localPlayerSquadGear(state));

// envMap: the building environment map the heavy armour reflects.
export const createFrontierClaimVisuals = (scene: Scene, envMap?: Texture, motionGate: UnitMotionGate = createUnitMotionGate()): FrontierClaimVisuals => {
  const plates = createFrontierClaimPlatePool();
  const soldiers = createExpandCrewSoldiers(scene, envMap);
  const sync: FrontierClaimVisuals["sync"] = (state, keyFor, heightfield, originX, originY, markerRise, wrapX, wrapY, isHillsAt, ownerColor) => {
    motionGate.recordFrame(performance.now());
    const animate = motionGate.shouldAnimate();
    const nowEpochMs = Date.now();
    const placed = syncFrontierClaimPlates(state, keyFor, heightfield, plates, originX, originY, markerRise, wrapX, wrapY, isHillsAt, animate, nowEpochMs);
    // Gear is read (cached per tile revision) only when there is a crew to dress.
    const hasCrew = placed.some((p) => p.claim.crew > 0);
    soldiers.update(placed, nowEpochMs, animate, hasCrew ? expandCrewArmour(state) : "standard", ownerColor);
  };
  const dispose = (): void => {
    disposeFrontierClaimPlatePool(plates);
    soldiers.dispose();
  };
  return { objects: plates, sync, dispose };
};
