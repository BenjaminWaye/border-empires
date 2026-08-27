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

import type { Tile } from "../client-types.js";
import { onboardingChecklistState, completeOnboardingChecklist, type OnboardingChecklistState } from "./client-onboarding-checklist.js";

const BUBBLE_ID = "onboarding-checklist-bubble";
const PANEL_ID = "onboarding-checklist-panel";

let expanded = false;
let lastCompletedStep: OnboardingChecklistState["step"] | null = null;

const remainingSteps = (state: OnboardingChecklistState): number => {
  let remaining = 0;
  if (!state.townGoalDone) remaining += 1;
  if (state.foodSlotsClaimed < state.foodSlotsTarget) remaining += 1;
  return remaining;
};

const townGoalLabel = "Find a town and Expand To it";
const foodGoalLabel = (state: OnboardingChecklistState): string => `Expand To ${state.foodSlotsClaimed}/${state.foodSlotsTarget} food tiles`;

/** The relay-beacon blocker isn't its own permanent goal (it's transient, and ambiguous about which goal it's blocking on its own) -- rendered as a note under the two real goals instead of a third checkbox row. */
const relayBeaconNote = (state: OnboardingChecklistState): string | null =>
  state.step === "EXPAND_RELAY_BEACON" ? "Nothing in reach -- build a Relay Beacon to expand" : null;

const goalRow = (label: string, done: boolean, extraLabelClass = ""): string =>
  `<li class="onb-goal${done ? " onb-goal-done" : ""}">
    <span class="onb-checkbox" aria-hidden="true">${done ? "&#9745;" : "&#9744;"}</span>
    <span class="onb-goal-label${extraLabelClass ? ` ${extraLabelClass}` : ""}">${escapeHtml(label)}</span>
  </li>`;

const removeOnboardingChecklistOverlay = (): void => {
  if (typeof document === "undefined") return;
  document.getElementById(BUBBLE_ID)?.remove();
};

const render = (state: OnboardingChecklistState): void => {
  removeOnboardingChecklistOverlay();
  injectStyles();

  const root = document.createElement("div");
  root.id = BUBBLE_ID;
  root.className = "onb-root";
  const remaining = remainingSteps(state);
  const note = relayBeaconNote(state);
  root.innerHTML = `
    <div id="${PANEL_ID}" class="onb-panel" ${expanded ? "" : "hidden"}>
      <div class="onb-panel-title">New empire checklist</div>
      <ul class="onb-goal-list">
        ${goalRow(townGoalLabel, state.townGoalDone)}
        ${goalRow(foodGoalLabel(state), state.foodSlotsClaimed >= state.foodSlotsTarget, "onb-panel-step")}
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
.onb-root { position: fixed; left: 16px; bottom: 190px; z-index: 23; pointer-events: none; }
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
.onb-checkbox { font-size: 14px; line-height: 1.4; color: #7ee08a; flex: none; }
.onb-goal-label { font-size: 12.5px; line-height: 1.4; color: rgba(240,224,200,0.9); }
.onb-goal-done .onb-checkbox { color: rgba(126, 224, 138, 0.55); }
.onb-goal-done .onb-goal-label { color: rgba(240,224,200,0.45); text-decoration: line-through; }
.onb-goal-note { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(126, 224, 138, 0.18); font-size: 12px; line-height: 1.4; color: #d6ac6a; }
@media (max-width: 520px) {
  .onb-root { left: 10px; bottom: calc(68px + max(8px, env(safe-area-inset-bottom)) + 8px); }
  .onb-launcher { width: 40px; height: 40px; font-size: 18px; }
}`;
