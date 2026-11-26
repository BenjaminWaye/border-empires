// The server's Coin and growth figures for a town are computed at the focus it has applied, which trails a
// confirmed pick by up to a minute. These helpers show a town as if `focus` were already applied, so every screen
// (town stats, growth time, the Towns list) moves the moment the player confirms or previews a focus
// (playtest 2026-11-26: Coin/day, growth per minute and "Great City in …" did not change after a switch).
import { TOWN_FOCUS_MULTIPLIERS, townFocusLocked, type TownFocus } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

/**
 * The focus to show for a town. A confirmed pick is stored as pending and the server applies it after its next
 * population growth tick (at most a minute), so a pending focus is shown as the town's focus.
 */
export const shownTownFocus = (town: Pick<NonNullable<Tile["town"]>, "focus" | "pendingFocus"> | undefined): TownFocus =>
  town?.pendingFocus ?? town?.focus ?? "BALANCED";

/**
 * The client keeps a town locked this much past the server's lock time: the two clocks differ, and a confirm the
 * server still refuses would leave the screen showing a change that never happened.
 */
const LOCK_CLOCK_MARGIN_MS = 30_000;

/** Ms left on a town's focus lock, as the client honours it; 0 when its focus can change now. */
export const townFocusLockedInMs = (town: Pick<NonNullable<Tile["town"]>, "focusLockedUntil"> | undefined, nowMs = Date.now()): number => {
  const until = town?.focusLockedUntil;
  return typeof until === "number" && townFocusLocked(town, nowMs - LOCK_CLOCK_MARGIN_MS) ? Math.max(0, until + LOCK_CLOCK_MARGIN_MS - nowMs) : 0;
};

const scaled = (value: number | undefined, ratio: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value * ratio : value;

/**
 * `tile` with its town's Coin and growth figures moved from the server-applied focus to `focus` (default: the shown
 * one), and its focus fields set as if the server had applied it. Returns `tile` itself when nothing would change.
 */
export const townTileAtFocus = <T extends Pick<Tile, "town" | "yieldRate">>(tile: T, focus?: TownFocus): T => {
  const town = tile.town;
  if (!town) return tile;
  const target = focus ?? shownTownFocus(town);
  const applied = TOWN_FOCUS_MULTIPLIERS[town.focus ?? "BALANCED"];
  const next = TOWN_FOCUS_MULTIPLIERS[target];
  if (target === (town.focus ?? "BALANCED") && town.pendingFocus === undefined) return tile;
  const coinRatio = next.coin / applied.coin;
  const growthRatio = next.growth / applied.growth;
  const { pendingFocus: _pending, pendingFocusAt: _at, focus: _focus, ...rest } = town;
  const projected: NonNullable<Tile["town"]> = {
    ...rest,
    ...(target === "BALANCED" ? {} : { focus: target }),
    ...(typeof town.goldPerMinute === "number" ? { goldPerMinute: scaled(town.goldPerMinute, coinRatio)! } : {}),
    ...(typeof town.populationGrowthPerMinute === "number" ? { populationGrowthPerMinute: scaled(town.populationGrowthPerMinute, growthRatio)! } : {})
  };
  // A dock town's yield adds dock income, which focus does not touch: move only the town's own share.
  const townGold = typeof town.goldPerMinute === "number" && Number.isFinite(town.goldPerMinute) ? town.goldPerMinute : 0;
  const yieldRate = tile.yieldRate && typeof tile.yieldRate.goldPerMinute === "number"
    ? { ...tile.yieldRate, goldPerMinute: tile.yieldRate.goldPerMinute + townGold * (coinRatio - 1) }
    : tile.yieldRate;
  return { ...tile, town: projected, ...(yieldRate ? { yieldRate } : {}) };
};
