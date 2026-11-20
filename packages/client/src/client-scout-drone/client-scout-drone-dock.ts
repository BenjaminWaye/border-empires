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

const dockHtml = (state: ClientState, nowMs: number): string => {
  const plan = state.scoutDronePicking;
  const pips = scoutDockPips(state, nowMs)
    .map((pip) => {
      const cls = `sd-pip is-${pip.kind}${pip.next ? " is-next" : ""}`;
      const style = pip.kind === "refilling" ? ` style="--p:${pip.progress!.toFixed(3)}"` : "";
      return `<span class="${cls}"${style}>${DRONE_SVG}</span>`;
    })
    .join("");
  const flying = state.scoutDroneFlight && state.scoutDroneFlight.landsAt > nowMs ? state.scoutDroneFlight : undefined;
  const preview = flying ? undefined : scoutPlanPreview(state, plan.stops, nowMs);
  const stops = preview?.route.stops.length ?? 0;
  const flightMs = preview?.flight ? preview.flight.landsAt - nowMs : 0;
  const noCharges = scoutChargesReady(state, nowMs) === 0 && plan.stops.length === 0;
  const refill = noCharges && state.scoutDroneCharges ? nextScoutChargeAt(state.scoutDroneCharges, nowMs) : undefined;
  const go = flying
    ? `<button class="sd-go is-flying" type="button" disabled>${DRONE_SVG}<span class="sd-time">${scoutClock(flying.landsAt - nowMs)}</span></button>`
    : refill !== undefined
      ? `<button class="sd-go is-empty" type="button" disabled><span class="sd-time">${scoutClock(refill - nowMs)}</span></button>`
      : `<button class="sd-go${stops > 0 ? " is-armed" : ""}" type="button" ${stops > 0 ? "" : "disabled"}>Go${stops > 0 ? `<span class="sd-time">${scoutClock(flightMs)}</span>` : ""}</button>`;
  const shake = nowMs - plan.shakeAt < 450 ? " is-shaking" : "";
  return `
    <div class="sd-bar${shake}">
      <button class="sd-icon sd-cancel" type="button" aria-label="Cancel">✕</button>
      <div class="sd-pips">${pips}</div>
      <button class="sd-icon sd-undo" type="button" aria-label="Undo" ${plan.stops.length > 0 ? "" : "disabled"}>↶</button>
      ${go}
    </div>`;
};

/** Shows the dock while a flight is planned, hides it otherwise. Call on every HUD render. */
export const renderScoutDroneDock = (state: ClientState, deps: ScoutDockDeps): void => {
  const now = deps.now ?? Date.now;
  if (!state.scoutDronePicking.active) {
    const el = document.getElementById(DOCK_ID);
    if (el) el.style.display = "none";
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    return;
  }
  const el = ensureDock();
  el.style.display = "flex";
  el.innerHTML = dockHtml(state, now());
  const on = (selector: string, handler: () => void): void => {
    const button = el.querySelector(selector) as HTMLButtonElement | null;
    if (button) button.onclick = (event) => {
      event.stopPropagation();
      handler();
      deps.rerender();
    };
  };
  on(".sd-cancel", () => cancelScoutPlan(state));
  on(".sd-undo", () => undoScoutPlanStop(state));
  on(".sd-go", () => {
    launchScoutPlan(state, { sendGameMessage: deps.send }, now());
  });
  // Times on the dock (flight time, refill clocks, drone back in) move every second.
  ticker ??= setInterval(() => {
    if (state.scoutDronePicking.active) renderScoutDroneDock(state, deps);
  }, 1000);
};
