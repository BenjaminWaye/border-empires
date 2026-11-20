// The guide's one piece of chrome: a small card in the bottom-left corner
// (the slot the New empire checklist bubble uses for older accounts, above
// the Center/AFC button). It never blocks the map: the root ignores pointer
// events and only the card's own buttons take clicks, there is no scrim, and
// it collapses to a small round launcher with a remaining-steps badge.
//
// It shows exactly one step at a time: chapter, what to do, one line of why,
// progress, and the step's actions -- "Show me" (centre the camera on the
// step's map target), "Skip" (this step) and, on the final step, "Finish". A
// compact "Skip guide" button in the same row ends the guide for the rest of the season (Settings can
// restart it; every season starts it again).

import type { GuideLookForIcon, GuideView } from "./tutorial-guide-steps.js";
import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import { ONBOARDING_CORNER_BOTTOM_PX } from "../client-onboarding-checklist/client-onboarding-corner-position.js";

const ROOT_ID = "tutorial-guide-root";
const RAISED_CLASS = "tg-raised";
/** Set while any panel or screen is open: the minimised "?" launcher then stays off it (see styles). */
const OVER_UI_CLASS = "tg-over-ui";

export type GuideCardHandlers = {
  onShowMe: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onHide: () => void;
  onToggle: () => void;
};

type StepView = Extract<GuideView, { kind: "step" }>;

const LOOK_FOR_LABEL: Record<GuideLookForIcon, string> = { FOOD: "Grain", FISH: "Fish" };

/** "Look for [grain] Grain [fish] Fish": the same resource art the map and menus use, so the player knows what to spot. */
const lookForHtml = (icons: ReadonlyArray<GuideLookForIcon> | undefined): string =>
  icons && icons.length > 0
    ? `<div class="tg-lookfor">Look for ${icons.map((icon) => `<span class="tg-lookfor-item"><span aria-hidden="true">${resourceIconHtml(icon)}</span>${LOOK_FOR_LABEL[icon]}</span>`).join("")}</div>`
    : "";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export const removeGuideCard = (): void => {
  if (typeof document === "undefined") return;
  document.getElementById(ROOT_ID)?.remove();
};

export const guideCardHtml = (view: StepView, expanded: boolean): string => {
  const remaining = view.totalCount - view.completedCount;
  const progressPct = Math.round((view.completedCount / view.totalCount) * 100);
  const actions = [
    view.highlightTiles.length > 0 ? `<button type="button" class="tg-btn tg-btn-primary" data-guide-action="show-me">Show me</button>` : "",
    view.step.acknowledge
      ? `<button type="button" class="tg-btn tg-btn-primary" data-guide-action="finish">Finish</button>`
      : `<button type="button" class="tg-btn" data-guide-action="skip">Skip</button>`
  ].join("");
  return `
    <section class="tg-card" ${expanded ? "" : "hidden"} aria-label="Guide">
      <div class="tg-head">
        <span class="tg-chapter">Guide · ${escapeHtml(view.chapterTitle)}</span>
        <button type="button" class="tg-collapse" data-guide-action="toggle" aria-label="Minimise guide">&#8211;</button>
      </div>
      <div class="tg-title${view.waiting ? " tg-title-waiting" : ""}">${escapeHtml(view.title)}</div>
      ${view.waiting ? "" : `<div class="tg-why">${escapeHtml(view.why)}</div>`}
      ${lookForHtml(view.lookFor)}
      ${view.laterChapterTitles.length > 0 ? `<div class="tg-later">${view.step.acknowledge ? "Back on first contact" : "Later"}: ${escapeHtml(view.laterChapterTitles.join(", "))}</div>` : ""}
      <div class="tg-progress-row">
        <div class="tg-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${view.totalCount}" aria-valuenow="${view.completedCount}"><span style="width:${progressPct}%"></span></div>
        <span class="tg-count">${view.completedCount}/${view.totalCount}</span>
      </div>
      <div class="tg-actions">${actions}<button type="button" class="tg-btn tg-skip-guide" data-guide-action="hide">Skip guide</button></div>
    </section>
    <button type="button" class="tg-launcher" data-guide-action="toggle" ${expanded ? "hidden" : ""} aria-label="Open guide (${remaining} steps left)">
      <span aria-hidden="true">?</span><span class="tg-badge">${remaining}</span>
    </button>`;
};

