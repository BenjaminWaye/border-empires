// Pressable round "bubble" launcher for the new-player onboarding
// checklist, styled after the .gx-launcher circular button in
// client-galaxy-view.ts (fixed-position circle, same border/shadow/blur
// conventions) rather than the discovery-tip toast panel: a small badge
// count is readable at a glance on mobile, and tapping the bubble expands a
// short detail card without competing for screen space the way an
// always-open panel would.
//
// Positioned bottom-left, stacked above #floating-info (the "Center / Jump
// to your banner" panel, also fixed to left:12/bottom:12 in style.css) so it
// doesn't collide with the discovery-tip toast (bottom-right) or the
// galaxy-view launcher (right, above the minimap).
//
// A fixed "bottom: 190px" guess used to place this, tuned against one
// specific #floating-info layout -- on any other viewport size/zoom/content
// state it could visually collide with #center-me-desktop (the "Center /
// Jump to your banner" button) instead of clearing it. Now measured
// directly: each render, if #center-me-desktop is on screen, clear its top
// edge by CLEARANCE_ABOVE_CENTER_BUTTON instead of guessing a constant.
// (Deliberately targets that one button, not the whole #floating-info
// block -- #floating-info's height grows upward from #selected/#hover
// showing variable-length tile info, which moves #floating-info's own top
// edge but not the "Center" row's position, so measuring the whole block
// would overcorrect and make the bubble jump around on every tile click.)

import type { Tile } from "../client-types.js";
import { onboardingChecklistState, completeOnboardingChecklist, type OnboardingChecklistState } from "./client-onboarding-checklist.js";

const BUBBLE_ID = "onboarding-checklist-bubble";
const PANEL_ID = "onboarding-checklist-panel";

let expanded = false;
let lastCompletedStep: OnboardingChecklistState["step"] | null = null;

// 4 checkbox rows -- "find" (a target is known to exist) split out from
// "expand to" (actually claimed) for both the town goal and the food goal.
// See OnboardingChecklistState's doc comment for what each boolean means.
const remainingSteps = (state: OnboardingChecklistState): number =>
  [state.townFound, state.townExpanded, state.foodFound, state.foodExpanded].filter((done) => !done).length;

/** The relay-beacon blocker isn't its own permanent goal (it's transient, and ambiguous about which goal it's blocking on its own) -- rendered as a note under the 4 real goals instead of a 5th checkbox row. */
const relayBeaconNote = (state: OnboardingChecklistState): string | null =>
  state.step === "EXPAND_RELAY_BEACON" ? "Nothing in reach -- build a Relay Beacon to expand" : null;

const goalRow = (label: string, done: boolean, opts: { indent?: boolean; extraLabelClass?: string } = {}): string =>
  `<li class="onb-goal${done ? " onb-goal-done" : ""}${opts.indent ? " onb-goal-indent" : ""}">
    <span class="onb-checkbox" aria-hidden="true">${done ? "&#9745;" : "&#9744;"}</span>
    <span class="onb-goal-label${opts.extraLabelClass ? ` ${opts.extraLabelClass}` : ""}">${escapeHtml(label)}</span>
  </li>`;

const removeOnboardingChecklistOverlay = (): void => {
  if (typeof document === "undefined") return;
  document.getElementById(BUBBLE_ID)?.remove();
};

// Gap kept between the top of #center-me-desktop and the bottom of this
// bubble's launcher circle.
const CLEARANCE_ABOVE_CENTER_BUTTON = 12;
// Fallback for when #center-me-desktop isn't in the DOM yet/at all (e.g. on
// the mobile layout, where the media query below takes over entirely and
// this value is never read) or a test environment where layout isn't real.
const DEFAULT_BOTTOM_OFFSET_PX = 190;

/**
 * Measures #center-me-desktop's current on-screen top edge and returns the
 * `bottom` (px, from the viewport's bottom edge) this bubble's root needs to
 * clear it by CLEARANCE_ABOVE_CENTER_BUTTON. Falls back to the old guessed
 * constant when the button isn't measurable (missing element, or a
 * jsdom/happy-dom test environment where getBoundingClientRect always
 * returns a zero rect) so this never regresses to `bottom: 0`.
 */
const bottomOffsetClearingCenterButton = (): number => {
  if (typeof document === "undefined" || typeof window === "undefined") return DEFAULT_BOTTOM_OFFSET_PX;
  const button = document.getElementById("center-me-desktop");
  if (!button) return DEFAULT_BOTTOM_OFFSET_PX;
  const rect = button.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return DEFAULT_BOTTOM_OFFSET_PX; // unlaid-out (display:none, or a test DOM)
  // Clamped to a sane minimum so a pathological layout (button pushed to
  // the very bottom edge, or off-screen) can't collapse this to 0/negative
  // and drop the launcher off the bottom of the viewport.
  return Math.max(60, window.innerHeight - rect.top + CLEARANCE_ABOVE_CENTER_BUTTON);
};

