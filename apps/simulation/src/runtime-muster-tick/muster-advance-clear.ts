import { appendPlayerEventLogEntry, type DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";

/**
 * "Clear this area and report back" behaviour for a human ADVANCE flag --
 * the macro-level order: plant a flag near a group of enemies, set it to
 * ADVANCE, walk away. Plain ADVANCE only ever sees enemies already touching
 * the player's own border, so barbarians standing out in the wilderness (or a
 * rival's border a few tiles off) were invisible to it and the player had to
 * expand out to each one by hand.
 *
 * AI flags are excluded: their planner budgets around today's behaviour, and
 * letting them expand toward enemies would be a balance change.
 */
export const isHumanFlagOwner = (input: MusterTickInput, playerId: string): boolean =>
  input.players.get(playerId)?.isAi === false;

const BARBARIAN_OWNER_ID = "barbarian-1";

// Ownership states ADVANCE/MARCH treat as attackable -- see their BFS filters.
const isAttackableState = (state: DomainTileState["ownershipState"]): boolean =>
  state === "FRONTIER" || state === "SETTLED" || state === "BARBARIAN";

/**
 * Nearest hostile tile within ADVANCE_MAX_RANGE_TILES (Chebyshev) of the flag:
 * a barbarian, or land owned by another player who is not allied with or
 * truced to the flag's owner. Ties prefer a barbarian (the softer target),
 * then the lowest y, then x, so the choice is stable tick to tick.
 *
 * Only consulted when nothing hostile touches the flag's territory, so the
 * flag knows which way to expand. A plain nested loop with one key per tile --
 * no coordinate arrays -- since idle flags run it on every search.
 */
export const nearestHostileInRange = (input: MusterTickInput, flag: DomainTileState, playerId: string): DomainTileState | undefined => {
  const actor = input.players.get(playerId);
  if (!actor) return undefined;
  let best: { tile: DomainTileState; dist: number } | undefined;
  for (let dy = -ADVANCE_MAX_RANGE_TILES; dy <= ADVANCE_MAX_RANGE_TILES; dy += 1) {
    for (let dx = -ADVANCE_MAX_RANGE_TILES; dx <= ADVANCE_MAX_RANGE_TILES; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrapX(flag.x + dx, WORLD_WIDTH);
      const y = wrapY(flag.y + dy, WORLD_HEIGHT);
      const tile = input.tiles.get(simulationTileKey(x, y));
      if (!tile?.ownerId || tile.ownerId === playerId || !isAttackableState(tile.ownershipState)) continue;
      if (isAlliedOrTruced(actor, tile.ownerId)) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (best && dist > best.dist) continue;
      if (best && dist === best.dist) {
        const barbarianWins = tile.ownerId === BARBARIAN_OWNER_ID && best.tile.ownerId !== BARBARIAN_OWNER_ID;
        const barbarianLoses = best.tile.ownerId === BARBARIAN_OWNER_ID && tile.ownerId !== BARBARIAN_OWNER_ID;
        if (barbarianLoses || (!barbarianWins && (y > best.tile.y || (y === best.tile.y && x > best.tile.x)))) continue;
      }
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
