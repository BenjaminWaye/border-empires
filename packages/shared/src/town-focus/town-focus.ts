import { z } from "zod";

// Town focus (docs/town-focus-plan.md): a free per-town choice that shifts a
// town's own output between population growth, manpower regen and Coin.
// A confirmed change applies after the next population growth tick, and the
// town is then locked until the owner's next manpower refill
// (apps/simulation/src/town-focus/). A town with no focus set is Balanced,
// which equals the pre-focus numbers exactly.

export const TOWN_FOCUSES = ["BALANCED", "GROWTH", "LEVY", "COMMERCE"] as const;
export type TownFocus = (typeof TOWN_FOCUSES)[number];
export const TownFocusSchema = z.enum(TOWN_FOCUSES);

export type TownFocusMultipliers = { readonly growth: number; readonly manpowerRegen: number; readonly coin: number };

/** Starting values for the balance pass: +20% to the chosen output, −10% to the other two. */
export const TOWN_FOCUS_MULTIPLIERS: Readonly<Record<TownFocus, TownFocusMultipliers>> = {
  BALANCED: { growth: 1, manpowerRegen: 1, coin: 1 },
  GROWTH: { growth: 1.2, manpowerRegen: 0.9, coin: 0.9 },
  LEVY: { growth: 0.9, manpowerRegen: 1.2, coin: 0.9 },
  COMMERCE: { growth: 0.9, manpowerRegen: 0.9, coin: 1.2 }
};

export const TOWN_FOCUS_LABELS: Readonly<Record<TownFocus, string>> = {
  BALANCED: "Balanced",
  GROWTH: "Growth",
  LEVY: "Levy",
  COMMERCE: "Commerce"
};

/** Most towns one SET_TOWN_FOCUS may name; the command is free, so it is bounded. */
export const TOWN_FOCUS_MAX_TILES_PER_COMMAND = 100;

/** The focus fields stored on a town record. Absent means Balanced with nothing queued. */
export type TownFocusFields = {
  /** Active focus; absent = BALANCED. */
  focus?: TownFocus;
  /** Picked focus, made active after the next population growth tick (pendingFocusAt is when it was picked). */
  pendingFocus?: TownFocus;
  pendingFocusAt?: number;
  /** The focus cannot change again before this time: the owner's next manpower refill after the last change. */
  focusLockedUntil?: number;
};

export const activeTownFocus = (town: TownFocusFields | undefined): TownFocus => town?.focus ?? "BALANCED";

export const townFocusMultipliers = (town: TownFocusFields | undefined): TownFocusMultipliers =>
  TOWN_FOCUS_MULTIPLIERS[activeTownFocus(town)];

/** True while a recent change keeps the town's focus fixed. */
export const townFocusLocked = (town: TownFocusFields | undefined, nowMs: number): boolean =>
  typeof town?.focusLockedUntil === "number" && town.focusLockedUntil > nowMs;

/** Removes every focus field: used on capture, town return and promotion bookkeeping. */
export const withoutTownFocus = <T extends TownFocusFields>(town: T): Omit<T, "focus" | "pendingFocus" | "pendingFocusAt" | "focusLockedUntil"> => {
  const { focus: _focus, pendingFocus: _pending, pendingFocusAt: _at, focusLockedUntil: _locked, ...rest } = town;
  return rest;
};

/**
 * The town after the player asks for `requested`, with `effectiveAt` when it
 * was asked for. Asking for the active focus cancels any queued
 * change. Returns the same object when nothing would change, so callers can
 * skip the write and the tile delta.
 */
export const queueTownFocus = <T extends TownFocusFields>(town: T, requested: TownFocus, effectiveAt: number): T => {
  const active = activeTownFocus(town);
  if (requested === active) {
    if (town.pendingFocus === undefined && town.pendingFocusAt === undefined) return town;
    const { pendingFocus: _pending, pendingFocusAt: _at, ...rest } = town;
    return rest as T;
  }
  // Already picked and waiting for the next growth tick: nothing to write.
  if (town.pendingFocus === requested) return town;
  return { ...town, pendingFocus: requested, pendingFocusAt: effectiveAt };
};

/**
 * The town with its queued focus made active. Balanced is stored as absent. The stored growth rate is the one the
 * last growth tick applied under the old focus; it is rescaled so every screen shows the new focus's rate at once
 * instead of a minute later.
 */
export const promoteTownFocus = <T extends TownFocusFields & { populationGrowthPerMinute?: number }>(town: T): T => {
  if (town.pendingFocus === undefined) return town;
  const next = town.pendingFocus;
  const { focus: _focus, pendingFocus: _pending, pendingFocusAt: _at, ...rest } = town;
  const rate = town.populationGrowthPerMinute;
  const rescaled = typeof rate === "number" && Number.isFinite(rate)
    ? { populationGrowthPerMinute: Number(((rate / townFocusMultipliers(town).growth) * TOWN_FOCUS_MULTIPLIERS[next].growth).toFixed(4)) }
    : {};
  return (next === "BALANCED" ? { ...rest, ...rescaled } : { ...rest, ...rescaled, focus: next }) as T;
};
