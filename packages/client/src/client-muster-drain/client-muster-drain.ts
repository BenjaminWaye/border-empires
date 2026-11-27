// How fast muster flags are refilling from the manpower pool, for the manpower
// orb and the Manpower panel. A pool fell from 634 to 78 in about 8 minutes,
// mostly into flags, and nothing showed it (owner request 2026-11-27).
//
// Flags draw at their server-reported `ratePerMin` (MUSTER_BASE_RATE_PER_MIN
// split across the player's flags, runtime-muster-tick.ts) until full or the
// pool is empty. The rules have no per-flag pause or auto-refill switch:
// clearing a flag is the only way to stop one, and it returns what it holds.

import type { ManpowerPanelMusterFlag } from "../client-side-panel-html/client-side-panel-html.js";
import { DRAW_WINDOW_MS } from "../client-muster-draw-log/client-muster-draw-log.js";

type DrainFlag = Pick<ManpowerPanelMusterFlag, "amount" | "cap" | "refillPerMin" | "drawnRecently">;

/** Manpower/min all flags are drawing from the pool right now. */
export const flagDrainPerMin = (flags: readonly DrainFlag[]): number =>
  flags.reduce((sum, flag) => sum + Math.max(0, flag.refillPerMin ?? 0), 0);

/** Manpower sitting in flags. */
export const flagStagedTotal = (flags: readonly DrainFlag[]): number =>
  flags.reduce((sum, flag) => sum + Math.max(0, flag.amount), 0);

const whole = (n: number): string => Math.round(n).toLocaleString("en-US");

/** "−45/min → flags"; empty when nothing is refilling. */
export const flagDrainLabel = (perMin: number): string => (perMin >= 0.5 ? `−${whole(perMin)}/min → flags` : "");

/** One flag's second line: "Drew 120 in 10m · −45/min · fills to 150". */
export const musterFlagDrawText = (flag: DrainFlag): string => {
  const parts = [`Drew ${whole(flag.drawnRecently ?? 0)} in ${Math.round(DRAW_WINDOW_MS / 60_000)}m`];
  if ((flag.refillPerMin ?? 0) >= 0.5) parts.push(`−${whole(flag.refillPerMin!)}/min`);
  if (flag.cap !== undefined) parts.push(flag.amount >= flag.cap - 0.5 ? "full" : `fills to ${whole(flag.cap)}`);
  return parts.join(" · ");
};

/** The panel's flag-section note while any flag refills: "Refilling from your pool: −45/min · clear a flag to stop it". */
export const musterFlagDrainText = (flags: readonly DrainFlag[]): string => {
  const perMin = flagDrainPerMin(flags);
  return perMin >= 0.5 ? `Refilling from your pool: −${whole(perMin)}/min · clear a flag to stop it` : "";
};
