import { TOWN_FOCUSES, TOWN_FOCUS_MULTIPLIERS, manpowerPerBatch, nextManpowerRefillAtMs, queueTownFocus, type TownFocus } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { tileCoinPerMinute } from "../client-coin-income/client-coin-income.js";
import { isTownGrowthPaused, townNextGrowthEtaLabel, townNextPopulationMilestone } from "../client-town-growth/client-town-growth.js";

// Town focus (docs/town-focus-plan.md): what each of the four choices would do
// to one town's own Coin, manpower and growth, as numbers the town screen shows.
// The server's figures already include the active focus, so each projection
// first divides that out, then applies the option's multiplier. Every change is
// shown against Balanced, so a row's numbers never depend on what is active.

export type TownFocusStat = {
  /** Display value, e.g. "58/day". */
  value: string;
  /** Change against Balanced, e.g. "+10"; "" when unchanged or not shown. */
  delta: string;
  /** The same change as a number (rounded figures), for sums; 0 when unchanged or unknown. */
  change: number;
  tone: "up" | "down" | "same";
  /** How the figure was worked out, for a tooltip: "92 × 0.9 = 82.8 → 83". */
  detail?: string;
};

export type TownFocusOption = {
  focus: TownFocus;
  name: string;
  /** What the House does with the town's people under this focus. */
  tagline: string;
  /** One-line rule, e.g. "Manpower +20% · Coin −10% · Growth −10%". */
  rule: string;
  /** Button lines: the rate it raises, then the rates it lowers ("MP +20%", "Coin −10% · Growth −10%"). */
  tradeLine: string;
  costLine: string;
  /** The costs in one short phrase for phones ("Others −10%"), or the cost line when the cuts differ. */
  costShort: string;
  state: "active" | "idle";
  coin: TownFocusStat;
  manpower: TownFocusStat;
  growth: TownFocusStat;
};

export type TownFocusCard = {
  options: TownFocusOption[];
  /** The focus the player has chosen; a pick shows here at once (see shownTownFocus). */
  active: TownFocus;
  /** Ms until the owner's next manpower refill, when manpower banked since the last one is paid. */
  nextRefillInMs: number;
  /** Heading for the growth column, e.g. "To City"; "Growth" when there is no next tier. */
  growthLabel: string;
  /** True while the town cannot grow (unfed, war, capture shock): only Coin and manpower change. */
  growthPaused: boolean;
  /** True when the town is unfed: it earns no Coin and does not grow, whatever its focus. */
  unfed: boolean;
};

const NAMES: Readonly<Record<TownFocus, string>> = { BALANCED: "Balanced", GROWTH: "Growth", LEVY: "Levy", COMMERCE: "Commerce" };

const TAGLINES: Readonly<Record<TownFocus, string>> = {
  BALANCED: "Everyone keeps to their work",
  GROWTH: "Shelter families so they multiply",
  LEVY: "Draft more into Ancillary service",
  COMMERCE: "Hire labour offworld for credit"
};

/** The three outputs a focus scales, in the order a rule names them after its gain. */
const OUTPUTS = [
  { key: "manpowerRegen", label: "MP" },
  { key: "coin", label: "Coin" },
  { key: "growth", label: "Growth" }
] as const;

const percent = (mult: number): string => `${mult >= 1 ? "+" : "−"}${Math.round(Math.abs(mult - 1) * 100)}%`;

/**
 * A focus's rule from TOWN_FOCUS_MULTIPLIERS, so the text follows any retuning: the raised output first, then the
 * lowered ones ("MP +20%" and "Coin −10% · Growth −10%"). Balanced, which changes nothing, has no rule parts.
 */
const ruleParts = (focus: TownFocus): { gain: string; costs: string[]; costShort: string } => {
  const mult = TOWN_FOCUS_MULTIPLIERS[focus];
  const changed = OUTPUTS.filter((o) => mult[o.key] !== 1);
  const gains = changed.filter((o) => mult[o.key] > 1).map((o) => `${o.label} ${percent(mult[o.key])}`);
  const cuts = changed.filter((o) => mult[o.key] < 1);
  const costs = cuts.map((o) => `${o.label} ${percent(mult[o.key])}`);
  const sameCut = cuts.length > 1 && cuts.every((o) => mult[o.key] === mult[cuts[0]!.key]);
  return { gain: gains.join(" · "), costs, costShort: sameCut ? `Others ${percent(mult[cuts[0]!.key])}` : costs.join(" · ") };
};

