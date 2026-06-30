import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { MusterCombatFx } from "./client-map-3d-muster-combat-fx.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { SupplyLineOverlay } from "./client-map-3d-supply-line-overlay.js";
import type { ClientState } from "./client-state/client-state.js";

const TILE_CENTER_OFFSET = 0.5;

let advanceSrcCache: { targetKey: string; result: { x: number; y: number } | undefined } | undefined;

export function syncCaptureOverlays(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  effectiveOverlayColor: (ownerId: string) => string,
  heightfield: Heightfield,
  supplyLineOverlay: SupplyLineOverlay,
  musterCombatFx: MusterCombatFx,
): void {
  const capture = state.capture;
  if (!capture) {
    musterCombatFx.clear();
    return;
  }
  const captureTargetKey = keyFor(capture.target.x, capture.target.y);
  const targetOwned = Boolean(state.tiles.get(captureTargetKey)?.ownerId);
  const advanceSrc = !state.activeMusterSource && targetOwned ? (() => {
    if (advanceSrcCache?.targetKey !== captureTargetKey) {
      advanceSrcCache = { targetKey: captureTargetKey, result: findClosestAdvanceMuster(state, capture.target) };
    }
    return advanceSrcCache.result;
  })() : undefined;
  const src = state.activeMusterSource ?? advanceSrc;
  const transit = state.musterTransit;
  if (!src) {
    musterCombatFx.clear();
    return;
  }
  const phase = transit ? "transit" as const : "locked" as const;
  const [srcWx, srcWy] = [src.x, src.y];
  const [tgtWx, tgtWy] = [capture.target.x, capture.target.y];
  const srcDx = toroidDelta(state.camX, srcWx, WORLD_WIDTH);
  const srcDy = toroidDelta(state.camY, srcWy, WORLD_HEIGHT);
  const tgtDx = toroidDelta(state.camX, tgtWx, WORLD_WIDTH);
  const tgtDy = toroidDelta(state.camY, tgtWy, WORLD_HEIGHT);
  const srcSurfaceY = Math.max(
    heightfield.elevationAt(srcWx, srcWy),
    heightfield.cornerYAt(srcWx, srcWy)
  );
  const tgtSurfaceY = Math.max(
    heightfield.elevationAt(tgtWx, tgtWy),
    heightfield.cornerYAt(tgtWx, tgtWy)
  );
  const ownerColor = effectiveOverlayColor(state.me ?? "");
  supplyLineOverlay.addLine(
    srcDx + TILE_CENTER_OFFSET, srcDy + TILE_CENTER_OFFSET, srcSurfaceY,
    tgtDx + TILE_CENTER_OFFSET, tgtDy + TILE_CENTER_OFFSET, tgtSurfaceY,
    phase,
    ownerColor
  );
  musterCombatFx.setSource(
    srcSurfaceY, tgtSurfaceY,
    srcDx + TILE_CENTER_OFFSET, srcDy + TILE_CENTER_OFFSET,
    tgtDx + TILE_CENTER_OFFSET, tgtDy + TILE_CENTER_OFFSET,
    ownerColor
  );
}

function findClosestAdvanceMuster(
  state: ClientState,
  target: { x: number; y: number },
): { x: number; y: number } | undefined {
  let bestTile: { x: number; y: number } | undefined;
  let bestDist = Infinity;
  for (const tile of state.tiles.values()) {
    if (!tile.muster || tile.muster.ownerId !== state.me || tile.muster.mode !== "ADVANCE") continue;
    const d = Math.max(Math.abs(tile.x - target.x), Math.abs(tile.y - target.y));
    if (d < bestDist) { bestDist = d; bestTile = { x: tile.x, y: tile.y }; }
  }
  return bestTile;
}
