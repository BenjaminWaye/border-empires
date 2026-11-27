// The scout drone dock (docs/explore-scout-plan.md §13): a small bar at the bottom of
// the screen while a flight is being planned (client-scout-drone-plan.ts). No words:
// Cancel (✕), a drone with the number of charges still free to place, Undo (↶),
// and Go (Add while the drone is out) with the flight time, or the refill clock when no charge is ready. The
// count pulses until the first stop is placed and shakes when a tap finds no charge.
// It must fit a 375px phone (owner, 2026-11-21: eight pips overflowed it).
import { nextScoutChargeAt } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { cancelScoutPlan, flyingScoutDrone, launchScoutPlan, scoutChargesMax, scoutChargesReady, scoutPlanBlocked, scoutPlanPreview, undoScoutPlanStop, type ScoutPlanState } from "./client-scout-drone-plan.js";
import { SCOUT_DRONE_ICON } from "./client-scout-drone-icons.js";
import { scoutPlanNote } from "./client-scout-drone-plan-note.js";
import "./client-scout-drone-dock.css";
import { activeFullscreenCard } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";

export type ScoutDockDeps = {
  readonly send: (payload: unknown) => boolean;
  readonly rerender: () => void;
  readonly now?: () => number;
};

const DOCK_ID = "scout-drone-dock";
const DRONE_SVG = SCOUT_DRONE_ICON;

/**
 * A time with units, as short as the phone dock allows: "48s", "3m 27s", then whole minutes from ten
 * minutes ("12m"), then "1h 05m". The first dock showed "1:48", which read as hours or minutes
 * (player review 2026-11-21).
 */
