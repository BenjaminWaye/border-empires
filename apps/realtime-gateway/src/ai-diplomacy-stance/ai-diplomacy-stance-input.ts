import { MANPOWER_BASE_CAP, WORLD_HEIGHT, WORLD_WIDTH, manpowerPerBatch, nextManpowerRefillAtMs, wrapX, wrapY } from "@border-empires/shared";
// Reads AiDiplomacyStanceInput off subscription snapshots. Kept apart from
// the pure decision in ai-diplomacy-stance.ts so the rules can be tested
// without building snapshots.
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { AiDiplomacyStanceInput } from "./ai-diplomacy-stance.js";

type SnapshotPlayer = NonNullable<PlayerSubscriptionSnapshot["player"]>;
type SnapshotTile = Pick<PlayerSubscriptionSnapshot["tiles"][number], "x" | "y" | "ownerId" | "musterJson"> &
  Partial<Pick<PlayerSubscriptionSnapshot["tiles"][number], "terrain" | "reachOwnerId">>;
export type AiDiplomacySnapshot = {
  playerId: string;
  tiles: readonly SnapshotTile[];
  player?: Pick<SnapshotPlayer, "manpower" | "manpowerCap"> & Partial<Pick<SnapshotPlayer,
    "manpowerRegenPerMinute" | "resourceTradeHoldings" | "domainIds" | "gold" | "incomePerMinute" | "name" | "strategicResources" | "strategicProductionPerMinute" | "upkeepPerMinute" | "resourceSlots">>;
  worldStatus?: { leaderboard: {
    overall?: readonly { id: string; tiles: number }[];
    selfOverall?: { id: string; tiles: number; score?: number } | undefined;
  } } | undefined;
};

const tileKey = (x: number, y: number): string => `${x},${y}`;

/** Sum of manpower in the AI's own muster flags among its visible tiles. */
export const musterManpowerFromTiles = (tiles: readonly SnapshotTile[], ownerId: string): number => {
  let total = 0;
  for (const tile of tiles) {
    if (!tile.musterJson) continue;
    try {
      const muster = JSON.parse(tile.musterJson) as { ownerId?: unknown; amount?: unknown };
      if (muster.ownerId === ownerId && typeof muster.amount === "number" && Number.isFinite(muster.amount) && muster.amount > 0) {
        total += muster.amount;
      }
    } catch {
      // A malformed flag just doesn't count toward strength.
    }
  }
  return total;
};

/** True when any requester-owned tile is orthogonally adjacent to an AI-owned tile. */
export const bordersTouchInTiles = (tiles: readonly SnapshotTile[], aiPlayerId: string, requesterId: string): boolean => {
  const aiTileKeys = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId === aiPlayerId) aiTileKeys.add(tileKey(tile.x, tile.y));
  }
  if (aiTileKeys.size === 0) return false;
  for (const tile of tiles) {
    if (tile.ownerId !== requesterId) continue;
    if (
      aiTileKeys.has(tileKey(wrapX(tile.x + 1, WORLD_WIDTH), tile.y)) ||
      aiTileKeys.has(tileKey(wrapX(tile.x - 1, WORLD_WIDTH), tile.y)) ||
      aiTileKeys.has(tileKey(tile.x, wrapY(tile.y + 1, WORLD_HEIGHT))) ||
      aiTileKeys.has(tileKey(tile.x, wrapY(tile.y - 1, WORLD_HEIGHT)))
    ) {
      return true;
    }
  }
  return false;
};

/**
 * True when the AI's territory touches (8-neighbour, as the frontier planner
 * steps) land it could still take without fighting another empire: neutral
 * LAND inside its own reach border, or barbarian ground. False means every
 * way out runs through a rival. undefined when no tile carries terrain, so
 * the snapshot can't vouch either way.
 */
