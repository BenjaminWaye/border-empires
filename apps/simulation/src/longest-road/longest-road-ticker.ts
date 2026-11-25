// Live Longest Road holder: recomputed at boot and then every 4 hours from the side
// tickers (side-tickers/runtime-side-tickers.ts) and pushed to every online
// human as LONGEST_ROAD when the holder, length or towns change, and on
// connect. Cost: one pass over the land of each empire with 2+ towns, then
// typed-array searches (longest-road-core.ts); no world scan. Derived, never
// snapshotted.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { LONGEST_ROAD_MESSAGE_TYPE, type LiveLongestRoad, type LongestRoadPayload } from "@border-empires/shared";
import { longestRoadFrom, type LongestRoad, type RoadTile } from "./longest-road-core.js";

/** A new pass starts this long after the last one started. */
export const LONGEST_ROAD_PASS_INTERVAL_MS = 4 * 60 * 60_000;

export type LongestRoadTickerDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  /** Tile keys of the towns a player owns (runtime summary). */
  readonly townTileKeys: (playerId: string) => Iterable<string>;
  /** Tile keys of all land a player owns (runtime summary); only read for empires with 2+ towns. */
  readonly territoryTileKeys: (playerId: string) => Iterable<string>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: LongestRoadPayload) => void;
};

export type LongestRoadTicker = {
  readonly tick: (nowMs: number) => void;
  readonly sendTo: (playerId: string) => void;
};

const roadTileOf = (tile: DomainTileState | undefined): RoadTile | undefined =>
  tile && { x: tile.x, y: tile.y, terrain: tile.terrain, ownerId: tile.ownerId, ownershipState: tile.ownershipState, townTier: tile.town?.populationTier, townName: tile.town?.name };

/** The current holder, from every player's towns (stable order: player id, then tile key). */
type Deps = Pick<LongestRoadTickerDeps, "tiles" | "players" | "townTileKeys" | "territoryTileKeys">;

/** Ids of players with 2+ towns, in the stable order ties are broken by. */
const roadCandidates = (deps: Deps): string[] =>
  [...deps.players().keys()].filter((id) => [...deps.townTileKeys(id)].length >= 2).sort();

const roadForEmpire = (deps: Deps, playerId: string): LongestRoad | undefined => {
  const tiles = deps.tiles();
  const player = deps.players().get(playerId);
  const empire = { ownerId: playerId, townKeys: [...deps.townTileKeys(playerId)].sort(), landKeys: deps.territoryTileKeys(playerId) };
  return longestRoadFrom((key) => roadTileOf(tiles.get(key)), [empire], player ? [player] : []);
};

const toLive = (road: LongestRoad | undefined): LiveLongestRoad | null =>
  road?.playerId ? { playerId: road.playerId, playerName: road.playerName ?? road.playerId, tileCount: road.tileCount, fromTown: road.fromCity?.name ?? "", toTown: road.toCity?.name ?? "" } : null;

/** The first strictly longest road, in candidate order. */
const longestOf = (roads: Iterable<LongestRoad | undefined>): LongestRoad | undefined => {
  let best: LongestRoad | undefined;
  for (const road of roads) if (road && (!best || road.tileCount > best.tileCount)) best = road;
  return best;
};

/** The current holder, all at once (tests and one-off reads). */
export const computeLiveLongestRoad = (deps: Deps): LiveLongestRoad | null =>
  toLive(longestOf(roadCandidates(deps).map((id) => roadForEmpire(deps, id))));

/**
 * Spreads a pass over the 1 s side ticks, one empire per tick, so no tick
 * carries more than the largest empire's search; publishes when the pass ends.
 */
export const createLongestRoadTicker = (deps: LongestRoadTickerDeps): LongestRoadTicker => {
  let passStartedAt = Number.NEGATIVE_INFINITY;
  let pending: string[] = [];
  let roads: Array<LongestRoad | undefined> = [];
  // undefined until the first pass finishes, so a connect before then gets nothing rather than "no road".
  let current: LiveLongestRoad | null | undefined;
  let signature = "";
  const payload = (): LongestRoadPayload => ({ type: LONGEST_ROAD_MESSAGE_TYPE, road: current ?? null });
  const sendTo = (playerId: string): void => {
    const player = deps.players().get(playerId);
    if (!player || player.isAi || current === undefined) return;
    deps.emitPlayerMessage({ commandId: `longest-road:${playerId}`, playerId }, payload());
  };
  const finishPass = (): void => {
    current = toLive(longestOf(roads));
    roads = [];
    const next = JSON.stringify(current);
    if (next === signature) return;
    signature = next;
    for (const [playerId, player] of deps.players()) if (!player.isAi && deps.isPlayerSubscribed(playerId)) sendTo(playerId);
  };
  return {
    tick: (nowMs) => {
      if (pending.length === 0) {
        if (nowMs - passStartedAt < LONGEST_ROAD_PASS_INTERVAL_MS) return;
        passStartedAt = nowMs;
        pending = roadCandidates(deps);
        if (pending.length === 0) { finishPass(); return; }
      }
      // An empire that fell below two towns mid-pass simply has no road.
      roads.push(roadForEmpire(deps, pending.shift()!));
      if (pending.length === 0) finishPass();
    },
    sendTo
  };
};
