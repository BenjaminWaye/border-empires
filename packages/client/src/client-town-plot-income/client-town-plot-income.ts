// Why a fed town earns less than its full coin. A town's coin scales with how
// many of its support plots are garrisoned (supportCurrent / supportMax in
// apps/simulation/src/live-town-summary.ts), so a fed town with none
// garrisoned earns nothing. The town screen said only "Fed" next to +0/day,
// and the blocker sat in a build-plots card cut off on a phone (2026-11-14
// playtest), so the coin line and the Towns list now name it.
import type { Tile } from "../client-types.js";

type TownSupport = Partial<Pick<NonNullable<Tile["town"]>, "isFed" | "supportCurrent" | "supportMax" | "supportInnerCurrent" | "populationTier">>;

const finite = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** "1/4 plots garrisoned" while a fed town is missing plots; undefined when every plot is garrisoned, unfed, or unknown. */
export const townPlotIncomeNote = (town: TownSupport): string | undefined => {
  if (town.isFed === false || town.populationTier === "SETTLEMENT") return undefined;
  if (!finite(town.supportCurrent) || !finite(town.supportMax) || town.supportMax <= 0) return undefined;
  if (town.supportCurrent >= town.supportMax) return undefined;
  return `${town.supportCurrent}/${town.supportMax} plots garrisoned`;
};

/** The town screen's coin note: "Fed", "Unfed", or "Fed · 0/4 plots garrisoned". */
export const townCoinNote = (town: TownSupport): string => {
  if (typeof town.isFed !== "boolean") return "";
  if (!town.isFed) return "Unfed";
  const plots = townPlotIncomeNote(town);
  return plots ? `Fed · ${plots}` : "Fed";
};

type ZeroCoinTile = Pick<Tile, "ownershipState" | "sabotage"> & { town?: TownSupport | null };

/**
 * Why one of your towns earns no coin, in the sim's own order (live-town-summary.ts goldPerMinute): an
 * ungarrisoned town earns nothing, an unfed one stops, coin scales with garrisoned plots (none garrisoned is 0),
 * and sabotage multiplies the result. Undefined when none applies. A town on the map read "Coin 0.0/day" beside
 * "Food Fed" with nothing saying why (playtest 2026-11-18).
 */
export const townZeroCoinReason = (tile: ZeroCoinTile, nowMs: number = Date.now()): string | undefined => {
  const town = tile.town;
  if (!town) return undefined;
  if (tile.ownershipState !== "SETTLED") return "Not garrisoned";
  if (town.populationTier === "SETTLEMENT") return undefined;
  if (town.isFed === false) return "Unfed";
  const plots = townPlotIncomeNote(town);
  // Base coin comes from the inner ring (town-support-coin.ts): none garrisoned there earns nothing.
  if (plots && (town.supportInnerCurrent ?? town.supportCurrent) === 0) return plots;
  if (tile.sabotage && tile.sabotage.endsAt > nowMs && tile.sabotage.outputMultiplier <= 0) return "Sabotaged";
  return undefined;
};