export const hasOtherExpansionInTiles = (tiles: readonly SnapshotTile[], aiPlayerId: string): boolean | undefined => {
  const byKey = new Map<string, SnapshotTile>();
  let sawTerrain = false;
  for (const tile of tiles) {
    byKey.set(tileKey(tile.x, tile.y), tile);
    if (tile.terrain) sawTerrain = true;
  }
  if (!sawTerrain) return undefined;
  for (const tile of tiles) {
    if (tile.ownerId !== aiPlayerId) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = byKey.get(tileKey(wrapX(tile.x + dx, WORLD_WIDTH), wrapY(tile.y + dy, WORLD_HEIGHT)));
        if (!neighbor) continue;
        if (neighbor.ownerId?.startsWith("barbarian-")) return true;
        if (!neighbor.ownerId && neighbor.terrain === "LAND" && neighbor.reachOwnerId === aiPlayerId) return true;
      }
    }
  }
  return false;
};

/**
 * undefined when the AI snapshot carries no player block: with no manpower
 * reading at all there is nothing to judge, and the caller declines rather
 * than inventing numbers.
 */
export const buildAiDiplomacyStanceInput = (input: {
  aiPlayerId: string;
  aiName: string;
  aiSnapshot: AiDiplomacySnapshot | undefined;
  requesterId: string;
  requesterSnapshot: AiDiplomacySnapshot | undefined;
  requesterBrokeTruceWithAi: boolean;
  /** Wall-clock for the refill schedule; omitted = refill timing unknown. */
  now?: number;
}): AiDiplomacyStanceInput | undefined => {
  const aiPlayer = input.aiSnapshot?.player;
  if (!input.aiSnapshot || !aiPlayer) return undefined;
  const tiles = input.aiSnapshot.tiles;
  const foodProduction = aiPlayer.strategicProductionPerMinute?.FOOD ?? 0;
  const foodUpkeep = aiPlayer.upkeepPerMinute?.food ?? 0;
  const manpowerCap = aiPlayer.manpowerCap > 0 ? aiPlayer.manpowerCap : MANPOWER_BASE_CAP;
  const hasOtherExpansion = hasOtherExpansionInTiles(tiles, input.aiPlayerId);
  const requesterPlayer = input.requesterSnapshot?.player;
  return {
    aiName: input.aiName,
    ai: {
      manpower: aiPlayer.manpower,
      manpowerCap,
      musterManpower: musterManpowerFromTiles(tiles, input.aiPlayerId),
      // The payout is a full window of regen (the bank accrues all window), capped by room under the cap.
      ...(input.now !== undefined && aiPlayer.manpowerRegenPerMinute !== undefined
        ? {
            nextRefillInMs: nextManpowerRefillAtMs(input.aiPlayerId, input.now) - input.now,
            nextRefillManpower: Math.max(0, Math.min(manpowerCap - aiPlayer.manpower, manpowerPerBatch(aiPlayer.manpowerRegenPerMinute)))
          }
        : {}),
      ...(hasOtherExpansion !== undefined ? { hasOtherExpansion } : {}),
      score: input.aiSnapshot.worldStatus?.leaderboard.selfOverall?.score,
      ...(aiPlayer.resourceSlots ? { foodSlotDeficit: aiPlayer.resourceSlots.demand.FOOD - aiPlayer.resourceSlots.supply.FOOD } : {}),
      foodStock: aiPlayer.strategicResources?.FOOD ?? 0,
      foodNetPerMinute: foodProduction - foodUpkeep
    },
    requester: {
      score: input.requesterSnapshot?.worldStatus?.leaderboard.selfOverall?.score,
      manpowerCap: requesterPlayer?.manpowerCap,
      ...(requesterPlayer && input.requesterSnapshot
        ? { fightingStrength: requesterPlayer.manpower + musterManpowerFromTiles(input.requesterSnapshot.tiles, input.requesterId) }
        : {})
    },
    bordersTouch: bordersTouchInTiles(tiles, input.aiPlayerId, input.requesterId),
    requesterBrokeTruceWithAi: input.requesterBrokeTruceWithAi
  };
};