const render = (state: OnboardingChecklistState): void => {
  removeOnboardingChecklistOverlay();
  injectStyles();

  const root = document.createElement("div");
  root.id = BUBBLE_ID;
  root.className = "onb-root";
  // Only the desktop layout's default needs this -- the mobile media query
  // sets its own literal `bottom` that always wins the cascade regardless
  // of this custom property (see the styles block below).
  root.style.setProperty("--onb-bottom", `${bottomOffsetClearingCenterButton()}px`);
  const remaining = remainingSteps(state);
  const note = relayBeaconNote(state);
  root.innerHTML = `
    <div id="${PANEL_ID}" class="onb-panel" ${expanded ? "" : "hidden"}>
      <div class="onb-panel-title">New empire checklist</div>
      <ul class="onb-goal-list">
        ${goalRow("Find a town", state.townFound)}
        ${goalRow("Expand To it", state.townExpanded, { indent: true })}
        ${goalRow(`Find food tiles (${state.foodSlotsFound}/${state.foodSlotsTarget})`, state.foodFound)}
        ${goalRow(`Expand To food tiles (${state.foodSlotsClaimed}/${state.foodSlotsTarget})`, state.foodExpanded, {
          indent: true,
          extraLabelClass: "onb-panel-step"
        })}
      </ul>
      ${note ? `<div class="onb-goal-note">${escapeHtml(note)}</div>` : ""}
    </div>
    <button id="onb-launcher" type="button" class="onb-launcher" aria-label="New empire checklist" aria-expanded="${expanded}">
      <span class="onb-launcher-icon">&#9873;</span>
      <span class="onb-badge">${remaining}</span>
    </button>`;
  document.body.appendChild(root);

  root.querySelector("#onb-launcher")?.addEventListener("click", () => {
    expanded = !expanded;
    render(state);
  });
};

/**
 * Call on every HUD render with the current tiles/player. Mirrors
 * renderDiscoveryTipOverlay's shape: recomputes state, updates the DOM
 * bubble, and persists checklist completion exactly once via a
 * last-step dedup guard (not on every re-render), so callers can call this
 * freely on each render/tile-delta tick. Returns the current highlight
 * tiles so the caller can feed the map's highlight-drawing layer.
 */
export const renderOnboardingChecklistOverlay = (
  tiles: ReadonlyMap<string, Tile>,
  playerId: string,
  authEmail: string | null | undefined
): Array<{ x: number; y: number }> => {
  const state = onboardingChecklistState(tiles, playerId, authEmail);

  if (state.step === "DONE") {
    if (lastCompletedStep !== "DONE") completeOnboardingChecklist(state, authEmail);
    lastCompletedStep = "DONE";
    removeOnboardingChecklistOverlay();
    return state.highlightTiles;
  }
  lastCompletedStep = state.step;
  if (typeof document !== "undefined") render(state);
  return state.highlightTiles;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

let injected = false;
const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
};

const styles = `
.onb-root { position: fixed; left: 16px; bottom: var(--onb-bottom, 190px); z-index: 23; pointer-events: none; }
.onb-launcher {
  position: relative; pointer-events: auto;
  width: 44px; height: 44px; padding: 0; margin: 0; appearance: none; border-radius: 50%;
  border: 1px solid rgba(126, 224, 138, 0.4); background: rgba(3, 7, 14, 0.85);
  cursor: pointer; font-size: 20px; line-height: 1; display: grid; place-items: center;
  color: #a7f3b0; box-shadow: 0 12px 30px rgba(0,0,0,0.4);
  transition: color .15s, transform .15s, background .15s;
}
.onb-launcher:hover { color: #eafff0; background: rgba(11, 19, 32, 0.9); transform: scale(1.1); }
.onb-badge {
  position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: 999px; background: #d69644; color: #1c1305; font-size: 11px; font-weight: 800;
  display: grid; place-items: center; border: 1px solid rgba(0,0,0,0.25);
}
.onb-panel {
  pointer-events: auto; position: absolute; left: 0; bottom: 54px;
  width: min(240px, calc(100vw - 32px)); padding: 12px 14px;
  border-radius: 12px; border: 1px solid rgba(126, 224, 138, 0.32);
  background: linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98));
  box-shadow: 0 18px 48px rgba(0,0,0,0.45);
  color: #fbf3e6;
}
.onb-panel[hidden] { display: none; }
.onb-panel-title { font-size: 12.5px; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 8px; color: #a7f3b0; }
.onb-goal-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.onb-goal { display: flex; align-items: flex-start; gap: 7px; }
.onb-goal-indent { padding-left: 16px; }
.onb-checkbox { font-size: 14px; line-height: 1.4; color: #7ee08a; flex: none; }
.onb-goal-label { font-size: 12.5px; line-height: 1.4; color: rgba(240,224,200,0.9); }
.onb-goal-done .onb-checkbox { color: rgba(126, 224, 138, 0.55); }
.onb-goal-done .onb-goal-label { color: rgba(240,224,200,0.45); text-decoration: line-through; }
.onb-goal-note { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(126, 224, 138, 0.18); font-size: 12px; line-height: 1.4; color: #d6ac6a; }
@media (max-width: 520px) {
  .onb-root { left: 10px; bottom: calc(68px + max(8px, env(safe-area-inset-bottom)) + 8px); }
  .onb-launcher { width: 40px; height: 40px; font-size: 18px; }
}`;
