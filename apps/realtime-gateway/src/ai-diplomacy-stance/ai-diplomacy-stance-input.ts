import { MANPOWER_BASE_CAP, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
// Reads AiDiplomacyStanceInput off subscription snapshots. Kept apart from
// the pure decision in ai-diplomacy-stance.ts so the rules can be tested
// without building snapshots.
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { AiDiplomacyStanceInput } from "./ai-diplomacy-stance.js";

type SnapshotPlayer = NonNullable<PlayerSubscriptionSnapshot["player"]>;
export type AiDiplomacySnapshot = {
  playerId: string;
  tiles: readonly Pick<PlayerSubscriptionSnapshot["tiles"][number], "x" | "y" | "ownerId" | "musterJson">[];
  player?: Pick<SnapshotPlayer, "manpower" | "manpowerCap"> & Partial<Pick<SnapshotPlayer,
    "domainIds" | "gold" | "incomePerMinute" | "name" | "strategicResources" | "strategicProductionPerMinute" | "upkeepPerMinute" | "resourceSlots">>;
  worldStatus?: { leaderboard: {
    overall?: readonly { id: string; tiles: number }[];
    selfOverall?: { id: string; tiles: number; score?: number } | undefined;
  } } | undefined;
};

type SnapshotTile = Pick<PlayerSubscriptionSnapshot["tiles"][number], "x" | "y" | "ownerId" | "musterJson">;

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
}): AiDiplomacyStanceInput | undefined => {
  const aiPlayer = input.aiSnapshot?.player;
  if (!input.aiSnapshot || !aiPlayer) return undefined;
  const tiles = input.aiSnapshot.tiles;
  const foodProduction = aiPlayer.strategicProductionPerMinute?.FOOD ?? 0;
  const foodUpkeep = aiPlayer.upkeepPerMinute?.food ?? 0;
  return {
    aiName: input.aiName,
    ai: {
      manpower: aiPlayer.manpower,
      manpowerCap: aiPlayer.manpowerCap > 0 ? aiPlayer.manpowerCap : MANPOWER_BASE_CAP,
      musterManpower: musterManpowerFromTiles(tiles, input.aiPlayerId),
      score: input.aiSnapshot.worldStatus?.leaderboard.selfOverall?.score,
      ...(aiPlayer.resourceSlots ? { foodSlotDeficit: aiPlayer.resourceSlots.demand.FOOD - aiPlayer.resourceSlots.supply.FOOD } : {}),
      foodStock: aiPlayer.strategicResources?.FOOD ?? 0,
      foodNetPerMinute: foodProduction - foodUpkeep
    },
    requester: {
      score: input.requesterSnapshot?.worldStatus?.leaderboard.selfOverall?.score,
      manpowerCap: input.requesterSnapshot?.player?.manpowerCap
    },
    bordersTouch: bordersTouchInTiles(tiles, input.aiPlayerId, input.requesterId),
    requesterBrokeTruceWithAi: input.requesterBrokeTruceWithAi
  };
};
