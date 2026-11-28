// Town focus on the Towns list (docs/town-focus-plan.md): a Focus column with four icon buttons per town, and a
// "Set every town" bar above the table. Kept beside client-hud-v2-towns.ts so the table file stays small.
import { TOWN_FOCUSES, TOWN_FOCUS_MAX_TILES_PER_COMMAND, type TownFocus } from "@border-empires/shared";
import { escapeHtml as esc } from "../client-duke-panel/client-duke-escape.js";
import { townFocusName, townFocusRule } from "../client-town-focus/client-town-focus.js";
import { townFocusIcon } from "./client-hud-v2-town-focus.js";

/** One town's focus as the list shows it: the one chosen for it (shownTownFocus), any preview, and its lock. */
export type TownsFocusState = {
  active: TownFocus;
  growthPaused: boolean;
  /** Picked to preview on this row; the ✓ button confirms it. */
  selected?: TownFocus;
  /** Ms before this town's focus can change again; 0 when it is free. */
  lockedInMs: number;
};

export type TownsFocusView = {
  /** Keyed "x,y". Towns missing from the map get no focus cell. */
  byKey: ReadonlyMap<string, TownsFocusState>;
  /** "Set every town" was pressed once for this focus and waits for a second press. */
  confirmAll?: TownFocus;
  /** Ms a change made now stays locked: until the player's next refill. Shown on every confirm before it is pressed. */
  lockForMs?: number;
};

/** "1h 12m" or "37m", for the lock. */
const lockText = (ms: number): string => {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
};

const LOCK_ICON = '<svg class="v2tf-ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
const CHECK_ICON = '<svg class="v2tf-ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-7"/></svg>';

/**
 * The fifth slot: ✓ to confirm a preview, a padlock while locked, else an empty space so nothing shifts. The ✓ reads
 * "Lock 3h 58m": players learned the lock only after confirming (owner, First-15 round 1).
 */
const endSlot = (key: string, s: TownsFocusState, lockForMs: number | undefined): string => {
  if (s.lockedInMs > 0) {
    const title = `Locked until your next refill, in ${lockText(s.lockedInMs)}: a town's focus can change once per refill`;
    return `<span class="v2lf-end v2lf-lock" title="${esc(title)}" aria-label="${esc(title)}">${LOCK_ICON}</span>`;
  }
  if (!s.selected) return `<span class="v2lf-end"></span>`;
  const lock = lockForMs !== undefined ? lockText(lockForMs) : undefined;
  const title = `Confirm ${townFocusName(s.selected)}: switches within a minute and stays until your next refill${lock ? `, in ${lock}` : ""}`;
  const label = lock ? `<span class="v2lf-confirm-lock">Lock ${lock}</span>` : "";
  return `<button type="button" class="v2lf-end v2lf-confirm${lock ? " v2lf-confirm-wide" : ""} v2tf-f-${s.selected.toLowerCase()}" data-v2-towns-focus-confirm="${key}" title="${esc(title)}" aria-label="${esc(title)}">${CHECK_ICON}${label}</button>`;
};

/** The four icon buttons for one town, then its confirm or lock slot. */
export const townsFocusCellHtml = (key: string, s: TownsFocusState | undefined, lockForMs?: number): string => {
  if (!s) return `<span class="v2lf-cell"></span>`;
  const locked = s.lockedInMs > 0;
  const buttons = TOWN_FOCUSES.map((focus) => {
    const state = focus === s.active ? "active" : focus === s.selected ? "picked" : "idle";
    const paused = focus === "GROWTH" && s.growthPaused;
    const how = state === "active" ? " (active)" : state === "picked" ? " (preview: ✓ to confirm)" : locked ? "" : " (tap to preview)";
    const title = `${townFocusName(focus)}${how}: ${townFocusRule(focus)}${paused ? ". Growth is paused here, so this focus would only cost Coin and MP." : ""}${locked && state !== "active" ? `. Locked until your next refill, in ${lockText(s.lockedInMs)}.` : ""}`;
    return `<button type="button" class="v2lf-btn v2lf-${state} v2tf-f-${focus.toLowerCase()}${paused ? " v2lf-paused" : ""}" data-v2-towns-focus="${key}" data-focus="${focus}" aria-pressed="${state !== "idle"}"${locked ? " disabled" : ""} title="${esc(title)}" aria-label="${esc(title)}">${townFocusIcon(focus)}</button>`;
  }).join("");
  return `<span class="v2lf-cell" role="group" aria-label="Focus">${buttons}${endSlot(key, s, lockForMs)}</span>`;
};

/** The bar above the table: set one focus on every unlocked town, with a second press to confirm. */
export const townsFocusBarHtml = (view: TownsFocusView, townCount: number): string => {
  if (townCount < 2) return "";
  const counts: Record<TownFocus, number> = { BALANCED: 0, GROWTH: 0, LEVY: 0, COMMERCE: 0 };
  const free: Record<TownFocus, number> = { BALANCED: 0, GROWTH: 0, LEVY: 0, COMMERCE: 0 };
  let freeTotal = 0;
  for (const s of view.byKey.values()) {
    counts[s.active] += 1;
    if (s.lockedInMs > 0) continue;
    free[s.active] += 1;
    freeTotal += 1;
  }
  const locked = view.byKey.size - freeTotal;
  const mix = TOWN_FOCUSES.filter((f) => counts[f] > 0).map((f) => `${counts[f]} ${townFocusName(f)}`).join(" · ");
  const buttons = TOWN_FOCUSES.map((focus) => {
    const arming = view.confirmAll === focus;
    // One command carries at most TOWN_FOCUS_MAX_TILES_PER_COMMAND towns; never promise more than it sends.
    const changing = Math.min(Math.max(0, freeTotal - free[focus]), TOWN_FOCUS_MAX_TILES_PER_COMMAND);
    return `<button type="button" class="v2lf-all${arming ? " v2lf-all-confirm" : ""} v2tf-f-${focus.toLowerCase()}" data-v2-towns-focus-all="${focus}"${changing === 0 ? " disabled" : ""} title="${esc(`Switch every unlocked town to ${townFocusName(focus)}; each then stays until your next refill. ${townFocusRule(focus)}`)}">${townFocusIcon(focus)}<span>${arming ? `Again: ${changing} → ${esc(townFocusName(focus))}${view.lockForMs !== undefined ? ` · locks ${lockText(view.lockForMs)}` : ""}` : esc(townFocusName(focus))}</span></button>`;
  }).join("");
  const note = locked > 0 ? ` · ${locked} locked until your next refill` : "";
  return `<div class="v2lf-bar"><span class="v2lf-bar-label">Set every town<small>${esc(mix)}${esc(note)} · a change locks until your next refill</small></span><span class="v2lf-bar-btns">${buttons}</span></div>`;
};
