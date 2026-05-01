import type { DomainStrategicResourceKey } from "@border-empires/game-domain";

type StrategicResourceKey = DomainStrategicResourceKey;

type EconomyHeuristicTile = {
  ownershipState?: string | undefined;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  town?: unknown;
  dockId?: string | undefined;
};

export const foodCoverageLow = (
  strategicResources: Partial<Record<StrategicResourceKey, number>> | undefined,
  townCount: number
): boolean => Math.max(0, strategicResources?.FOOD ?? 0) <= Math.max(24, townCount * 12);

export const economyWeak = (incomePerMinute: number, settledTileCount: number): boolean =>
  incomePerMinute < Math.max(3, settledTileCount * 0.45);

export const hasCollectibleVisibleYieldSource = <TTile extends EconomyHeuristicTile>(ownedTiles: readonly TTile[]): boolean =>
  ownedTiles.some(
    (tile) =>
      tile.ownershipState === "SETTLED" &&
      tile.terrain === "LAND" &&
      (Boolean(tile.town) || Boolean(tile.dockId))
  );
