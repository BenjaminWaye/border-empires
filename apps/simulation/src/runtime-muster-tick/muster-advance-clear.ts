import { appendPlayerEventLogEntry, type DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { BARBARIAN_PLAYER_ID } from "../ai/system-job-barbarian-planner.js";
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

// Ownership states ADVANCE/MARCH treat as attackable -- see their BFS filters.
const isAttackableState = (state: DomainTileState["ownershipState"]): boolean =>
  state === "FRONTIER" || state === "SETTLED" || state === "BARBARIAN";

type HostileFind = { tile: DomainTileState; steps: number };

/** True when `a` is a better pick than `b` at the same step count: a barbarian (the softer target), then lowest y, then x. */
const winsTie = (a: DomainTileState, b: DomainTileState): boolean => {
  const aBarb = a.ownerId === BARBARIAN_PLAYER_ID;
  const bBarb = b.ownerId === BARBARIAN_PLAYER_ID;
  if (aBarb !== bBarb) return aBarb;
  return a.y !== b.y ? a.y < b.y : a.x < b.x;
};

/**
 * Nearest hostile tile within ADVANCE_MAX_RANGE_TILES *steps* of the flag, where
 * a step moves through the flag owner's own land or neutral land -- never water
 * or mountains, and never another player's land (that is a target, not a road).
 * Hostile means a barbarian or a player who is not an ally and has no truce.
 *
 * This is how far a flag can really send troops, so it is also what decides
 * whether the order is finished: an enemy across a lake or behind a mountain
 * range is not in range even if it is close in a straight line, and an enemy
 * that merely doesn't touch our border yet is, if neutral ground leads to it.
 * It is the counterpart to the attack search in muster-advance-fire.ts, which
 * only walks our own land (an attack must launch from an owned tile); this
 * one also walks neutral land because that is where the flag expands next.
 *
 * Ties at the same step count prefer a barbarian, then the lowest y, then x, so
 * the choice is stable tick to tick. A plain breadth-first walk with one key
 * per tile and no per-neighbor arrays: idle flags run it on every search.
 */
export const nearestHostileWithinSteps = (input: MusterTickInput, flag: DomainTileState, playerId: string): DomainTileState | undefined => {
  const actor = input.players.get(playerId);
  if (!actor) return undefined;
  // Dock and aether-bridge crossings are one step, same as in the attack search
  // (muster-advance-fire.ts), so an enemy across one is not "out of range".
  const bridgeLinks = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const visited = new Set<number>([flag.y * WORLD_WIDTH + flag.x]);
  const queue: DomainTileState[] = [flag];
  const queueDepth: number[] = [0];
  let best: HostileFind | undefined;

  const consider = (x: number, y: number, depth: number): void => {
    const numericKey = y * WORLD_WIDTH + x;
    if (visited.has(numericKey)) return;
    visited.add(numericKey);
    const tile = input.tiles.get(simulationTileKey(x, y));
    if (!tile || tile.terrain !== "LAND") return;
    if (!tile.ownerId || tile.ownerId === playerId) {
      // Our land or neutral land: a road. Hostile tiles found from a node at
      // depth d are d + 1 steps away, so nodes at the cap stay leaves.
      if (depth + 1 < ADVANCE_MAX_RANGE_TILES) {
        queue.push(tile);
        queueDepth.push(depth + 1);
      }
      return;
    }
    if (!isAttackableState(tile.ownershipState) || isAlliedOrTruced(actor, tile.ownerId)) return;
    if (!best || depth + 1 < best.steps || (depth + 1 === best.steps && winsTie(tile, best.tile))) {
      best = { tile, steps: depth + 1 };
    }
  };

  for (let head = 0; head < queue.length; head += 1) {
    const depth = queueDepth[head]!;
    // Anything found from here on is at least depth + 1 steps away.
    if (best && depth + 1 > best.steps) break;
    const node = queue[head]!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        consider(wrapX(node.x + dx, WORLD_WIDTH), wrapY(node.y + dy, WORLD_HEIGHT), depth);
      }
    }
    // Only docks and bridge endpoints have links; the key is built just for them.
    if (node.dockId !== undefined || bridgeLinks.size > 0) {
      const nodeKey = simulationTileKey(node.x, node.y);
      for (const linkedKeys of [input.dockLinksByDockTileKey.get(nodeKey), bridgeLinks.get(nodeKey)]) {
        for (const linkedKey of linkedKeys ?? []) {
          const [lx, ly] = linkedKey.split(",").map(Number);
          if (lx !== undefined && ly !== undefined) consider(lx, ly, depth);
        }
      }
    }
  }
  return best?.tile;
};

/**
 * Records that this human ADVANCE flag has engaged with something (see
 * MusterState.clearing) -- call it once a command was actually accepted, so a
 * rejected attack or expansion doesn't count. A no-op for AI flags, whose
 * ADVANCE behaviour is unchanged. Reads the *current* tile rather than trusting
 * the caller's copy, which syncMusterStatus may already have replaced this tick,
 * and emits one delta (the first time only) so the client can show it.
 */
export const markAdvanceClearing = (input: MusterTickInput, originKey: string, playerId: string): void => {
  if (!isHumanFlagOwner(input, playerId)) return;
  const tile = input.tiles.get(originKey);
  if (!tile?.muster || tile.muster.clearing) return;
  const markedTile: DomainTileState = { ...tile, muster: { ...tile.muster, clearing: true } };
  input.replaceTileState(originKey, markedTile);
  input.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `muster-clearing:${playerId}:${originKey}:${input.nowMs}`,
    playerId,
    tileDeltas: [input.tileDeltaFromState(markedTile)]
  });
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
