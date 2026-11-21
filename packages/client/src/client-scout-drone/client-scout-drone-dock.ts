// The scout drone dock (docs/explore-scout-plan.md §13): a bar at the bottom of
// the screen while a flight is being planned (client-scout-drone-plan.ts).
// Almost no words: one drone pip per charge -- lit cyan once placed on the map
// as a stop, brass when ready, dim and filling like a clock while it refills --
// then Cancel (✕), Undo (↶) and Go with the flight time. The next pip pulses
// while a stop can still be added; Go pulses once there is a stop to fly to.
// The pips shake when a tap asks for a stop with no charge left.
import { nextScoutChargeAt, liveScoutChargeSpends } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { cancelScoutPlan, launchScoutPlan, scoutChargesMax, scoutChargesReady, scoutPlanCapacity, scoutPlanPreview, undoScoutPlanStop, type ScoutPlanState } from "./client-scout-drone-plan.js";
import "./client-scout-drone-dock.css";

export type ScoutDockDeps = {
  readonly send: (payload: unknown) => boolean;
  readonly rerender: () => void;
  readonly now?: () => number;
};

const DOCK_ID = "scout-drone-dock";
const DRONE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/><circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="18" r="2.6"/></g><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>`;

/** m:ss, or h:mm:ss past an hour. */
export const scoutClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

type PipState = { kind: "placed" | "ready" | "refilling"; next?: boolean; progress?: number };

/** Each pip's look, in order: placed stops, then ready charges, then refilling ones (soonest back first). */
export const scoutDockPips = (state: ScoutPlanState, nowMs: number): PipState[] => {
  const max = scoutChargesMax(state);
  const ready = scoutChargesReady(state, nowMs);
  const placed = Math.min(state.scoutDronePicking.stops.length, ready);
  const canAdd = placed < scoutPlanCapacity(state, nowMs);
  const refillMs = state.scoutDroneCharges?.refillMs ?? 1;
  const spends = state.scoutDroneCharges ? liveScoutChargeSpends(state.scoutDroneCharges.usedAt, nowMs, refillMs) : [];
  const pips: PipState[] = [];
  for (let i = 0; i < placed; i += 1) pips.push({ kind: "placed" });
  for (let i = placed; i < ready; i += 1) pips.push({ kind: "ready", next: canAdd && i === placed });
  for (let i = 0; pips.length < max; i += 1) pips.push({ kind: "refilling", progress: Math.min(1, Math.max(0, (nowMs - (spends[i] ?? nowMs)) / refillMs)) });
  return pips;
};

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

type DockView = { pips: string; shaking: boolean; undoEnabled: boolean; goClass: string; goEnabled: boolean; goHtml: string };

const dockView = (state: ClientState, nowMs: number): DockView => {
  const plan = state.scoutDronePicking;
  const pips = scoutDockPips(state, nowMs)
    .map((pip) => {
      const cls = `sd-pip is-${pip.kind}${pip.next ? " is-next" : ""}`;
      const style = pip.kind === "refilling" ? ` style="--p:${pip.progress!.toFixed(3)}"` : "";
      return `<span class="${cls}"${style}>${DRONE_SVG}</span>`;
    })
    .join("");
  const preview = scoutPlanPreview(state, plan.stops, nowMs);
  const stops = preview?.route.stops.length ?? 0;
  const flightMs = preview?.flight ? preview.flight.landsAt - nowMs : 0;
  const noCharges = scoutChargesReady(state, nowMs) === 0 && plan.stops.length === 0;
  const refill = noCharges && state.scoutDroneCharges ? nextScoutChargeAt(state.scoutDroneCharges, nowMs) : undefined;
  const base = { pips, shaking: nowMs - plan.shakeAt < 450, undoEnabled: plan.stops.length > 0 };
  if (refill !== undefined) return { ...base, goClass: "sd-go is-empty", goEnabled: false, goHtml: `<span class="sd-time">${scoutClock(refill - nowMs)}</span>` };
  return { ...base, goClass: `sd-go${stops > 0 ? " is-armed" : ""}`, goEnabled: stops > 0, goHtml: `Go${stops > 0 ? `<span class="sd-time">${scoutClock(flightMs)}</span>` : ""}` };
};

/**
 * Builds the bar once: its buttons must outlive the every-second refresh, or a press that spans a
 * refresh lands on a replaced element and the click never fires (review, 2026-11-21).
 */
const buildDock = (el: HTMLElement): void => {
  el.innerHTML = `
    <div class="sd-bar">
      <button class="sd-icon sd-cancel" type="button" aria-label="Cancel">✕</button>
      <div class="sd-pips"></div>
      <button class="sd-icon sd-undo" type="button" aria-label="Undo">↶</button>
      <button class="sd-go" type="button">Go</button>
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
  if (!el.querySelector(".sd-bar")) buildDock(el);
  el.style.display = "flex";
  const view = dockView(state, now());
  el.querySelector(".sd-bar")!.classList.toggle("is-shaking", view.shaking);
  setHtml(el.querySelector(".sd-pips")!, view.pips);
  (el.querySelector(".sd-undo") as HTMLButtonElement).disabled = !view.undoEnabled;
  const go = el.querySelector(".sd-go") as HTMLButtonElement;
  go.className = view.goClass;
  go.disabled = !view.goEnabled;
  setHtml(go, view.goHtml);
  // Times on the dock (flight time, refill clocks) move every second.
  ticker ??= setInterval(() => {
    if (current?.state.scoutDronePicking.active) renderScoutDroneDock(current.state, current.deps);
  }, 1000);
};