/**
 * The card when the guide ends: a short "Guide complete" acknowledgement that
 * closes itself (renderGuideCompleteCard) or on its Close button. The guide
 * only ends once every step is done: Finish with Contest / Diplomacy still
 * waiting folds the guide until first contact instead (tutorial-guide.ts).
 */
export const guideCompleteCardHtml = (stepCount: number): string => `
    <section class="tg-card tg-card-complete" role="status" aria-label="Guide complete">
      <div class="tg-head"><span class="tg-chapter">Guide complete</span></div>
      <div class="tg-title"><span class="tg-check" aria-hidden="true">&#10003;</span> You know the basics</div>
      <div class="tg-why">Every step done. Restart the guide from Settings.</div>
      <div class="tg-progress-row">
        <div class="tg-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${stepCount}" aria-valuenow="${stepCount}"><span style="width:100%"></span></div>
        <span class="tg-count">${stepCount}/${stepCount}</span>
      </div>
      <div class="tg-actions"><button type="button" class="tg-btn tg-btn-primary" data-guide-complete-close>Close</button></div>
    </section>`;

const COMPLETE_CARD_MS = 8_000;

/** Replaces the card with the completion acknowledgement; it removes itself after a few seconds. */
export const renderGuideCompleteCard = (stepCount: number): void => {
  if (typeof document === "undefined") return;
  injectStyles();
  document.getElementById(ROOT_ID)?.remove();
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "onb-root";
  root.style.setProperty("--tg-bottom", `${ONBOARDING_CORNER_BOTTOM_PX}px`);
  root.innerHTML = guideCompleteCardHtml(stepCount);
  document.body.appendChild(root);
  const close = (): void => {
    if (root.isConnected) root.remove();
  };
  root.querySelector("[data-guide-complete-close]")?.addEventListener("click", close);
  setTimeout(close, COMPLETE_CARD_MS);
};

/**
 * True when the card covers the middle of the screen, where "Show me" puts the
 * target (the camera centres on it). On a phone the card is most of the
 * screen's width, so the target would land under it.
 */
export const guideCardCoversScreenCentre = (): boolean => {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const card = document.querySelector<HTMLElement>(`#${ROOT_ID} .tg-card:not([hidden])`);
  if (!card) return false;
  const rect = card.getBoundingClientRect();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
};

/**
 * Lifts the card above an open side panel (Manpower, Manifests) or one of
 * the new HUD's screens (it is shown on its Manifest and Diplomacy screens), so the step that sent the player there stays in view
 * while they do it. Called every frame; a class toggle is cheap.
 */
export const syncGuideCardLayer = (raised: boolean, overManpower = false, overUi = raised): void => {
  if (typeof document === "undefined") return;
  const root = document.getElementById(ROOT_ID);
  root?.classList.toggle(RAISED_CLASS, raised);
  root?.classList.toggle("tg-over-manpower", overManpower);
  root?.classList.toggle(OVER_UI_CLASS, overUi);
};

/** Re-renders the card (cheap; callers only call it when the view's signature changes). */
export const renderGuideCard = (view: StepView, expanded: boolean, handlers: GuideCardHandlers): void => {
  if (typeof document === "undefined") return;
  injectStyles();
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    // Shares the checklist bubble's class so HUD v2's rules for that corner
    // apply to it too: lifted above the bottom-left minimap
    // (client-hud-v2.css) and hidden behind full-screen v2 views
    // (client-hud-v2-screens.css). The id-scoped rules below still win otherwise.
    root.className = "onb-root";
    document.body.appendChild(root);
    root.addEventListener("click", (ev) => {
      const action = (ev.target as Element | null)?.closest("[data-guide-action]")?.getAttribute("data-guide-action");
      if (action === "show-me") handlers.onShowMe();
      else if (action === "skip") handlers.onSkip();
      else if (action === "finish") handlers.onFinish();
      else if (action === "hide") handlers.onHide();
      else if (action === "toggle") handlers.onToggle();
    });
  }
  root.style.setProperty("--tg-bottom", `${ONBOARDING_CORNER_BOTTOM_PX}px`);
  root.innerHTML = guideCardHtml(view, expanded);
};

const STYLE_ID = "tutorial-guide-card-styles";
const injectStyles = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
};

