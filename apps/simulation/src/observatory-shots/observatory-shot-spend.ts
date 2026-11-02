// Observatory (Aether Tower) shot spend — extracted out of runtime.ts (over
// the repo's per-file line cap). Every ability cast from a tower goes through
// here; the shot rules themselves live in @border-empires/shared
// aether-tower-shots.ts.
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { spendAetherTowerShot } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type ObservatoryTileWriteDeps = {
  tiles: ReadonlyMap<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
};

/**
 * Spend one shot of the observatory at `tileKey` (it holds `maxShots`).
 * Updates the canonical tile state and emits a tile delta so clients see the
 * new `tile.observatory.shotsUsedAt` / `cooldownUntil`.
 */
export function spendObservatoryShot(
  deps: ObservatoryTileWriteDeps,
  tileKey: string,
  maxShots: number,
  now: number,
  commandId: string,
  playerId: string
): void {
  const tile = deps.tiles.get(tileKey);
  if (!tile?.observatory) return;
  const updatedTile: DomainTileState = {
    ...tile,
    observatory: { ...tile.observatory, ...spendAetherTowerShot(tile.observatory, maxShots, now) }
  };
  deps.replaceTileState(tileKey, updatedTile, commandId);
  deps.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId,
    playerId,
    tileDeltas: [deps.tileDeltaFromState(updatedTile)]
  });
}
