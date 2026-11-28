import type { DomainTileState } from "@border-empires/game-domain";

type Town = NonNullable<DomainTileState["town"]>;

/**
 * The town with its persisted isFed brought in line with the sim's fresh fed set, or undefined when it already
 * agrees. An unfed town earns and grows nothing (live-town-summary.ts, townGoldPerMinuteForPlayer), so its coin and
 * growth rates are zeroed with it: a newly fed one gets its real rates on the same tick's growth branch or the next
 * town-summary refresh. Shared by the growth tick's per-town pass and its no-fed-town pass.
 */
export const townWithFreshIsFed = (town: Town, freshIsFed: boolean): Town | undefined => {
  if (town.isFed === freshIsFed) return undefined;
  return { ...town, isFed: freshIsFed, ...(freshIsFed ? {} : { populationGrowthPerMinute: 0, goldPerMinute: 0 }) };
};
