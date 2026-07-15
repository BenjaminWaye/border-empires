import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { MusterCombatFx } from "./client-map-3d-muster-combat-fx.js";
import { activeMusterSupplyLines, resolveAdvanceMusterFallbackSource, type AdvanceMusterFallbackCache } from "./client-muster-transit/client-muster-transit.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { SupplyLineOverlay } from "./client-map-3d-supply-line-overlay.js";
import type { ClientState } from "./client-state/client-state.js";

const TILE_CENTER_OFFSET = 0.5;

let advanceSrcCache: AdvanceMusterFallbackCache;

export function syncCaptureOverlays(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  effectiveOverlayColor: (ownerId: string) => string,
  heightfield: Heightfield,
  supplyLineOverlay: SupplyLineOverlay,
  musterCombatFx: MusterCombatFx,
): void {
  const lines = activeMusterSupplyLines(state, keyFor);
  const coveredTargetKeys = new Set(lines.map((line) => line.targetKey));

  // ADVANCE-mode auto-fire attacks never go through the client's muster
  // dispatch/transit maps (the server fires them autonomously), so fall
  // back to locating the nearest ADVANCE flag for the single tracked
  // `state.capture` countdown if it isn't already covered above.
  const capture = state.capture;
  const captureTargetKey = capture ? keyFor(capture.target.x, capture.target.y) : "";
  if (capture && !coveredTargetKeys.has(captureTargetKey) && state.tiles.get(captureTargetKey)?.ownerId) {
    const fallback = resolveAdvanceMusterFallbackSource(state, captureTargetKey, capture.target, advanceSrcCache);
    advanceSrcCache = fallback.cache;
    if (fallback.result) {
      lines.push({
        musterX: fallback.result.x,
        musterY: fallback.result.y,
        targetX: capture.target.x,
        targetY: capture.target.y,
        targetKey: captureTargetKey,
        phase: "locked"
      });
    }
  }

  if (lines.length === 0) {
    musterCombatFx.clear();
    return;
  }

  const ownerColor = effectiveOverlayColor(state.me ?? "");
  let combatFxSet = false;
  for (const line of lines) {
    const srcDx = toroidDelta(state.camX, line.musterX, WORLD_WIDTH);
    const srcDy = toroidDelta(state.camY, line.musterY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(state.camX, line.targetX, WORLD_WIDTH);
    const tgtDy = toroidDelta(state.camY, line.targetY, WORLD_HEIGHT);
    const srcSurfaceY = Math.max(heightfield.elevationAt(line.musterX, line.musterY), heightfield.cornerYAt(line.musterX, line.musterY));
    const tgtSurfaceY = Math.max(heightfield.elevationAt(line.targetX, line.targetY), heightfield.cornerYAt(line.targetX, line.targetY));
    supplyLineOverlay.addLine(
      srcDx + TILE_CENTER_OFFSET, srcDy + TILE_CENTER_OFFSET, srcSurfaceY,
      tgtDx + TILE_CENTER_OFFSET, tgtDy + TILE_CENTER_OFFSET, tgtSurfaceY,
      line.phase,
      ownerColor
    );
    // The combat FX dot animation is tied to the single in-flight
    // `state.capture` countdown, so only wire it up for that one entry.
    if (line.targetKey === captureTargetKey) {
      musterCombatFx.setSource(
        srcSurfaceY, tgtSurfaceY,
        srcDx + TILE_CENTER_OFFSET, srcDy + TILE_CENTER_OFFSET,
        tgtDx + TILE_CENTER_OFFSET, tgtDy + TILE_CENTER_OFFSET,
        ownerColor
      );
      combatFxSet = true;
    }
  }
  if (!combatFxSet) musterCombatFx.clear();
}
