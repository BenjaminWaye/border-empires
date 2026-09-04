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
 * churn from before it formed, which isn't a "war".
 */
export const computeWars = (
  flipLog: readonly TerritoryFlip[],
  alliedPairKeys: ReadonlySet<string>
): WarSummary[] => {
  const byPair = new Map<string, WarSummary>();
  for (const flip of flipLog) {
    if (!flip.fromOwner || !flip.toOwner || flip.fromOwner === flip.toOwner) continue;
    const key = orderedPairKey(flip.fromOwner, flip.toOwner);
    if (alliedPairKeys.has(key)) continue;
    const [playerA, playerB] = flip.fromOwner < flip.toOwner ? [flip.fromOwner, flip.toOwner] : [flip.toOwner, flip.fromOwner];
    const existing = byPair.get(key);
    if (existing) {
      existing.tileFlips24h += 1;
      if (flip.at > existing.lastFlipAt) existing.lastFlipAt = flip.at;
    } else {
      byPair.set(key, { playerA, playerB, tileFlips24h: 1, lastFlipAt: flip.at });
    }
  }
  return [...byPair.values()].sort((a, b) => b.tileFlips24h - a.tileFlips24h);
};

/** Alliance pair keys in the same `orderedPairKey` shape computeWars expects. */
export const alliancePairKeySet = (alliances: ReadonlyArray<{ playerA: string; playerB: string }>): Set<string> =>
  new Set(alliances.map(({ playerA, playerB }) => orderedPairKey(playerA, playerB)));

export const computeTerritoryMomentum = (flipLog: readonly TerritoryFlip[]): TerritoryMomentum[] => {
  const byPlayer = new Map<string, { gained: number; lost: number }>();
  const touch = (playerId: string): { gained: number; lost: number } => {
    let entry = byPlayer.get(playerId);
    if (!entry) {
      entry = { gained: 0, lost: 0 };
      byPlayer.set(playerId, entry);
    }
    return entry;
  };
  for (const flip of flipLog) {
    if (flip.toOwner && flip.toOwner !== flip.fromOwner) touch(flip.toOwner).gained += 1;
    if (flip.fromOwner && flip.fromOwner !== flip.toOwner) touch(flip.fromOwner).lost += 1;
  }
  return [...byPlayer.entries()]
    .map(([playerId, { gained, lost }]) => ({
      playerId,
      tilesGained24h: gained,
      tilesLost24h: lost,
      net24h: gained - lost
    }))
    .sort((a, b) => b.net24h - a.net24h);
};

export const computeBiggestSwing24h = (flipLog: readonly TerritoryFlip[]): BiggestSwing24h => {
  if (flipLog.length === 0) return null;
  const momentum = computeTerritoryMomentum(flipLog);
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

export const computeFrontlineHotspots = (
  flipLog: readonly TerritoryFlip[],
  combatManpowerLog: readonly CombatManpowerLoss[] = []
): FrontlineHotspot[] => {
  const byTile = new Map<string, { x: number; y: number; flips: number; contestedBy: Set<string> }>();
  for (const flip of flipLog) {
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
