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
export const computeTerritoryMomentum = (flipLog: readonly TerritoryFlip[]): TerritoryMomentum[] => {
  const byPlayer = new Map<string, { gained: Set<string>; lost: Set<string> }>();
  const touch = (playerId: string): { gained: Set<string>; lost: Set<string> } => {
    let entry = byPlayer.get(playerId);
    if (!entry) {
      entry = { gained: new Set(), lost: new Set() };
      byPlayer.set(playerId, entry);
    }
    return entry;
  };
  for (const flip of flipLog) {
    if (flip.toOwner && flip.toOwner !== flip.fromOwner) touch(flip.toOwner).gained.add(flip.tileId);
    if (flip.fromOwner && flip.fromOwner !== flip.toOwner) touch(flip.fromOwner).lost.add(flip.tileId);
  }
  return [...byPlayer.entries()]
    .map(([playerId, { gained, lost }]) => ({
      playerId,
      tilesGained24h: gained.size,
      tilesLost24h: lost.size,
      net24h: gained.size - lost.size
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
