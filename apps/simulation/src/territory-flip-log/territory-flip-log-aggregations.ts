// Pure aggregation functions over a TerritoryFlip[] (see territory-flip-log.ts)
// and, for computeWars, a social snapshot of active alliances. No sim/gateway
// state is read directly -- callers pass in already-collected data, which
// keeps these easy to unit test with hand-built fixtures.
import type {
  BiggestSwing24h,
  FrontlineHotspot,
  TerritoryMomentumEntry,
  WarSummary
} from "@border-empires/game-domain";

import type { TerritoryFlip } from "./territory-flip-log.js";
import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";

export type { BiggestSwing24h, FrontlineHotspot, WarSummary };
export type TerritoryMomentum = TerritoryMomentumEntry;

export const orderedPairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Groups flips into unordered (playerA, playerB) contests: a flip counts
 * toward a pair whenever it moved a tile between two real (non-neutral)
 * players, in either direction. Pairs currently under an active alliance
 * (per `alliedPairKeys`) are excluded -- an alliance can still show tile
 * churn from before it formed, which isn't a "war". Flips involving the
 * barbarian system player (`excludeBarbarianId`) are excluded too -- routine
 * frontier skirmishing against the permanent NPC faction reads as an actual
 * rival "war" otherwise (see BARBARIAN_PLAYER_ID's doc comment).
 * `tileFlips24h` (war intensity, used for ranking) counts every flip;
 * `tilesContested24h` counts distinct tiles, for "N tiles changed hands".
 */
export const computeWars = (
  flipLog: readonly TerritoryFlip[],
  alliedPairKeys: ReadonlySet<string>,
  excludeBarbarianId: string
): WarSummary[] => {
  const byPair = new Map<string, { war: WarSummary; tiles: Set<string> }>();
  for (const flip of flipLog) {
    if (!flip.fromOwner || !flip.toOwner || flip.fromOwner === flip.toOwner) continue;
    if (flip.fromOwner === excludeBarbarianId || flip.toOwner === excludeBarbarianId) continue;
    const key = orderedPairKey(flip.fromOwner, flip.toOwner);
    if (alliedPairKeys.has(key)) continue;
    const [playerA, playerB] = flip.fromOwner < flip.toOwner ? [flip.fromOwner, flip.toOwner] : [flip.toOwner, flip.fromOwner];
    let entry = byPair.get(key);
    if (!entry) {
      entry = { war: { playerA, playerB, tileFlips24h: 0, tilesContested24h: 0, lastFlipAt: flip.at }, tiles: new Set() };
      byPair.set(key, entry);
    }
    entry.war.tileFlips24h += 1;
    entry.tiles.add(flip.tileId);
    entry.war.tilesContested24h = entry.tiles.size;
    if (flip.at > entry.war.lastFlipAt) entry.war.lastFlipAt = flip.at;
  }
  return [...byPair.values()].map(({ war }) => war).sort((a, b) => b.tileFlips24h - a.tileFlips24h);
};

/** Alliance pair keys in the same `orderedPairKey` shape computeWars expects. */
export const alliancePairKeySet = (alliances: ReadonlyArray<{ playerA: string; playerB: string }>): Set<string> =>
  new Set(alliances.map(({ playerA, playerB }) => orderedPairKey(playerA, playerB)));

// Distinct tiles gained / lost per player: retaking the same tile twice in
// the window is still one tile gained.
//
// Net is computed per tile from its owner at the start of the window (the
// first logged flip's `fromOwner`) versus its owner at the end: +1 to the end
// owner, -1 to the start owner, 0 if they match. That bounds every player's
// |net| by distinct tiles gained + lost. A per-flip +1/-1 counter does NOT:
// it only telescopes when every ownership change is logged, and several
// paths aren't (barbarian walk releases -- 2026-11-01: 475 distinct tiles
// reported as +47,356 net -- frontier decay, AFC landing clears, reach
// vacates). The end owner is the last logged flip's `toOwner`, credited only
// if `currentOwnerOf` (live tile state) says they still hold the tile, so
// land lost through an unlogged path afterwards isn't counted as a gain.
//
// Assumes `flipLog` is in `at` order, which the log guarantees: record() only
// ever appends the current time, and restore() sorts.
export type TerritoryMomentumOptions = {
  /** Drops this player's own row (the barbarian system player, matching computeWars/computeFrontlineHotspots). */
  excludeBarbarianId?: string;
  /** Live owner of a tile by tileId; when omitted the last logged owner is trusted. */
  currentOwnerOf?: (tileId: string) => string | undefined;
};

export const computeTerritoryMomentum = (
  flipLog: readonly TerritoryFlip[],
  options: TerritoryMomentumOptions = {}
): TerritoryMomentum[] => {
  type Momentum = { gained: Set<string>; lost: Set<string>; net: number };
  const byPlayer = new Map<string, Momentum>();
  const touch = (playerId: string): Momentum => {
    let entry = byPlayer.get(playerId);
    if (!entry) {
      entry = { gained: new Set(), lost: new Set(), net: 0 };
      byPlayer.set(playerId, entry);
    }
    return entry;
  };
  const tileSpan = new Map<string, { startOwner: string | undefined; endOwner: string | undefined }>();
  for (const flip of flipLog) {
    if (flip.toOwner === flip.fromOwner) continue;
    if (flip.toOwner) touch(flip.toOwner).gained.add(flip.tileId);
    if (flip.fromOwner) touch(flip.fromOwner).lost.add(flip.tileId);
    const span = tileSpan.get(flip.tileId);
    if (span) span.endOwner = flip.toOwner;
    else tileSpan.set(flip.tileId, { startOwner: flip.fromOwner, endOwner: flip.toOwner });
  }
  for (const [tileId, { startOwner, endOwner: lastLoggedOwner }] of tileSpan) {
    const endOwner = options.currentOwnerOf && options.currentOwnerOf(tileId) !== lastLoggedOwner ? undefined : lastLoggedOwner;
    if (startOwner === endOwner) continue;
    if (endOwner) touch(endOwner).net += 1;
    if (startOwner) touch(startOwner).net -= 1;
  }
  return [...byPlayer.entries()]
    .filter(([playerId]) => playerId !== options.excludeBarbarianId)
    .map(([playerId, { gained, lost, net }]) => ({
      playerId,
      tilesGained24h: gained.size,
      tilesLost24h: lost.size,
      net24h: net
    }))
    .sort((a, b) => b.net24h - a.net24h);
};

// `excludeBarbarianId` keeps the barbarian system player from being reported
// as suffering the day's biggest defeat (the daily story's "Biggest Defeat").
export const computeBiggestSwing24h = (flipLog: readonly TerritoryFlip[], excludeBarbarianId?: string): BiggestSwing24h => {
  if (flipLog.length === 0) return null;
  const momentum = computeTerritoryMomentum(flipLog, excludeBarbarianId === undefined ? {} : { excludeBarbarianId });
  const worst = momentum.reduce<TerritoryMomentum | undefined>((acc, entry) => {
    if (entry.tilesLost24h === 0) return acc;
    if (!acc || entry.tilesLost24h > acc.tilesLost24h) return entry;
    return acc;
  }, undefined);
  if (!worst) return null;
  const losses = flipLog.filter((flip) => flip.fromOwner === worst.playerId && flip.toOwner !== worst.playerId);
  let windowStart = losses[0]!.at;
  let windowEnd = losses[0]!.at;
  for (const flip of losses) {
    if (flip.at < windowStart) windowStart = flip.at;
    if (flip.at > windowEnd) windowEnd = flip.at;
  }
  return { playerId: worst.playerId, tilesLost: worst.tilesLost24h, windowStart, windowEnd };
};

const FRONTLINE_HOTSPOT_TOP_N = 20;

// Combat losses carry only x/y (see CombatManpowerLoss), not the flip log's
// tileId, so tiles are matched by coordinate here rather than joined on id.
const tileCoordKey = (x: number, y: number): string => `${x},${y}`;

// Excludes flips/manpower touching the barbarian system player -- otherwise
// a player's routine frontier grind against the permanent NPC faction
// dominates "fiercest fighting" (see computeWars's doc comment for the same
// rationale).
export const computeFrontlineHotspots = (
  flipLog: readonly TerritoryFlip[],
  combatManpowerLog: readonly CombatManpowerLoss[] = [],
  excludeBarbarianId?: string
): FrontlineHotspot[] => {
  const byTile = new Map<string, { x: number; y: number; flips: number; contestedBy: Set<string> }>();
  for (const flip of flipLog) {
    if (flip.fromOwner === excludeBarbarianId || flip.toOwner === excludeBarbarianId) continue;
    let entry = byTile.get(flip.tileId);
    if (!entry) {
      entry = { x: flip.x, y: flip.y, flips: 0, contestedBy: new Set() };
      byTile.set(flip.tileId, entry);
    }
    entry.flips += 1;
    if (flip.fromOwner) entry.contestedBy.add(flip.fromOwner);
    if (flip.toOwner) entry.contestedBy.add(flip.toOwner);
  }
  const manpowerLostByCoord = new Map<string, number>();
  for (const loss of combatManpowerLog) {
    const key = tileCoordKey(loss.x, loss.y);
    manpowerLostByCoord.set(key, (manpowerLostByCoord.get(key) ?? 0) + loss.manpowerLoss);
  }
  return [...byTile.entries()]
    .map(([tileId, { x, y, flips, contestedBy }]) => ({
      tileId,
      x,
      y,
      flips24h: flips,
      contestedBy: [...contestedBy].sort(),
      manpowerLost24h: Math.round(manpowerLostByCoord.get(tileCoordKey(x, y)) ?? 0)
    }))
    .sort((a, b) => b.flips24h - a.flips24h)
    .slice(0, FRONTLINE_HOTSPOT_TOP_N);
};
