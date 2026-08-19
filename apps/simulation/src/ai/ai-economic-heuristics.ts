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

// Precondition for the reach-driven relay-beacon build (fixed-borders-via-reach
// plan, "AI planner" section): fires once every reach-accessible VALUABLE
// EXPAND target (a tile carrying a town/resource/dock/natural-wonder —
// frontier-scoring.ts's "economic" class, counted via
// frontierAnalysis.frontierOpportunityEconomic, which is already
// reach-filtered by the time it's tallied — see frontier-command-planner.ts's
// reachLookup prune) has been claimed, while the player is otherwise strong
// enough to want more land. Deliberately does NOT require plain/"waste" land
// within reach to be exhausted too — an empire happily keeps grabbing scout/
// scaffold tiles inside its own border in parallel; the beacon's only job is
// reaching the next real prize once reach, not economy/manpower/food, is the
// bottleneck on THAT. Mirrors economyWeak/foodCoverageLow's shape (small,
// pure, reused rather than recomputed inline) per docs/game-mechanics.md's
// guidance to consume the existing strategic-snapshot-style heuristics.
export const isReachStarved = (input: {
  /** Reach-filtered count of "economic" (town/resource/dock/wonder) EXPAND candidates — frontierAnalysis.frontierOpportunityEconomic. */
  reachAccessibleValuableTargetCount: number;
  townCount: number;
  manpower: number;
  needsFood: boolean;
  // Excludes combat scenarios: an empty valuable-target count with an enemy
  // at the gate means "no room to expand because I'm boxed in by an enemy
  // this tick," not "reach is the bottleneck" — ATTACK/MUSTER should win
  // those, not a beacon build. Without this, any small/contested frontier
  // with zero claimable valuables (a common wartime state, not just a
  // reach-gated one) reads as reach-starved.
  frontierEnemyTargetCount: number;
}): boolean =>
  input.reachAccessibleValuableTargetCount === 0 &&
  input.frontierEnemyTargetCount === 0 &&
  input.townCount >= 1 &&
  !input.needsFood &&
  input.manpower >= Math.max(30, input.townCount * 15);

// NOTE — deliberately NOT gated on economyWeak/`needsEconomy` (it used to be).
// economyWeak scales its bar with SETTLED TILE COUNT (manpower < tiles * 6),
// while manpower CAP scales with TOWNS (STARTING_CAPITAL_MANPOWER_CAP plus
// TOWN_MANPOWER_BY_TIER per town). Those are different axes, so a wide empire
// with few towns reads "economy weak" at a threshold it may not even be able
// to reach — observed live: AI players with 122-264 settled tiles needed
// 732-1,584 manpower to clear it. That permanently vetoed the beacon build,
// which is precisely the action that unlocks a reach-locked empire — the AI
// was weak *because* it was stuck, so blocking the fix on not-being-weak was
// circular and deadlocked it into doing nothing at all. The explicit
// `manpower >= max(30, townCount * 15)` floor above is the real
// affordability guard; per-structure cost is separately enforced by
// canAffordStructure inside chooseBestRelayBeaconBuild.

