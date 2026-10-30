// The "break truce / break alliance?" confirmation shown when a player
// presses Launch Attack on a truced or allied empire (or Break Truce
// directly). Lists what breaking the pact costs before anything is sent.
// Self-contained DOM overlay like client-effort-confirm-sheet.ts, and reuses
// its card styling, but with its own overlay class and data attributes so the
// HUD v2 battle screen (which watches the effort sheet) never mistakes a
// pact confirmation for a launched attack.
import {
  BROKEN_ALLIANCE_OPINION_PENALTY,
  BROKEN_PACT_OPINION_WINDOW_DAYS,
  BROKEN_TRUCE_GRUDGE_OPINION_PENALTY,
  BROKEN_TRUCE_REPUTATION_OPINION_PENALTY,
  BROKEN_TRUCE_REPUTATION_OPINION_PENALTY_CAP
} from "@border-empires/shared";
import { TRUCE_BREAK_LOCKOUT_MS } from "@border-empires/game-domain";

export type BreakPactSheetOptions = {
  title: string;
  subtitle: string;
  consequences: string[];
  confirmLabel: string;
  onConfirm: () => void;
};

const HOUR_MS = 60 * 60_000;

/** What breaking a truce with `targetName` means for the breaker, one line each. */
export const breakTruceConsequences = (targetName: string): string[] => [
  `The truce with ${targetName} ends immediately and you can attack them.`,
  `You can't make or accept new truces for ${Math.round(TRUCE_BREAK_LOCKOUT_MS / HOUR_MS)} hours.`,
  `Every other AI ruler thinks less of you: −${BROKEN_TRUCE_REPUTATION_OPINION_PENALTY} opinion for ${BROKEN_PACT_OPINION_WINDOW_DAYS} days per broken truce (up to −${BROKEN_TRUCE_REPUTATION_OPINION_PENALTY_CAP}).`,
  `If ${targetName} is an AI ruler, it holds a grudge for the rest of the season (−${BROKEN_TRUCE_GRUDGE_OPINION_PENALTY} opinion) and will never ally with you.`,
  "The broken truce is shown on your profile for the rest of the season."
];

/** What breaking an alliance with `targetName` means for the breaker, one line each. */
export const breakAllianceConsequences = (targetName: string): string[] => [
  `Your alliance with ${targetName} will be broken in 24 hours. Until then you are still allies.`,
  `You can attack ${targetName} once the 24 hours have passed. No attack or muster flag is queued now.`,
  `${targetName} is told right away that you are breaking the alliance.`,
  `If ${targetName} is an AI ruler, it thinks less of you: −${BROKEN_ALLIANCE_OPINION_PENALTY} opinion for ${BROKEN_PACT_OPINION_WINDOW_DAYS} days.`
];

let activeSheet: { teardown: () => void } | undefined;

/** Closes the open pact sheet without confirming. Safe to call when none is shown. */
export const hideBreakPactSheet = (): void => activeSheet?.teardown();

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

/** Shows the sheet; returns false when there is no DOM to show it in. */
export const showBreakPactSheet = (options: BreakPactSheetOptions): boolean => {
  if (typeof document === "undefined" || !document.body) return false;
  hideBreakPactSheet();
  let closed = false;
  const overlay = document.createElement("div");
  overlay.className = "break-pact-overlay";
  overlay.setAttribute("role", "presentation");
  const card = document.createElement("div");
  card.className = "effort-confirm-card break-pact-card";
  card.setAttribute("role", "alertdialog");
  card.setAttribute("aria-label", options.title);
  card.innerHTML = `
    <h3 class="effort-confirm-title">${escapeHtml(options.title)}</h3>
    <p class="effort-confirm-subtitle">${escapeHtml(options.subtitle)}</p>
    <ul class="break-pact-consequences">${options.consequences.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    <div class="effort-confirm-actions">
      <button type="button" class="effort-confirm-cancel" data-pact-cancel>Cancel</button>
      <button type="button" class="effort-confirm-go" data-pact-go>${escapeHtml(options.confirmLabel)}</button>
    </div>
  `;
  overlay.appendChild(card);
  const teardown = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    activeSheet = undefined;
  };
  const confirm = (): void => {
    if (closed) return;
    teardown();
    options.onConfirm();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") teardown();
  };
  card.querySelector<HTMLButtonElement>("[data-pact-cancel]")?.addEventListener("click", teardown);
  const goBtn = card.querySelector<HTMLButtonElement>("[data-pact-go]");
  goBtn?.addEventListener("click", confirm);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  activeSheet = { teardown };
  // Focus Cancel, not the destructive button, so a stray Enter backs out.
  card.querySelector<HTMLButtonElement>("[data-pact-cancel]")?.focus();
  return true;
};