const ruleText = (focus: TownFocus): string => {
  const { gain, costs } = ruleParts(focus);
  return gain ? [gain, ...costs].join(" · ") : "Baseline: no bonus, no cost";
};

export const townFocusName = (focus: TownFocus): string => NAMES[focus];

/** "MP +20% · Coin −10% · Growth −10%", from the multipliers. */
export const townFocusRule = (focus: TownFocus): string => ruleText(focus);

/** The focus's flavour line ("Draft more into Ancillary service"). */
export const townFocusTagline = (focus: TownFocus): string => TAGLINES[focus];

const round = (value: number): number => Math.round(value);

/** Hours up to three days ("41h"), then days to one decimal ("4.5d"): fine enough that every option reads differently. */
export const townFocusDuration = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "now";
  const hours = minutes / 60;
  if (hours < 1) return `${Math.max(1, Math.round(minutes))}m`;
  if (hours < 72) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

const stat = (value: string, option: number, balanced: number, mult = 1): TownFocusStat => {
  const diff = round(option) - round(balanced);
  return {
    value,
    change: diff,
    delta: diff === 0 ? "" : `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString("en-US")}`,
    tone: diff > 0 ? "up" : diff < 0 ? "down" : "same",
    ...(mult !== 1 ? { detail: `${balanced.toFixed(1)} × ${mult} = ${option.toFixed(1)} → ${round(option)}` } : {})
  };
};

/**
 * A button's lines: the rate it raises, then the rates it lowers, as percentages of this town's own output.
 * Percentages, not amounts: "−10% MP" reads as a smaller refill, where "−12 MP" read like a one-off cost, and every
 * focus is visibly the same kind of deal. The amounts are in the strip.
 */
const tradeLines = (option: TownFocusOption): { tradeLine: string; costLine: string; costShort: string } => {
  const { gain, costs, costShort } = ruleParts(option.focus);
  return gain ? { tradeLine: gain, costLine: costs.join(" · "), costShort } : { tradeLine: "No change", costLine: "", costShort: "" };
};

/**
 * The four options for `townTile`, owned by `playerId`. `baseRegenPerMinute` is
 * the town's own manpower regen before focus (tier, terrain and biota), as the
 * town screen's manpower stat already computes it.
 */
export const townFocusCard = (townTile: Tile, playerId: string, baseRegenPerMinute: number, nowMs = Date.now()): TownFocusCard | undefined => {
  const town = townTile.town;
  if (!town) return undefined;
  const active = shownTownFocus(town);
  // The town's Coin and growth figures come from the server at the focus it has applied, which trails a pick by
  // up to a minute: take the base out with that focus's multiplier, not the one just picked.
  const activeMult = TOWN_FOCUS_MULTIPLIERS[town.focus ?? "BALANCED"];
  const coinKnown = typeof town.goldPerMinute === "number" && Number.isFinite(town.goldPerMinute);
  const coinBase = (tileCoinPerMinute(townTile) * 1440) / activeMult.coin;
  const manpowerBase = manpowerPerBatch(baseRegenPerMinute);
  const paused = isTownGrowthPaused(town, { explainUnfed: true, nowMs });
  const milestone = townNextPopulationMilestone(town);
  // A paused town reports no growth rate, and a guess would disagree with the server's real one: say Paused.
  const growthNow = paused ? 0 : town.populationGrowthPerMinute ?? 0;
  const remaining = milestone ? Math.max(0, milestone.targetPopulation - town.population) : 0;
  const growthStat = (focus: TownFocus): TownFocusStat => {
    if (!milestone || growthNow <= 0) return { value: paused ? "Paused" : milestone ? "—" : "Max", delta: "", change: 0, tone: "same" };
    const baseRate = growthNow / activeMult.growth;
    const minutes = remaining / (baseRate * TOWN_FOCUS_MULTIPLIERS[focus].growth);
    const balancedMinutes = remaining / baseRate;
    // Sooner is better: a negative time change reads as a gain.
    const hours = (minutes - balancedMinutes) / 60;
    const delta = Math.abs(hours) < 1 ? "" : `${hours < 0 ? "−" : "+"}${townFocusDuration(Math.abs(hours) * 60)}`;
    return { value: `~${townFocusDuration(minutes)}`, delta, change: Math.round(hours), tone: delta === "" ? "same" : hours < 0 ? "up" : "down" };
  };
  const options = TOWN_FOCUSES.map((focus): TownFocusOption => {
    const mult = TOWN_FOCUS_MULTIPLIERS[focus];
    const coin = coinBase * mult.coin;
    const manpower = manpowerBase * mult.manpowerRegen;
    return {
      focus,
      name: NAMES[focus],
      tagline: TAGLINES[focus],
      rule: ruleText(focus),
      state: focus === active ? "active" : "idle",
      // Before the town's Coin figure arrives there is nothing to project: say so rather than show 0/day.
      coin: coinKnown ? stat(round(coin).toLocaleString("en-US"), coin, coinBase, mult.coin) : { value: "…", delta: "", change: 0, tone: "same" },
      manpower: stat(round(manpower).toLocaleString("en-US"), manpower, manpowerBase, mult.manpowerRegen),
      growth: growthStat(focus),
      tradeLine: "",
      costLine: "",
      costShort: ""
    };
  });
  for (const option of options) Object.assign(option, tradeLines(option));
  return {
    options,
    active,
    nextRefillInMs: Math.max(0, nextManpowerRefillAtMs(playerId, nowMs) - nowMs),
    growthLabel: milestone ? `To ${milestone.label}` : "Growth",
    growthPaused: paused,
    unfed: town.isFed === false
  };
};

