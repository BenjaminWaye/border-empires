// Town focus on the Towns list (docs/town-focus-plan.md): a Focus column with four icon buttons per town, and a
// "Set every town" bar above the table. Kept beside client-hud-v2-towns.ts so the table file stays small.
import { TOWN_FOCUSES, type TownFocus } from "@border-empires/shared";
import { escapeHtml as esc } from "../client-duke-panel/client-duke-escape.js";
import { townFocusName, townFocusRule } from "../client-town-focus/client-town-focus.js";
import { townFocusIcon } from "./client-hud-v2-town-focus.js";

/** One town's focus as the list shows it: the one chosen for it (shownTownFocus). */
export type TownsFocusState = { active: TownFocus; growthPaused: boolean };

export type TownsFocusView = {
  /** Keyed "x,y". Towns missing from the map get no focus cell. */
  byKey: ReadonlyMap<string, TownsFocusState>;
  /** "Set every town" was pressed once for this focus and waits for a second press. */
  confirmAll?: TownFocus;
};


/** The four icon buttons for one town. */
export const townsFocusCellHtml = (key: string, s: TownsFocusState | undefined): string => {
  if (!s) return `<span class="v2lf-cell"></span>`;
  const buttons = TOWN_FOCUSES.map((focus) => {
    const state = focus === s.active ? "active" : "idle";
    const paused = focus === "GROWTH" && s.growthPaused;
    const title = `${townFocusName(focus)}${state === "active" ? " (active)" : ""}: ${townFocusRule(focus)}${paused ? ". Growth is paused here, so this focus would only cost Coin and MP." : ""}`;
    return `<button type="button" class="v2lf-btn v2lf-${state} v2tf-f-${focus.toLowerCase()}${paused ? " v2lf-paused" : ""}" data-v2-towns-focus="${key}" data-focus="${focus}" aria-pressed="${state !== "idle"}" title="${esc(title)}" aria-label="${esc(title)}">${townFocusIcon(focus)}</button>`;
  }).join("");
  return `<span class="v2lf-cell" role="group" aria-label="Focus">${buttons}</span>`;
};

/** The bar above the table: set one focus on every town, with a second press to confirm. */
export const townsFocusBarHtml = (view: TownsFocusView, townCount: number): string => {
  if (townCount < 2) return "";
  const counts: Record<TownFocus, number> = { BALANCED: 0, GROWTH: 0, LEVY: 0, COMMERCE: 0 };
  for (const s of view.byKey.values()) counts[s.active] += 1;
  const mix = TOWN_FOCUSES.filter((f) => counts[f] > 0).map((f) => `${counts[f]} ${townFocusName(f)}`).join(" · ");
  const buttons = TOWN_FOCUSES.map((focus) => {
    const arming = view.confirmAll === focus;
    const changing = Math.max(0, townCount - counts[focus]);
    return `<button type="button" class="v2lf-all${arming ? " v2lf-all-confirm" : ""} v2tf-f-${focus.toLowerCase()}" data-v2-towns-focus-all="${focus}"${changing === 0 ? " disabled" : ""} title="${esc(`Switch every town to ${townFocusName(focus)} now. ${townFocusRule(focus)}`)}">${townFocusIcon(focus)}<span>${arming ? `Again: ${changing} → ${esc(townFocusName(focus))}` : esc(townFocusName(focus))}</span></button>`;
  }).join("");
  return `<div class="v2lf-bar"><span class="v2lf-bar-label">Set every town<small>${esc(mix)} · free, switches now</small></span><span class="v2lf-bar-btns">${buttons}</span></div>`;
};
