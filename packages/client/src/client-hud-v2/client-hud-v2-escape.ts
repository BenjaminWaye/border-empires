// When Esc may open the Settings system menu: only when nothing else on the
// page wants that keypress (a mode the map's own Esc handler or a dialog will
// close). Checked in the capture phase, before those handlers run.

import type { ClientState } from "../client-state/client-state.js";

type IdleState = Pick<ClientState, "tileActionMenu" | "capture" | "buildingPlacement" | "crystalTargeting" | "garrisonMany" | "photoModeActive">;

/** Open dialogs that handle Esc themselves (trade view, effort sheet, survey, ruins, bug report, …). */
const OPEN_DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], .effort-confirm-overlay, .diplomacy-trade-overlay';

const isShown = (el: Element): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("#hud-v2")) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
};

export const escapeOpensSettings = (state: IdleState, doc: Pick<Document, "querySelectorAll" | "body">): boolean => {
  if (state.tileActionMenu.visible || state.capture !== undefined || state.buildingPlacement.active) return false;
  if (state.crystalTargeting.active || state.garrisonMany.active || state.photoModeActive) return false;
  if (doc.body.classList.contains("photo-mode")) return false;
  return !Array.from(doc.querySelectorAll(OPEN_DIALOG_SELECTOR)).some(isShown);
};
