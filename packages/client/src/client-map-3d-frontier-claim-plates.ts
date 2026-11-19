import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Mesh, MeshBasicMaterial } from "three";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS, type Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight } from "./client-map-3d-hill-shape.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import { FRONTIER_OPACITY } from "./client-map-3d-ownership-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
import { collectFrontierClaims, type FrontierClaim } from "./client-frontier-claim-collect/client-frontier-claim-collect.js";
import { expandCrewAnchor, expandCrewPlateProgress } from "./client-expand-crew/client-expand-crew.js";

// Moved to client-frontier-claim-collect.ts (shared with the 2D crew); re-exported for existing callers.
export { activeFrontierAttackClaimTargetKeys } from "./client-frontier-claim-collect/client-frontier-claim-collect.js";

const TILE_CENTER_OFFSET = 0.5;

// One claim as placed in the scene, handed on to the expand crew layer
// (client-map-3d-expand-crew/): the target tile's top-left corner in scene
// coordinates, its surface height, and the surface height of the tile the
// crew walks out of.
export type PlacedFrontierClaim = {
  readonly claim: FrontierClaim;
  readonly sceneX: number;
  readonly sceneZ: number;
  readonly surfaceY: number;
  readonly fromSurfaceY: number;
};

// Drives the frontier-claim plate pool from every claim
// collectFrontierClaims finds (see there for which claims count). A claim
// with an expand crew grows its plate outward from where the crew staked the
// tile once they've walked in (client-expand-crew.ts); one without (an ATTACK
// on frontier ground) keeps the sweep in from the left over the whole claim.
// `animate` is the unit motion gate's verdict: with motion off the crew
// stands on its stakes from the start, so the plate fills over the full claim.
export function syncFrontierClaimPlates(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  heightfield: Heightfield,
  plates: readonly Mesh[],
  originX: number,
  originY: number,
  markerRise: number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number,
  // Must already exclude MOUNTAIN-kind tiles -- hills.ts's own dome mesh
  // never renders one even when the raw hills flag is set (see its
  // top-of-loop skip and isHillNeighbor), so a bare isHillsTile predicate
  // here would bump-raise a claim plate over a mountain with no dome at all.
  isHillsAt: (x: number, y: number) => boolean,
  animate = true
): PlacedFrontierClaim[] {
  const nowEpochMs = Date.now();
  const claims = collectFrontierClaims(state, keyFor, nowEpochMs);
  const placed: PlacedFrontierClaim[] = [];

  const tileSurfaceY = (x: number, y: number): number => {
    const wxNext = wrapX(x + 1);
    const wyNext = wrapY(y + 1);
    const groundY = (heightfield.cornerYAt(x, y) + heightfield.cornerYAt(wxNext, y) + heightfield.cornerYAt(x, wyNext) + heightfield.cornerYAt(wxNext, wyNext)) / 4;
    // This plate is one flat quad (not subdivided like the dome-draped
    // ownership/settle meshes), so it can't contour every bump -- but it
    // must at least clear the dome's own height at the tile's center
    // instead of sitting on the flat corner average, which used to bury it
    // inside (or leave it floating below) a hill's peak entirely.
    if (!isHillsAt(x, y)) return groundY;
    const bumps = hillBumpsWithCorridorAt(x, y, hillNeighborFlagsAt(x, y, isHillsAt, wrapX, wrapY));
    return groundY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(0, 0, bumps, x, y);
  };

  const TILE_WIDTH = 0.94;
  const HALF_TILE = TILE_WIDTH * 0.5;
  let i = 0;
  for (const claim of claims) {
    const plate = plates[i];
    if (!plate) break;
    i += 1;
    const material = plate.material as MeshBasicMaterial;
    material.color.set(claim.color);
    material.opacity = FRONTIER_OPACITY;
    const dxw = toroidDelta(originX, claim.targetX, WORLD_WIDTH);
    const dyw = toroidDelta(originY, claim.targetY, WORLD_HEIGHT);
    const surfaceY = tileSurfaceY(claim.targetX, claim.targetY);
    const tileCenterX = dxw + TILE_CENTER_OFFSET;
    const tileCenterZ = dyw + TILE_CENTER_OFFSET;
    if (claim.crew > 0) {
      // Grows outward from the crew's stake point toward the full tile. The
      // anchor sits at least HALF_TILE - 0.22 inside every edge, so the
      // growing plate never leaves the tile.
      const t = expandCrewPlateProgress(claim, nowEpochMs, animate);
      const anchor = expandCrewAnchor(claim);
      plate.scale.set(Math.max(0.001, t), 1, Math.max(0.001, t));
      plate.position.set(dxw + anchor.x + (TILE_CENTER_OFFSET - anchor.x) * t, surfaceY + markerRise, dyw + anchor.y + (TILE_CENTER_OFFSET - anchor.y) * t);
      const from = claim.fromStep;
      const fromSurfaceY = from ? tileSurfaceY(wrapX(claim.targetX + from.dx), wrapY(claim.targetY + from.dy)) : surfaceY;
      placed.push({ claim, sceneX: dxw, sceneZ: dyw, surfaceY, fromSurfaceY });
    } else {
      // Anchor the plate's LEFT edge at tile-center − HALF_TILE; scaling X by
      // t grows the plate rightward from there.
      const total = Math.max(1, claim.resolvesAt - claim.startAt);
      const t = Math.max(0, Math.min(1, (nowEpochMs - claim.startAt) / total));
      plate.scale.set(Math.max(0.001, t), 1, 1);
      plate.position.set(tileCenterX - HALF_TILE + (TILE_WIDTH * t) * 0.5, surfaceY + markerRise, tileCenterZ);
    }
    plate.visible = true;
  }
  for (; i < plates.length; i += 1) {
    const plate = plates[i];
    if (plate) plate.visible = false;
  }
  return placed;
}