/**
 * The town screen's "next tier" line, to the hour like the focus card ("City in 43h"),
 * or the usual paused wording when the town cannot grow.
 */
export const townGrowthEtaPrecise = (town: NonNullable<Tile["town"]>, nowMs = Date.now()): string => {
  const milestone = townNextPopulationMilestone(town);
  const rate = town.populationGrowthPerMinute ?? 0;
  if (!milestone || rate <= 0 || isTownGrowthPaused(town, { explainUnfed: true, nowMs })) return townNextGrowthEtaLabel(town, { explainUnfed: true, nowMs });
  const remaining = Math.max(0, milestone.targetPopulation - town.population);
  // "~": a linear estimate; the server's growth slows as the town fills (logistic).
  return remaining <= 0 ? `${milestone.label} ready` : `${milestone.label} in ~${townFocusDuration(remaining / rate)}`;
};

/** Coin per day all the player's town focuses add or remove, against every town on Balanced. */
export const townFocusEmpireCoinPerDay = (towns: Iterable<Pick<Tile, "town" | "dockId" | "yieldRate" | "sabotage">>): number => {
  let delta = 0;
  for (const tile of towns) {
    const focus = tile.town?.focus;
    if (!focus || focus === "BALANCED") continue;
    const perDay = tileCoinPerMinute(tile) * 1440;
    delta += perDay - perDay / TOWN_FOCUS_MULTIPLIERS[focus].coin;
  }
  return delta;
};

/** How the player's towns are spread across the focuses, for the card's empire line. */
export const townFocusCounts = (towns: Iterable<Pick<Tile, "town">>): Record<TownFocus, number> => {
  // Each town counts under the focus chosen for it, so a town just switched to X is not one "All towns → X" would change.
  const counts: Record<TownFocus, number> = { BALANCED: 0, GROWTH: 0, LEVY: 0, COMMERCE: 0 };
  for (const tile of towns) if (tile.town) counts[shownTownFocus(tile.town)] += 1;
  return counts;
};

/**
 * The focus to show for a town. A pick is stored as pending and the server applies it after its next population
 * growth tick (at most a minute; docs/town-focus-plan.md), so a pending focus is shown as the town's focus.
 */
export const shownTownFocus = (town: Pick<NonNullable<Tile["town"]>, "focus" | "pendingFocus"> | undefined): TownFocus =>
  town?.pendingFocus ?? town?.focus ?? "BALANCED";

/** The town record after the player picks `focus` now: what the server will store, shown before its reply. */
export const optimisticTownFocus = <T extends NonNullable<Tile["town"]>>(town: T, focus: TownFocus, nowMs = Date.now()): T =>
  queueTownFocus(town, focus, nowMs);
