import { TOWN_FOCUSES, TOWN_FOCUS_MULTIPLIERS, manpowerPerBatch, nextManpowerRefillAtMs, queueTownFocus, MANPOWER_REFILL_WINDOW_MS, type TownFocus } from "@border-empires/shared";
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
  /** Phone tile lines: the gain, then the costs, e.g. "+24 MP" and "−9 Coin · City +5h". */
  tradeLine: string;
  costLine: string;
  state: "active" | "queued" | "idle";
  coin: TownFocusStat;
  manpower: TownFocusStat;
  growth: TownFocusStat;
};

export type TownFocusCard = {
  options: TownFocusOption[];
  active: TownFocus;
  queued: TownFocus | undefined;
  /** Ms until a choice made now starts (the owner's next refill). */
  startsInMs: number;
  /** Ms until the queued change starts; 0 when nothing is queued. */
  queuedInMs: number;
  /** Heading for the growth column, e.g. "To City"; "Growth" when there is no next tier. */
  growthLabel: string;
  /** True while the town cannot grow (unfed, war, capture shock): only Coin and manpower change. */
  growthPaused: boolean;
};

const NAMES: Readonly<Record<TownFocus, string>> = { BALANCED: "Balanced", GROWTH: "Growth", LEVY: "Levy", COMMERCE: "Commerce" };

const TAGLINES: Readonly<Record<TownFocus, string>> = {
  BALANCED: "Everyone keeps to their work",
  GROWTH: "Shelter families so they multiply",
  LEVY: "Draft more into Ancillary service",
  COMMERCE: "Hire labour offworld for credit"
};

const RULES: Readonly<Record<TownFocus, string>> = {
  BALANCED: "Baseline: no bonus, no cost",
  GROWTH: "Growth +20% · MP −10% · Coin −10%",
  LEVY: "MP +20% · Coin −10% · Growth −10%",
  COMMERCE: "Coin +20% · MP −10% · Growth −10%"
};

export const townFocusName = (focus: TownFocus): string => NAMES[focus];

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
    delta: diff === 0 ? "" : `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString("en-US")}`,
    tone: diff > 0 ? "up" : diff < 0 ? "down" : "same",
    ...(mult !== 1 ? { detail: `${balanced.toFixed(1)} × ${mult} = ${option.toFixed(1)} → ${round(option)}` } : {})
  };
};

/** The phone tile's two lines: what the option gives, then everything it costs, all against Balanced. */
const tradeLines = (option: TownFocusOption, tierLabel: string | undefined): { tradeLine: string; costLine: string } => {
  const signed = (s: TownFocusStat, label: string): string => (s.delta ? `${s.delta} ${label}` : "");
  const coin = signed(option.coin, "Coin");
  const mp = signed(option.manpower, "MP");
  const growth = option.growth.delta ? `${tierLabel ?? "Tier"} ${option.growth.delta}` : "";
  const join = (parts: string[]): string => parts.filter(Boolean).join(" · ");
  if (option.focus === "LEVY") return { tradeLine: mp, costLine: join([coin, growth]) };
  if (option.focus === "COMMERCE") return { tradeLine: coin, costLine: join([mp, growth]) };
  if (option.focus === "GROWTH") return { tradeLine: growth || "Growth +20%", costLine: join([mp, coin]) };
  return { tradeLine: "Steady", costLine: "No cost" };
};

/**
 * The four options for `townTile`, owned by `playerId`. `baseRegenPerMinute` is
 * the town's own manpower regen before focus (tier, terrain and biota), as the
 * town screen's manpower stat already computes it.
 */
export const townFocusCard = (townTile: Tile, playerId: string, baseRegenPerMinute: number, nowMs = Date.now()): TownFocusCard | undefined => {
  const town = townTile.town;
  if (!town) return undefined;
  const active: TownFocus = town.focus ?? "BALANCED";
  const activeMult = TOWN_FOCUS_MULTIPLIERS[active];
  const coinBase = (tileCoinPerMinute(townTile) * 1440) / activeMult.coin;
  const manpowerBase = manpowerPerBatch(baseRegenPerMinute);
  const paused = isTownGrowthPaused(town, { explainUnfed: true, nowMs });
  const milestone = townNextPopulationMilestone(town);
  // A paused town reports no growth rate, and a guess would disagree with the server's real one: say Paused.
  const growthNow = paused ? 0 : town.populationGrowthPerMinute ?? 0;
  const remaining = milestone ? Math.max(0, milestone.targetPopulation - town.population) : 0;
  const growthStat = (focus: TownFocus): TownFocusStat => {
    if (!milestone || growthNow <= 0) return { value: paused ? "Paused" : milestone ? "—" : "Max", delta: "", tone: "same" };
    const baseRate = growthNow / activeMult.growth;
    const minutes = remaining / (baseRate * TOWN_FOCUS_MULTIPLIERS[focus].growth);
    const balancedMinutes = remaining / baseRate;
    // Sooner is better: a negative time change reads as a gain.
    const hours = (minutes - balancedMinutes) / 60;
    const delta = Math.abs(hours) < 1 ? "" : `${hours < 0 ? "−" : "+"}${townFocusDuration(Math.abs(hours) * 60)}`;
    return { value: townFocusDuration(minutes), delta, tone: delta === "" ? "same" : hours < 0 ? "up" : "down" };
  };
  const queued = town.pendingFocus;
  const options = TOWN_FOCUSES.map((focus): TownFocusOption => {
    const mult = TOWN_FOCUS_MULTIPLIERS[focus];
    const coin = coinBase * mult.coin;
    const manpower = manpowerBase * mult.manpowerRegen;
    return {
      focus,
      name: NAMES[focus],
      tagline: TAGLINES[focus],
      rule: RULES[focus],
      state: focus === queued ? "queued" : focus === active ? "active" : "idle",
      coin: stat(round(coin).toLocaleString("en-US"), coin, coinBase, mult.coin),
      manpower: stat(round(manpower).toLocaleString("en-US"), manpower, manpowerBase, mult.manpowerRegen),
      growth: growthStat(focus),
      tradeLine: "",
      costLine: ""
    };
  });
  for (const option of options) Object.assign(option, tradeLines(option, milestone?.label));
  return {
    options,
    active,
    queued,
    startsInMs: Math.max(0, nextManpowerRefillAtMs(playerId, nowMs) - nowMs),
    queuedInMs: queued ? Math.max(0, (town.pendingFocusAt ?? nowMs) - nowMs) : 0,
    growthLabel: milestone ? `To ${milestone.label}` : "Growth",
    growthPaused: paused
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
  return remaining <= 0 ? `${milestone.label} ready` : `${milestone.label} in ${townFocusDuration(remaining / rate)}`;
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
  const counts: Record<TownFocus, number> = { BALANCED: 0, GROWTH: 0, LEVY: 0, COMMERCE: 0 };
  for (const tile of towns) if (tile.town) counts[tile.town.focus ?? "BALANCED"] += 1;
  return counts;
};

/** The town record after the player picks `focus` now: what the server will store, shown before its reply. */
export const optimisticTownFocus = <T extends NonNullable<Tile["town"]>>(town: T, focus: TownFocus, playerId: string, nowMs = Date.now()): T =>
  queueTownFocus(town, focus, nextManpowerRefillAtMs(playerId, nowMs));

/** The refill after the one a change starts at: when Levy's extra manpower is first paid. */
export const townFocusFirstPayoutInMs = (startsInMs: number): number => startsInMs + MANPOWER_REFILL_WINDOW_MS;