const styles = `
#${ROOT_ID} { position: fixed; left: 16px; bottom: var(--tg-bottom, 190px); z-index: 23; pointer-events: none; }
#${ROOT_ID} .tg-card, #${ROOT_ID} .tg-launcher { pointer-events: auto; }
/* Above the side panel (25, or 47 over a HUD v2 screen) and HUD v2 screens (44); below Settings (49) and info cards (71+). */
#${ROOT_ID}.${RAISED_CLASS} { z-index: 48; }
/* HUD v2 frame screens hide the corner bubble (.onb-root); the guide stays on the two its steps send the player into. */
body.hud-v2-screen-manifest #${ROOT_ID}, body.hud-v2-screen-diplomacy #${ROOT_ID} { display: block !important; }
body.hud-v2-compact #${ROOT_ID}.tg-over-manpower { display: block !important; }
#${ROOT_ID} [hidden] { display: none !important; }
/* The mirrored spot on the right edge, used while the usual one would cover the step's target or a notification (tutorial-guide-placement.ts). */
#${ROOT_ID}.tg-side-end { left: auto !important; right: 16px; }
body.hud-v2-compact #${ROOT_ID}.tg-side-end { right: calc(var(--v2c-safe-right, 0px) + 6px); }
/* Minimised, the guide is just its "?" launcher; over a panel or screen that sat on their Back buttons and headings (playtest day 1). The map brings it back. */
#${ROOT_ID}.${OVER_UI_CLASS} .tg-launcher { display: none !important; }
.tg-card {
  width: min(270px, calc(100vw - 32px)); padding: 10px 12px; border-radius: 12px;
  border: 1px solid rgba(126, 224, 138, 0.32); background: rgba(14, 10, 6, 0.94);
  box-shadow: 0 14px 36px rgba(0,0,0,0.42); color: #fbf3e6;
}
.tg-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.tg-chapter { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #a7f3b0; }
.tg-collapse { appearance: none; border: 0; background: transparent; color: rgba(240,224,200,0.7); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; }
.tg-title { font-size: 13.5px; font-weight: 800; line-height: 1.3; }
.tg-title-waiting { font-weight: 600; color: #d6ac6a; }
.tg-why { margin-top: 3px; font-size: 12px; line-height: 1.35; color: rgba(240,224,200,0.75); }
.tg-lookfor { margin-top: 6px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: rgba(240,224,200,0.75); }
.tg-lookfor-item { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: #fbf3e6; }
.tg-lookfor .resource-icon-img { width: 22px; height: 22px; object-fit: contain; }
.tg-later { margin-top: 5px; font-size: 11px; color: #d6ac6a; }
.tg-progress-row { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
.tg-progress { flex: 1; height: 4px; border-radius: 999px; background: rgba(126,224,138,0.15); overflow: hidden; }
.tg-count { font-size: 11px; font-weight: 700; color: #a7f3b0; font-variant-numeric: tabular-nums; }
.tg-check { color: #7ee08a; }
.tg-progress span { display: block; height: 100%; background: #7ee08a; }
.tg-actions { margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tg-btn { appearance: none; border-radius: 8px; border: 1px solid rgba(126,224,138,0.35); background: transparent; color: #eafff0; font-size: 12px; font-weight: 700; padding: 5px 10px; cursor: pointer; }
.tg-btn-primary { background: rgba(126,224,138,0.18); }
.tg-skip-guide { margin-left: auto; padding: 4px 8px; font-size: 11px; border-color: rgba(240,224,200,0.4); color: #fbf3e6; }
.tg-launcher {
  position: relative; width: 44px; height: 44px; padding: 0; border-radius: 50%; cursor: pointer;
  border: 1px solid rgba(126, 224, 138, 0.4); background: rgba(3, 7, 14, 0.85); color: #a7f3b0;
  font-size: 20px; font-weight: 800; display: grid; place-items: center; box-shadow: 0 12px 30px rgba(0,0,0,0.4);
}
.tg-badge {
  position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px;
  background: #d69644; color: #1c1305; font-size: 11px; font-weight: 800; display: grid; place-items: center;
}
@media (max-width: 520px) {
  #${ROOT_ID} { left: 10px; }
  #${ROOT_ID}.tg-side-end { right: 10px; }
  .tg-card { width: min(250px, calc(100vw - 20px)); }
  .tg-launcher { width: 40px; height: 40px; font-size: 18px; }
}`;
