import type { DomainStrategicResourceKey } from "@border-empires/game-domain";
import type { Terrain } from "@border-empires/shared";

type StrategicResourceKey = DomainStrategicResourceKey;

type EconomyHeuristicTile = {
  ownershipState?: string | undefined;
  terrain: Terrain;
  town?: unknown;
  dockId?: string | undefined;
};

export const foodCoverageLow = (
  strategicResources: Partial<Record<StrategicResourceKey, number>> | undefined,
  townCount: number
): boolean => Math.max(0, strategicResources?.FOOD ?? 0) <= Math.max(24, townCount * 12);

// §24.5: converted from a gold-income check to a manpower check — every
// build/expand action now costs manpower (§4.1), not gold, so "is my economy
// too weak to keep building" is a manpower-affordability question, not a
// gold-income one (the old incomePerMinute threshold was also permanently
// tripped post-§6.1's ~288x gold rescale, always reading "weak"). Floor of
// 40 matches the plan's own starting-point figure for this exact heuristic
// (§24.5); scaled per settled tile so a larger empire needs proportionally
// deeper reserves before considering itself economy-healthy, consistent with
// manpower's regen taper making growth costlier at scale (§4.3).
export const economyWeak = (manpower: number, settledTileCount: number): boolean =>
  manpower < Math.max(40, settledTileCount * 6);

