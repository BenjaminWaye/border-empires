import { DEV_QUEUE_TOTAL_CAP, SETTLE_COST, SETTLE_MANPOWER_COST, settleIgnoresReach } from "@border-empires/shared";
import { hasQueuedSettlementForTile } from "../client-development-queue/client-development-queue.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Explicit UI bound: never retain a region-sized selection or persist it.
export const GARRISON_MANY_LIMIT = DEV_QUEUE_TOTAL_CAP;
export type GarrisonManyState = { active: boolean; keys: string[]; invalidKeys: string[]; originKey: string };
export const createGarrisonManyState = (): GarrisonManyState => ({ active: false, keys: [], invalidKeys: [], originKey: "" });
export const garrisonTileReason = (state: ClientState, tile: Tile | undefined): string => {
  if (!tile || tile.fogged) return "Tile is not visible";
  if (tile.terrain !== "LAND" || tile.ownerId !== state.me) return "Not your land";
  if (tile.ownershipState !== "FRONTIER") return "Already garrisoned";
  const key = `${tile.x},${tile.y}`;
  if (state.settleProgressByTile.has(key)) return "Garrison already in progress";
  if (hasQueuedSettlementForTile(state.developmentQueue, key)) return "Garrison already queued";
  if (state.capture?.target.x === tile.x && state.capture.target.y === tile.y ||
      state.actionInFlight && state.actionTargetKey === key ||
      (state.frontierSyncWaitUntilByTarget.get(key) ?? 0) > Date.now()) return "Waiting for combat or tile sync";
  if (!settleIgnoresReach(tile) && !authoritativeIsInReach(state, (x, y) => `${x},${y}`)(tile.x, tile.y)) return "Outside your reach";
  return "";
};

export type GarrisonManyReview = {
  tiles: Tile[];
  excluded: { key: string; reason: string }[];
  manpower: number;
  coin: number;
  reservedManpower: number;
  canStart: number;
  waiting: number;
  blocked: string;
  signature: string;
};

export const reviewGarrisonMany = (state: ClientState, availableSlots: number): GarrisonManyReview => {
  const tiles: Tile[] = [];
  const excluded: GarrisonManyReview["excluded"] = [];
  for (const key of state.garrisonMany.keys) {
    const tile = state.tiles.get(key);
    const reason = garrisonTileReason(state, tile);
    if (reason || !tile) excluded.push({ key, reason });
    else tiles.push(tile);
  }
  const queuedSettlements = state.developmentQueue.filter((entry) => entry.kind === "SETTLE").length;
  const manpower = tiles.length * SETTLE_MANPOWER_COST;
  const coin = tiles.length * SETTLE_COST;
  const reservedManpower = queuedSettlements * SETTLE_MANPOWER_COST;
  const canStart = state.developmentQueue.length || state.queuedDevelopmentDispatchPending ? 0 : Math.min(tiles.length, availableSlots);
  const waiting = tiles.length - canStart;
  let blocked = "";
  if (!state.authSessionReady) blocked = "Waiting for connection";
  else if (!tiles.length) blocked = "Select eligible frontier tiles";
  else if (tiles.length + state.developmentQueue.length > DEV_QUEUE_TOTAL_CAP) blocked = `Queue has room for ${Math.max(0, DEV_QUEUE_TOTAL_CAP - state.developmentQueue.length)} more tiles`;
  else if (state.manpower < manpower + reservedManpower) blocked = `Need ${manpower + reservedManpower} manpower including existing queued garrisons; ${Math.floor(state.manpower)} available`;
  else if (state.gold < coin + queuedSettlements * SETTLE_COST) blocked = "Not enough coin including existing queued garrisons";
  const signature = JSON.stringify({ keys: tiles.map((tile) => `${tile.x},${tile.y}`), excluded, manpower, coin, canStart, waiting, blocked,
    queue: state.developmentQueue.map((entry) => [entry.kind, entry.tileKey]) });
  return { tiles, excluded, manpower, coin, reservedManpower, canStart, waiting, blocked, signature };
};
