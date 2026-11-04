// Compact (phone) behaviour of the new HUD's map screen (Phase 1 of
// docs/hud-v2-mobile-plan.md). The layout itself is CSS on body.hud-v2-compact
// (client-hud-v2-compact*.css); this module holds what behaves differently on a
// phone: the resource bar is one target that opens a Treasury sheet, the
// tracker folds to one summary line, and the back gesture closes the open
// screen.

import { pushBackEntry, type BackHandle } from "./client-hud-v2-back.js";
import { createHudV2Sheet, type HudV2Sheet } from "./client-hud-v2-sheet.js";
import { buildSlotsHtml, formatRemaining, trackerHtml, trackerNeeds, type TrackerInput } from "./client-hud-v2-tracker.js";

// ---- Treasury: every resource with its breakdown, from one tap on the bar ----

let treasury: HudV2Sheet | undefined;
let treasuryHtml = "";

const treasuryBody = (barHtml: string): string =>
  `<div class="v2c-treasury"><h2 class="v2c-treasury-title">Treasury</h2><p class="v2c-treasury-hint">Tap a resource for its breakdown.</p><div class="v2c-treasury-rows">${barHtml}</div></div>`;

export const treasuryOpen = (): boolean => treasury !== undefined;

export const openTreasury = (layer: HTMLElement, barHtml: string): void => {
  if (treasury) return;
  treasury = createHudV2Sheet(layer, { label: "Treasury", detents: ["half", "full"], initial: "half", onClose: () => { treasury = undefined; } });
  treasury.el.classList.add("v2c-treasury-sheet");
  treasuryHtml = treasuryBody(barHtml);
  treasury.body.innerHTML = treasuryHtml;
};

/**
 * Keeps an open Treasury live with the bar (same 250 ms frame). Rows update in place, so a tap that lands while a
 * number ticks still reaches its button; only a change in which rows exist rebuilds the list.
 */
export const syncTreasury = (barHtml: string): void => {
  if (!treasury) return;
  const html = treasuryBody(barHtml);
  if (html === treasuryHtml) return;
  treasuryHtml = html;
  const rows = treasury.body.querySelector(".v2c-treasury-rows");
  const next = treasury.el.ownerDocument.createElement("div");
  next.innerHTML = barHtml;
  const keyOf = (el: Element): string => (el as HTMLElement).dataset.hudV2Chip ?? el.className;
  const current = rows ? Array.from(rows.children) : [];
  const incoming = Array.from(next.children);
  if (!rows || current.length !== incoming.length || current.some((el, i) => keyOf(el) !== keyOf(incoming[i]!))) {
    treasury.body.innerHTML = html;
    return;
  }
  current.forEach((el, i) => {
    const fresh = incoming[i]!;
    if (el.innerHTML !== fresh.innerHTML) el.innerHTML = fresh.innerHTML;
    if (el.className !== fresh.className) el.className = fresh.className;
  });
};

export const closeTreasury = (): void => treasury?.close();

// ---- Tracker: one summary line, unfolded on tap ----

export const compactTracker = { open: false };

/** "2 need you · Dev 2/3 · Battle 0:42" — the folded tracker, which unfolds into the full one. */
export const trackerSummaryHtml = (input: TrackerInput): string => {
  const needs = trackerNeeds(input).length;
  const limit = Math.max(0, input.buildSlots.limit);
  const busy = Math.min(limit, Math.max(0, input.buildSlots.busy));
  const parts = [
    needs > 0 ? `<b class="v2c-track-needs">${needs} need${needs === 1 ? "s" : ""} you</b>` : "",
    `Dev ${busy}/${limit}`,
    input.flags.length > 0 ? `⚑ ${input.flags.length}` : "",
    input.capture ? `${input.capture.battle ? "Battle" : "Expanding"} ${formatRemaining(input.capture.resolvesAt - input.nowMs)}` : ""
  ].filter(Boolean);
  return `<button type="button" class="v2c-track-line" data-v2c-tracker-toggle aria-expanded="false" aria-label="Tracker: ${parts.length} items, tap to unfold"><span class="v2c-track-caret" aria-hidden="true">▸</span>${parts.join(" · ")}</button>`;
};

export const compactTrackerHtml = (input: TrackerInput): string => {
  if (!compactTracker.open) return trackerSummaryHtml(input);
  const fold = `<button type="button" class="v2c-track-line v2c-track-line-open" data-v2c-tracker-toggle aria-expanded="true" aria-label="Fold the tracker"><span class="v2c-track-caret" aria-hidden="true">▾</span>Tracker</button>`;
  // The full tracker repeats the slot pips; keep them, they fold the slot list.
  return `${fold}${trackerHtml(input) || buildSlotsHtml(input.buildSlots, input.slotsOpen)}`;
};

// ---- Taps ----

export type CompactClickContext = {
  layer: HTMLElement;
  barHtml: () => string;
  openChip: (chip: string) => void;
  repaintTracker: () => void;
};

/** Handles a tap on the HUD layer the compact way; true when it consumed the tap. */
export const compactLayerClick = (target: Element, ctx: CompactClickContext): boolean => {
  const inTreasury = target.closest(".v2c-treasury");
  if (inTreasury) {
    const chip = target.closest<HTMLElement>("[data-hud-v2-chip]")?.dataset.hudV2Chip;
    if (chip) {
      closeTreasury();
      ctx.openChip(chip);
      return true;
    }
    // The gear (and anything else that opens something) closes the Treasury first, then opens as usual.
    if (target.closest("[data-hud-v2-open]")) closeTreasury();
    return false;
  }
  if (target.closest("#hud-v2-bar [data-hud-v2-chip], #hud-v2-bar .hud-v2-chip-static")) {
    openTreasury(ctx.layer, ctx.barHtml());
    return true;
  }
  if (target.closest("[data-v2c-tracker-toggle]")) {
    compactTracker.open = !compactTracker.open;
    ctx.repaintTracker();
    return true;
  }
  // Jumping to a tracker row folds the tracker so the map shows.
  if (compactTracker.open && target.closest("#hud-v2-tracker [data-hud-v2-focus-x], #hud-v2-tracker [data-hud-v2-open]")) {
    compactTracker.open = false;
    ctx.repaintTracker();
  }
  return false;
};

// ---- Back gesture ----

let backEntry: BackHandle | undefined;

/**
 * One history entry while anything closable is open on a phone (a screen, a profile, a hosted panel, the tile
 * panel), so back closes it like Esc does on desktop instead of leaving the game. `onBack` closes the topmost
 * thing; if something is still open, the next frame pushes a fresh entry for it.
 */
export const syncBackEntry = (open: boolean, onBack: () => void): void => {
  if (open && !backEntry) {
    backEntry = pushBackEntry(() => {
      backEntry = undefined;
      onBack();
    });
  } else if (!open && backEntry) {
    backEntry.release();
    backEntry = undefined;
  }
};
