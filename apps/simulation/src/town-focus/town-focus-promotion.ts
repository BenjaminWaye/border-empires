// Makes picked town focus changes active (docs/town-focus-plan.md). Runs after
// each population growth tick, so a growth tick never pays a focus for time
// before it was applied.
//
// Manpower and Coin are settled at the rate in force since the last settle, so
// a rate that flipped by clock alone would be paid retroactively. Each owner
// with a due change is therefore settled at the old rates first, then the
// focus is promoted through replaceTileState, which refreshes the summary
// and economy caches the new rates are read from.
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { promoteTownFocus } from "@border-empires/shared";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type TownFocusPromotionDeps = {
  players: ReadonlyMap<string, unknown>;
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  /** Pays income and manpower up to `at` at the current rates (the old focus). */
  settleEconomy: (at: number, playerIds: readonly string[]) => void;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
};

/**
 * Promotes every pending town focus; returns how many towns changed. A pending focus queued for a later refill
 * under the old rule is promoted too, since the client shows a pending focus as the town's focus.
 */
export const promoteDueTownFocus = (deps: TownFocusPromotionDeps, nowMs: number): number => {
  let promoted = 0;
  for (const playerId of deps.players.keys()) {
    const due: Array<[string, DomainTileState]> = [];
    for (const tileKey of deps.summaryForPlayer(playerId).ownedTownTierByTile.keys()) {
      const tile = deps.tiles.get(tileKey);
      if (tile?.town && tile.ownerId === playerId && tile.town.pendingFocus !== undefined) due.push([tileKey, tile]);
    }
    if (due.length === 0) continue;
    deps.settleEconomy(nowMs, [playerId]);
    const commandId = `town-focus:${playerId}:${nowMs}`;
    const written = due.map(([tileKey, tile]) => {
      const next: DomainTileState = { ...tile, town: promoteTownFocus(tile.town!) };
      deps.replaceTileState(tileKey, next, commandId);
      return next;
    });
    promoted += written.length;
    deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: written.map((tile) => deps.tileDeltaFromState(tile)) });
    deps.emitPlayerStateUpdate({ commandId, playerId });
  }
  return promoted;
};
