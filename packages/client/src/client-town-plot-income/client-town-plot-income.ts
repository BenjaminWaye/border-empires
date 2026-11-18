// Why a fed town earns less than its full coin. A town's coin scales with how
// many of its support plots are garrisoned (supportCurrent / supportMax in
// apps/simulation/src/live-town-summary.ts), so a fed town with none
// garrisoned earns nothing. The town screen said only "Fed" next to +0/day,
// and the blocker sat in a build-plots card cut off on a phone (2026-11-14
// playtest), so the coin line and the Towns list now name it.
import type { Tile } from "../client-types.js";

type TownSupport = Partial<Pick<NonNullable<Tile["town"]>, "isFed" | "supportCurrent" | "supportMax" | "populationTier">>;

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