export const scoutClock = (ms: number): string => {
  const total = Math.max(1, Math.ceil(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 10) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  // Whole minutes round up, so 59m 30s reads "1h 00m", never "60m" (review 2026-11-21).
  const wholeMinutes = Math.ceil(total / 60);
  if (wholeMinutes < 60) return `${wholeMinutes}m`;
  return `${Math.floor(wholeMinutes / 60)}h ${String(wholeMinutes % 60).padStart(2, "0")}m`;
};

/** Charges still free to place as stops: the one number the dock shows. */
export const scoutDockChargesLeft = (state: ScoutPlanState, nowMs: number): number =>
  Math.max(0, scoutChargesReady(state, nowMs) - state.scoutDronePicking.stops.length);

const ensureDock = (): HTMLElement => {
  let el = document.getElementById(DOCK_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = DOCK_ID;
    document.body.appendChild(el);
  }
  return el;
};

let ticker: ReturnType<typeof setInterval> | undefined;
// The latest state and deps, read by the buttons' handlers (bound once, when the dock is built).
let current: { state: ClientState; deps: ScoutDockDeps } | undefined;

type DockView = { note: string; count: string; countClass: string; shaking: boolean; undoEnabled: boolean; goClass: string; goEnabled: boolean; goHtml: string };

const dockView = (state: ClientState, nowMs: number): DockView => {
  const plan = state.scoutDronePicking;
  const left = scoutDockChargesLeft(state, nowMs);
  const countClass = `sd-count${left === 0 ? " is-empty" : ""}${plan.stops.length === 0 && left > 0 ? " is-next" : ""}`;
  const preview = scoutPlanPreview(state, plan.stops, nowMs);
  const stops = preview?.route.stops.length ?? 0;
  const flightMs = preview?.flight ? preview.flight.landsAt - nowMs : 0;
  const noCharges = scoutChargesReady(state, nowMs) === 0 && plan.stops.length === 0;
  const refill = noCharges && state.scoutDroneCharges ? nextScoutChargeAt(state.scoutDroneCharges, nowMs) : undefined;
  // Why the route is not what was tapped: a border or the range limit (Playtest Run 5: a bare "Blocked").
  const note = scoutPlanNote(preview, plan.stops, (id) => state.playerNames.get(id)) ?? "";
  const base = { note, count: `${DRONE_SVG}<b>${left}</b><small>/${scoutChargesMax(state)}</small>`, countClass, shaking: nowMs - plan.shakeAt < 450, undoEnabled: plan.stops.length > 0 };
  if (refill !== undefined) return { ...base, goClass: "sd-go is-empty", goEnabled: false, goHtml: `<span class="sd-time">${scoutClock(refill - nowMs)}</span>` };
  // A seen rival border right past home: the drone would turn back having found nothing (Playtest Run 5).
  if (stops > 0 && scoutPlanBlocked(preview)) return { ...base, goClass: "sd-go is-empty", goEnabled: false, goHtml: `<span class="sd-go-word">Blocked</span>` };
  // With the drone already out the stops join its route, so the button says Add, not Go (player review 2026-11-21).
  // An empty plan says what to do: the one place the dock spends words (player review 2026-11-21).
  const word = stops === 0 ? "Tap fog" : flyingScoutDrone(state, nowMs) ? "Add" : "Go";
  return { ...base, goClass: `sd-go${stops > 0 ? " is-armed" : " is-prompt"}`, goEnabled: stops > 0, goHtml: `<span class="sd-go-word">${word}</span>${stops > 0 ? `<span class="sd-time">${scoutClock(flightMs)}</span>` : ""}` };
};

/**
 * Builds the bar once: its buttons must outlive the every-second refresh, or a press that spans a
 * refresh lands on a replaced element and the click never fires (review, 2026-11-21).
 */
const buildDock = (el: HTMLElement): void => {
  el.innerHTML = `
    <div class="sd-note" role="status" aria-live="polite"></div>
    <div class="sd-bar">
      <button class="sd-icon sd-cancel" type="button" aria-label="Cancel">✕</button>
      <span class="sd-count" role="img" aria-label="Scout charges left"></span>
      <button class="sd-icon sd-undo" type="button" aria-label="Undo">↶</button>
      <button class="sd-go" type="button" aria-label="Go"><span class="sd-go-word">Go</span></button>
    </div>`;
  const on = (selector: string, handler: (state: ClientState, deps: ScoutDockDeps) => void): void => {
    const button = el.querySelector(selector) as HTMLButtonElement;
    button.onclick = (event) => {
      event.stopPropagation();
      if (!current) return;
      handler(current.state, current.deps);
      current.deps.rerender();
    };
  };
  on(".sd-cancel", (state) => cancelScoutPlan(state));
  on(".sd-undo", (state) => undoScoutPlanStop(state));
  on(".sd-go", (state, deps) => {
    launchScoutPlan(state, { sendGameMessage: deps.send }, (deps.now ?? Date.now)());
  });
};

const setHtml = (el: Element, html: string): void => {
  if (el.innerHTML !== html) el.innerHTML = html;
};

/** Shows the dock while a flight is planned, hides it otherwise. Call on every HUD render. */
export const renderScoutDroneDock = (state: ClientState, deps: ScoutDockDeps): void => {
  const now = deps.now ?? Date.now;
  current = { state, deps };
  if (!state.scoutDronePicking.active) {
    const el = document.getElementById(DOCK_ID);
    if (el) el.style.display = "none";
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    return;
  }
  const el = ensureDock();
  // Times on the dock (flight time, refill clocks) move every second.
  ticker ??= setInterval(() => {
    if (current?.state.scoutDronePicking.active) renderScoutDroneDock(current.state, current.deps);
  }, 1000);
  // Under a full-screen card (Town captured...) the dock steps aside like the flight pill, keeping the plan; its
  // ticker brings it back once the card closes (review of PR #2931: it covered the card's buttons).
  if (activeFullscreenCard() !== undefined) {
    el.style.display = "none";
    return;
  }
  if (!el.querySelector(".sd-bar")) buildDock(el);
  el.style.display = "flex";
  const view = dockView(state, now());
  const note = el.querySelector(".sd-note") as HTMLElement;
  if (note.textContent !== view.note) note.textContent = view.note;
  note.style.display = view.note ? "" : "none";
  el.querySelector(".sd-bar")!.classList.toggle("is-shaking", view.shaking);
  const count = el.querySelector(".sd-count")!;
  count.className = view.countClass;
  setHtml(count, view.count);
  (el.querySelector(".sd-undo") as HTMLButtonElement).disabled = !view.undoEnabled;
  const go = el.querySelector(".sd-go") as HTMLButtonElement;
  go.className = view.goClass;
  go.disabled = !view.goEnabled;
  setHtml(go, view.goHtml);
};
