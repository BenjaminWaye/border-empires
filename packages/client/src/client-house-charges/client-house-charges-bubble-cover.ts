// When the House Charges bubble steps aside. The docked "0/2" cards (and their "Showing: …" note) sit at the
// map's left edge, where they drew over the tile sheet's title and primary button, the Expansion-queued
// popup's Center button and the Build list (playtest 2026-11-26). While any of those is open the bubble
// hides, without counting the deal as handled; it comes back once they close.
// First-15 playtest (2026-11-28): it also drew over the open Tracker list (the bubble is body-level, so it paints
// over all of #hud), over a "Change empire?" confirm sheet and under/over the Town Captured card. It now also
// steps aside for those: the notice gate's modals (client-notice-gate.ts), the open Tracker list and any
// full-screen card, on screen or waiting.
import { noticeModalOpen } from "../client-notice-gate/client-notice-gate.js";
import { activeFullscreenCard, queuedFullscreenCardCount } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";

/** Surfaces the bubble must never draw over: the tile sheet, the Build list, the open Tracker list. */
const COVERING_SELECTORS = ["#hud-v2-tile:not([hidden])", "#hud-v2-build:not([hidden])", ".hud-v2-tracker .v2c-track-line-open"] as const;
/** Shown and hidden with an inline display (client-capture-effects.ts; the placement bar, client-afc-recovery.ts). */
const INLINE_DISPLAY_IDS = ["capture-card", "placement-overlay"] as const;

const shownInline = (el: HTMLElement | null): boolean => el !== null && el.style.display !== "" && el.style.display !== "none";

/** True while a sheet, popup or modal the bubble would cover is open. */
export const houseChargesBubbleCovered = (doc: Document): boolean =>
  COVERING_SELECTORS.some((selector) => doc.querySelector(selector) !== null) ||
  INLINE_DISPLAY_IDS.some((id) => shownInline(doc.getElementById(id))) ||
  noticeModalOpen(doc) ||
  activeFullscreenCard() !== undefined ||
  queuedFullscreenCardCount() > 0;
