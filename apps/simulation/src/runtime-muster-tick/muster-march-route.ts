import type { DomainTileState } from "@border-empires/game-domain";
import type { MusterTickInput } from "./runtime-muster-tick.js";

// Route ranking and march-ending helpers for runtime-muster-march.ts, split
// out to keep that file under the line cap.

// offPath: the candidate lies outside the band around the traced march path
// (muster-march-path-band.ts). Ranked first, so it only wins when nothing on
// the path can be taken -- a fallback for getting round a blocked path.
export type MarchRouteScore = { offPath: boolean; routeLength: number; hitsSettled: boolean; remainingToTarget: number; lineDeviation: number };

// Floating-point slack for comparing lineDeviation values.
const LINE_DEVIATION_EPSILON = 1e-9;

/** True when route `a` strictly beats `b` under MARCH's straightest-route ranking. */
export const isStraighterRoute = (a: MarchRouteScore, b: MarchRouteScore): boolean => {
  if (a.offPath !== b.offPath) return !a.offPath;
  if (a.routeLength !== b.routeLength) return a.routeLength < b.routeLength;
  if (a.remainingToTarget !== b.remainingToTarget) return a.remainingToTarget < b.remainingToTarget;
  if (Math.abs(a.lineDeviation - b.lineDeviation) > LINE_DEVIATION_EPSILON) return a.lineDeviation < b.lineDeviation;
  return a.hitsSettled !== b.hitsSettled && !a.hitsSettled;
};

/**
 * Ends a march by switching the flag back to HOLD and telling the client.
 * `reason` only labels the tile-delta batch: "complete" when the target is
 * ours, "stopped-short" when it can never be reached (see below).
 */
export const endMarch = (
  input: MusterTickInput,
  musterTile: DomainTileState,
  originKey: string,
  playerId: string,
  reason: "complete" | "stopped-short"
): void => {
  const { targetX: _targetX, targetY: _targetY, ...restMuster } = musterTile.muster!;
  const clearedTile: DomainTileState = {
    ...musterTile,
    muster: { ...restMuster, mode: "HOLD" }
  };
  input.replaceTileState(originKey, clearedTile);
  input.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `muster-march-${reason}:${playerId}:${originKey}:${input.nowMs}`,
    playerId,
    tileDeltas: [input.tileDeltaFromState(clearedTile)]
  });
  input.advanceCooldowns.delete(originKey);
};
