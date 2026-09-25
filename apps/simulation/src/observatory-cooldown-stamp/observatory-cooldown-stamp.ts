// Observatory (Aether Tower) cooldown stamp — extracted out of runtime.ts
// (over the repo's per-file line cap) so the Siphon siphon-mode lifecycle
// (siphon-mode/siphon-mode-lifecycle.ts) can reuse the exact same write when
// a siphon ends, instead of duplicating it.
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type ObservatoryTileWriteDeps = {
  tiles: ReadonlyMap<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
};

/**
 * Stamp cooldownUntil = now + durationMs onto the observatory at `tileKey`.
 * Updates the canonical tile state and emits a tile delta so clients see the new
 * cooldown via `tile.observatory.cooldownUntil`.
 */
export function stampObservatoryCooldown(
  deps: ObservatoryTileWriteDeps,
  tileKey: string,
  durationMs: number,
  now: number,
  commandId: string,
  playerId: string
): void {
  const tile = deps.tiles.get(tileKey);
  if (!tile?.observatory) return;
  const updatedTile: DomainTileState = {
    ...tile,
    observatory: { ...tile.observatory, cooldownUntil: now + durationMs }
  };
  deps.replaceTileState(tileKey, updatedTile, commandId);
  deps.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId,
    playerId,
    tileDeltas: [deps.tileDeltaFromState(updatedTile)]
  });
}
