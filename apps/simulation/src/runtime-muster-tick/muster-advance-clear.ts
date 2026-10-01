import { appendPlayerEventLogEntry, type DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceToroidal, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";

const BARBARIAN_OWNER_ID = "barbarian-1";

/**
 * "Clear this area and report back" behaviour for a human ADVANCE flag --
 * the macro-level order: plant a flag near a group of barbarians, set it to
 * ADVANCE, walk away. Plain ADVANCE only ever sees enemies already touching
 * the player's own border, so barbarians standing out in the wilderness were
 * invisible to it and the player had to expand out to each one by hand.
 *
 * AI flags are excluded: their planner budgets around today's behaviour, and
 * letting them expand toward barbarians would be a balance change.
 */
export const isHumanFlagOwner = (input: MusterTickInput, playerId: string): boolean =>
  input.players.get(playerId)?.isAi === false;

/**
 * Nearest barbarian tile within ADVANCE_MAX_RANGE_TILES of the flag, or
 * undefined. Ties break on y then x so the choice is stable tick to tick.
 */
export const nearestBarbarianInRange = (input: MusterTickInput, flag: DomainTileState): DomainTileState | undefined => {
  let best: { tile: DomainTileState; dist: number } | undefined;
  for (const { x, y } of coordsInChebyshevRadius(flag.x, flag.y, ADVANCE_MAX_RANGE_TILES)) {
    const tile = input.tiles.get(simulationTileKey(x, y));
    if (tile?.ownerId !== BARBARIAN_OWNER_ID) continue;
    const dist = chebyshevDistanceToroidal(flag.x, flag.y, x, y);
    if (!best || dist < best.dist || (dist === best.dist && (y < best.tile.y || (y === best.tile.y && x < best.tile.x)))) {
      best = { tile, dist };
    }
  }
  return best?.tile;
};

/**
 * Records that this ADVANCE flag has engaged with something (see
 * MusterState.clearing). Reads the *current* tile rather than trusting the
 * caller's copy, which syncMusterStatus may already have replaced this tick.
 * No delta is emitted: the next status sync carries the field to the client.
 */
export const markAdvanceClearing = (input: MusterTickInput, originKey: string): void => {
  const tile = input.tiles.get(originKey);
  if (!tile?.muster || tile.muster.clearing) return;
  input.replaceTileState(originKey, { ...tile, muster: { ...tile.muster, clearing: true } });
};

/**
 * Ends a finished clearing order: the flag drops back to HOLD and the player
 * gets an "Area cleared" Activity Feed entry (pushed immediately, and kept in
 * the durable event log for players who were offline).
 */
export const completeAdvanceClearing = (input: MusterTickInput, originKey: string, playerId: string): void => {
  const tile = input.tiles.get(originKey);
  if (!tile?.muster) return;
  const holdTile: DomainTileState = {
    ...tile,
    muster: {
      ...tile.muster,
      mode: "HOLD",
      clearing: undefined,
      inFlight: undefined,
      inFlightCount: undefined,
      nextActionAt: undefined,
      fightX: undefined,
      fightY: undefined,
      noTargetInRange: undefined,
      insufficientManpower: undefined
    }
  };
  const commandId = `muster-area-cleared:${playerId}:${originKey}:${input.nowMs}`;
  input.replaceTileState(originKey, holdTile);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(holdTile)] });
  input.advanceCooldowns.delete(originKey);
  const player = input.players.get(playerId);
  if (!player) return;
  appendPlayerEventLogEntry(player, {
    type: "AREA_CLEARED",
    text: `Area cleared near (${tile.x}, ${tile.y}). The flag is holding again.`,
    occurredAt: input.nowMs,
    x: tile.x,
    y: tile.y
  });
  input.emitPlayerStateUpdate({ commandId, playerId });
};
