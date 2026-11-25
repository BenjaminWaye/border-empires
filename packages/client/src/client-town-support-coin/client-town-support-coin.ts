// What a town's support plots do to its coin, split by ring (town-support-coin.ts in shared): the inner ring
// (distance 1) carries the base coin, and a City's or bigger town's tier bonus scales with its garrisoned outer
// ring. One source for the town stats and the tile overview, so both name the same effect.
import { townPopulationMultiplier } from "@border-empires/game-domain";
import { townSupportCoinMultiplier } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

type TownSupport = Pick<NonNullable<Tile["town"]>, "supportCurrent" | "supportMax" | "supportInnerCurrent" | "supportInnerMax" | "populationTier">;

export type TownSupportCoinLine = { label: string; effectPct: number };

const finite = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * One line per ring that is short of garrisoned plots, with its effect on coin in percent: the inner ring scales
 * the whole coin; the outer ring trims the tier bonus. An older payload without inner counts gets one line for
 * the whole ring, as the coin used to work.
 */
export const townSupportCoinLines = (town: TownSupport): TownSupportCoinLine[] => {
  if (!finite(town.supportMax) || town.supportMax <= 0 || !finite(town.supportCurrent)) return [];
  if (!finite(town.supportInnerCurrent) || !finite(town.supportInnerMax)) {
    if (town.supportCurrent >= town.supportMax) return [];
    return [{ label: `Support ${town.supportCurrent}/${town.supportMax}`, effectPct: (town.supportCurrent / town.supportMax - 1) * 100 }];
  }
  const lines: TownSupportCoinLine[] = [];
  const inner = { current: town.supportInnerCurrent, max: town.supportInnerMax };
  const outer = { current: town.supportCurrent - inner.current, max: town.supportMax - inner.max };
  if (inner.max > 0 && inner.current < inner.max) lines.push({ label: `Inner plots ${inner.current}/${inner.max}`, effectPct: (inner.current / inner.max - 1) * 100 });
  if (outer.max > 0 && outer.current < outer.max) {
    // Measured against the same town with every outer plot held (its full tier bonus), inner ring as it is.
    const tier = townPopulationMultiplier(town.populationTier);
    const withOuter = townSupportCoinMultiplier({ supportCurrent: inner.max + outer.current, supportMax: town.supportMax, innerCurrent: inner.max, innerMax: inner.max }, 1, tier);
    const allHeld = townSupportCoinMultiplier({ supportCurrent: town.supportMax, supportMax: town.supportMax, innerCurrent: inner.max, innerMax: inner.max }, 1, tier);
    lines.push({ label: `Outer plots ${outer.current}/${outer.max}`, effectPct: (withOuter / allHeld - 1) * 100 });
  }
  return lines;
};
