// Garrison on a town garrisons the town tile first, then every tile around it (the town's support ring).
// No Expand step is needed for the ring: once the town is garrisoned its reach claims the neutral tiles
// around it on its own (server reach auto-claim), so each ring tile only costs a garrison. The Garrison
// button therefore prices the whole job (town + ring), and processTownRingGarrisons (runtime tick, via
// processAutoSettleTargets in client-action-flow.ts) sends the ring's SETTLEs once the town has landed
// SETTLED and each ring tile is your in-reach FRONTIER.
//
// townRingGarrisons is client-only and transient. It is bounded directly (state-and-persistence-discipline.md):
// at most TOWN_RING_GARRISON_MAX_ENTRIES towns (oldest evicted), each entry dropped after
// TOWN_RING_GARRISON_TTL_MS, and after TOWN_RING_AFTER_SETTLE_WINDOW_MS once its town is garrisoned.
import { SETTLE_COST, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type TownRingGarrison = { ringKeys: string[]; startedAt: number; townSettledAt?: number };

type RingState = { tiles: ReadonlyMap<string, Tile>; me: string; townRingGarrisons: Map<string, TownRingGarrison> };

export const TOWN_RING_GARRISON_MAX_ENTRIES = 32;
/** Covers the town's own garrison timer plus time spent waiting in the development queue for manpower. */
export const TOWN_RING_GARRISON_TTL_MS = 30 * 60_000;
/** How long after the town lands SETTLED its reach has to claim the ring before the leftovers are dropped. */
export const TOWN_RING_AFTER_SETTLE_WINDOW_MS = 2 * 60_000;

const keyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * The tiles around a town that its Garrison also garrisons: land in the town's support ring that is your
 * frontier (not already being garrisoned), or neutral ground outside every border. Only the latter is claimed
 * by the town's reach when it activates (server: runtime-reach-border-apply.ts auto-claims only tiles that newly
 * enter the owner's border); neutral ground already inside your or a rival's border (`reachOwnerId`) is not, so
 * it is neither priced nor promised.
 */
export const townRingGarrisonTiles = (
  state: Pick<RingState, "tiles" | "me">,
  town: Tile,
  isSettling: (tileKey: string) => boolean = () => false
): Tile[] => {
  if (!town.town) return [];
  return supportRingCandidates(state.tiles, town.x, town.y, supportRingRadiusForTier(town.town.populationTier))
    .map(({ tile }) => tile)
    .filter((tile) => {
      if (tile.terrain !== "LAND") return false;
      if (!tile.ownerId) return !tile.reachOwnerId;
      return tile.ownerId === state.me && tile.ownershipState === "FRONTIER" && !isSettling(keyOf(tile.x, tile.y));
    });
};

/** "N coin, M manpower" for garrisoning `tile` -- for a town, the town plus every tile around it. */
export const garrisonCostText = (
  state: Pick<RingState, "tiles" | "me"> & { settleManpowerCost: number },
  tile: Tile,
  isSettling?: (tileKey: string) => boolean
): string => {
  const ring = townRingGarrisonTiles(state, tile, isSettling).length;
  const count = 1 + ring;
  const base = `${count * SETTLE_COST} coin, ${count * state.settleManpowerCost} manpower`;
  return ring > 0 ? `${base} (town + ${ring} around)` : base;
};

/** Remember to garrison the ring once `town` lands SETTLED. Returns how many ring tiles were queued. */
export const registerTownRingGarrison = (state: RingState, town: Tile, now: number): number => {
  const ringKeys = townRingGarrisonTiles(state, town).map((tile) => keyOf(tile.x, tile.y));
  const townKey = keyOf(town.x, town.y);
  state.townRingGarrisons.delete(townKey);
  if (ringKeys.length === 0) return 0;
  while (state.townRingGarrisons.size >= TOWN_RING_GARRISON_MAX_ENTRIES) {
    const oldest = state.townRingGarrisons.keys().next().value;
    if (oldest === undefined) break;
    state.townRingGarrisons.delete(oldest);
  }
  state.townRingGarrisons.set(townKey, { ringKeys, startedAt: now });
  return ringKeys.length;
};

/** Garrison a frontier tile; a town also queues the tiles around it for right after the town is garrisoned. */
export const requestGarrisonWithTownRing = (
  state: RingState,
  tile: Tile,
  requestSettlement: (x: number, y: number) => boolean,
  now: number
): boolean => {
  const requested = requestSettlement(tile.x, tile.y);
  if (requested && tile.town) registerTownRingGarrison(state, tile, now);
  return requested;
};

export type TownRingGarrisonDeps = {
  now: number;
  reach: { has: (tileKey: string) => boolean };
  /** A SETTLE for this tile is already running or waiting in the development queue. */
  isSettling: (tileKey: string) => boolean;
  requestSettlement: (x: number, y: number) => boolean;
};

/** Runtime tick: once a town is garrisoned, garrison each ring tile as it becomes your in-reach frontier. */
export const processTownRingGarrisons = (state: RingState, deps: TownRingGarrisonDeps): void => {
  for (const [townKey, entry] of [...state.townRingGarrisons]) {
    const town = state.tiles.get(townKey);
    if (!town || town.ownerId !== state.me) {
      state.townRingGarrisons.delete(townKey);
      continue;
    }
    // Wait for the server's SETTLED, not the local timer's optimistic one (optimisticPending "settle").
    if (town.ownershipState !== "SETTLED" || town.optimisticPending) {
      if (entry.townSettledAt === undefined && deps.now - entry.startedAt > TOWN_RING_GARRISON_TTL_MS) state.townRingGarrisons.delete(townKey);
      continue;
    }
    entry.townSettledAt ??= deps.now;
    if (deps.now - entry.townSettledAt > TOWN_RING_AFTER_SETTLE_WINDOW_MS) {
      state.townRingGarrisons.delete(townKey);
      continue;
    }
    const remaining: string[] = [];
    for (const key of entry.ringKeys) {
      const tile = state.tiles.get(key);
      if (!tile) {
        remaining.push(key);
        continue;
      }
      if (tile.ownerId && tile.ownerId !== state.me) continue;
      if (tile.ownerId === state.me && tile.ownershipState !== "FRONTIER") continue;
      if (deps.isSettling(key)) continue;
      // A request that could not be queued (e.g. the development queue is full) is retried next tick.
      if (tile.ownerId === state.me && !tile.optimisticPending && deps.reach.has(key) && deps.requestSettlement(tile.x, tile.y)) continue;
      remaining.push(key); // still neutral (reach claim pending) or not yet in reach
    }
    if (remaining.length === 0) state.townRingGarrisons.delete(townKey);
    else entry.ringKeys = remaining;
  }
};
