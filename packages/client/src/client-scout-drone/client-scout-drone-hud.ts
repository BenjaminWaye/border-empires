// The scout drone's HUD at the bottom of the screen, one slot for three moments (docs/explore-scout-plan.md §13):
// - planning: the dock (client-scout-drone-dock.ts);
// - idle with every charge unused: the same pill offers the drone; tapping it opens a plan;
// - flying: a pill with the drone and the time until it is back; tapping it frames the drone;
// - landed: the report card, what the flight found as icons with counts, on top of every other popup.
// While any of them is up, the body carries `scout-focus`, which tucks away the guide card and the House
// charges speech bubble (client-scout-drone-hud.css): first-time players found the landing report buried
// under both, and the drone lost behind them (player review 2026-11-21).
import { WORLD_HEIGHT, WORLD_WIDTH, scoutDronePositionAt } from "@border-empires/shared";
import { resourceLabel } from "../client-map-display.js";
import { isResourceIconKey, resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import type { ClientState } from "../client-state/client-state.js";
import { isMapUnobstructed } from "../client-map-unobstructed/client-map-unobstructed.js";
import { renderScoutDroneDock, scoutClock, type ScoutDockDeps } from "./client-scout-drone-dock.js";
import { canPlanScoutFlight, scoutChargesMax, scoutChargesReady } from "./client-scout-drone-plan.js";
import { SCOUT_DRONE_ICON, SCOUT_FIND_ICONS, type ScoutFindKind } from "./client-scout-drone-icons.js";
import type { ScoutDroneLandingReport } from "./client-scout-drone-state.js";
import "./client-scout-drone-hud.css";

export type ScoutHudDeps = ScoutDockDeps & {
  /** Centres the camera on a tile (focusCameraOnTile). */
  readonly focus: (x: number, y: number) => void;
};

const PILL_ID = "scout-drone-pill";
const CARD_ID = "scout-report-card";
/** A report nobody dismissed gives way after this long, so it never sits on the HUD for good. */
export const SCOUT_REPORT_CARD_MS = 90_000;

type Chip = { kind: ScoutFindKind | "resource-icon"; count: number; label: string; html?: string; tone?: "warn" };

/** One word under each report icon: players could not tell a waystation pillar or a gem from the icon alone (review 2026-11-21). */
const FIND_LABEL: Record<ScoutFindKind, string> = {
  explored: "Tiles",
  town: "Town",
  dock: "Dock",
  waystation: "Waystation",
  watchtower: "Tower",
  resource: "Resources",
  empire: "Empire",
  defense: "Defense"
};

/** "FISH" -> "Fish", "Luxury Biota" stays. */
const titleCase = (text: string): string => text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The report's finds as chips, most valuable first. Resources show their own icons, up to three. */
export const scoutReportChips = (report: ScoutDroneLandingReport): Chip[] => {
  const chips: Chip[] = [];
  // Every flight uncovers map, so the card always has something to show, even on open sea (review 2026-11-21).
  if (report.explored) chips.push({ kind: "explored", count: report.explored, label: FIND_LABEL.explored });
  if (report.towns > 0) chips.push({ kind: "town", count: report.towns, label: FIND_LABEL.town });
  if (report.docks > 0) chips.push({ kind: "dock", count: report.docks, label: FIND_LABEL.dock });
  if (report.waystations > 0) chips.push({ kind: "waystation", count: report.waystations, label: FIND_LABEL.waystation });
  if (report.watchtowers > 0) chips.push({ kind: "watchtower", count: report.watchtowers, label: FIND_LABEL.watchtower });
  // Resources with their own icon get a chip each (up to three); the rest share one gem chip, since
  // a resource with no icon fell back to a bare dot.
  const sighted = report.resourcesSighted ?? [];
  const iconed = sighted.filter(({ resource }) => isResourceIconKey(resource)).slice(0, 3);
  for (const { resource, count } of iconed) chips.push({ kind: "resource-icon", count, label: titleCase(resourceLabel(resource)), html: resourceIconHtml(resource) });
  const shownTiles = iconed.reduce((sum, { count }) => sum + count, 0);
  const otherTiles = sighted.length > 0 ? sighted.reduce((sum, { count }) => sum + count, 0) - shownTiles : report.resourceTiles;
  if (otherTiles > 0) chips.push({ kind: "resource", count: otherTiles, label: FIND_LABEL.resource });
  if (report.empiresSighted.length > 0) chips.push({ kind: "empire", count: report.empiresSighted.length, label: FIND_LABEL.empire, tone: "warn" });
  if (report.planetaryDefenseTiles > 0) chips.push({ kind: "defense", count: report.planetaryDefenseTiles, label: FIND_LABEL.defense, tone: "warn" });
  return chips;
};

/** True while the report card should be on screen: not while planning or with a drone back in the air. */
export const scoutReportCardVisible = (state: Pick<ClientState, "scoutDroneReport" | "scoutDronePicking" | "scoutDroneFlight">, nowMs: number): boolean => {
  const report = state.scoutDroneReport;
  if (!report || state.scoutDronePicking.active || nowMs - report.at >= SCOUT_REPORT_CARD_MS) return false;
  const flight = state.scoutDroneFlight;
  return !(flight && nowMs < flight.landsAt);
};

const chipHtml = (chip: Chip, i: number): string => {
  const icon = chip.kind === "resource-icon" ? chip.html ?? "" : SCOUT_FIND_ICONS[chip.kind];
  return `<span class="srs-chip${chip.tone ? ` is-${chip.tone}` : ""}${chip.kind === "explored" ? " is-explored" : ""}" style="--i:${i}"><span class="srs-chip-row"><span class="srs-chip-icon">${icon}</span><b>${chip.kind === "explored" ? "+" : ""}${chip.count}</b></span><span class="srs-chip-label">${escapeHtml(chip.label)}</span></span>`;
};

const reportCardHtml = (report: ScoutDroneLandingReport, nameOf: (id: string) => string): string => {
  const chips = scoutReportChips(report);
  // Show frames the server's main find, the first find chip (the explored count is not a place).
  const main = chips.find((chip) => chip.kind !== "explored");
  const body = chips.length > 0 ? chips.map(chipHtml).join("") : `<span class="srs-empty">Nothing new</span>`;
  const turned = report.blockedBy ? `<span class="srs-turned">⟲ ${escapeHtml(nameOf(report.blockedBy))}</span>` : "";
  return `
    <div class="srs-card${chips.length > 0 ? " has-finds" : ""}" role="status">
      <span class="srs-drone" aria-hidden="true">${SCOUT_DRONE_ICON}</span>
      <div class="srs-finds">${body}${turned}</div>
      ${main ? `<button type="button" class="srs-show" aria-label="Show on map"><span class="srs-show-icon" aria-hidden="true">${main.kind === "resource-icon" ? main.html ?? "" : SCOUT_FIND_ICONS[main.kind]}</span>Show</button>` : ""}
      <button type="button" class="srs-close" aria-label="Close">✕</button>
    </div>`;
};

/** The "+N Tiles" figure counts up when the card opens: you watch the haul arrive (player review 2026-11-21). */
const countUp = (el: HTMLElement | null, target: number): void => {
  if (!el || target <= 0 || typeof requestAnimationFrame === "undefined") return;
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start - 250) / 900);
    if (!el.isConnected) return;
    el.textContent = `+${Math.round(target * (t <= 0 ? 0 : 1 - (1 - t) ** 3))}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const ensure = (id: string): HTMLElement => {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
};

const hide = (id: string): void => {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
};

let ticker: ReturnType<typeof setInterval> | undefined;
let current: { state: ClientState; deps: ScoutHudDeps } | undefined;

/**
 * "Drone ready": while every charge is unused and nothing else holds the slot, the pill offers the drone,
 * and tapping it opens a plan, so a player who never thought to tap the fog sees there is a drone to send
 * (player review 2026-11-21; the owner had the "tap here" marker on the map removed).
 */
export const scoutDroneReadyToOffer = (state: ClientState, nowMs: number): boolean =>
  !state.scoutDronePicking.active &&
  !(state.scoutDroneFlight && nowMs < state.scoutDroneFlight.landsAt) &&
  canPlanScoutFlight(state) &&
  scoutChargesReady(state, nowMs) >= scoutChargesMax(state);

const renderPill = (state: ClientState, deps: ScoutHudDeps, nowMs: number, cardUp: boolean): boolean => {
  const flight = state.scoutDroneFlight;
  const flying = Boolean(flight && nowMs < flight.landsAt && !state.scoutDronePicking.active);
  const ready = !flying && !cardUp && scoutDroneReadyToOffer(state, nowMs);
  if (!flying && !ready) {
    hide(PILL_ID);
    return false;
  }
  const el = ensure(PILL_ID);
  if (!el.querySelector("button")) {
    el.innerHTML = `<button type="button" class="sdp-pill"><span class="sdp-drone" aria-hidden="true">${SCOUT_DRONE_ICON}</span><span class="sdp-word">Explore</span><span class="sdp-time"></span></button>`;
    (el.querySelector("button") as HTMLButtonElement).onclick = (event) => {
      event.stopPropagation();
      const live = current;
      if (!live) return;
      const now = (live.deps.now ?? Date.now)();
      const air = live.state.scoutDroneFlight;
      if (air && now < air.landsAt) {
        const at = scoutDronePositionAt(air, now, WORLD_WIDTH, WORLD_HEIGHT);
        if (at) live.deps.focus(Math.round(at.x), Math.round(at.y));
        return;
      }
      live.state.scoutDronePicking = { ...live.state.scoutDronePicking, active: true, stops: [] };
      live.deps.rerender();
    };
  }
  const button = el.querySelector("button") as HTMLButtonElement;
  button.classList.toggle("is-ready", ready);
  el.classList.toggle("is-offer", ready);
  button.setAttribute("aria-label", ready ? "Send the scout drone" : "Find the scout drone");
  el.style.display = "flex";
  const time = el.querySelector(".sdp-time")!;
  const text = ready ? String(scoutChargesReady(state, nowMs)) : scoutClock(flight!.landsAt - nowMs);
  if (time.textContent !== text) time.textContent = text;
  return true;
};

const renderCard = (state: ClientState, deps: ScoutHudDeps, nowMs: number): boolean => {
  const report = state.scoutDroneReport;
  if (!report || !scoutReportCardVisible(state, nowMs)) {
    hide(CARD_ID);
    return false;
  }
  const el = ensure(CARD_ID);
  const key = String(report.at);
  if (el.dataset.reportAt !== key) {
    el.dataset.reportAt = key;
    el.innerHTML = reportCardHtml(report, (id) => state.playerNames.get(id) ?? "another empire");
    const close = (): void => {
      if (current?.state.scoutDroneReport?.at === report.at) current.state.scoutDroneReport = undefined;
      current?.deps.rerender();
    };
    const show = el.querySelector(".srs-show") as HTMLButtonElement | null;
    if (show) show.onclick = (event) => {
      event.stopPropagation();
      current?.deps.focus(report.focusX ?? report.targetX, report.focusY ?? report.targetY);
      close();
    };
    (el.querySelector(".srs-close") as HTMLButtonElement).onclick = (event) => {
      event.stopPropagation();
      close();
    };
    countUp(el.querySelector<HTMLElement>(".srs-chip.is-explored b"), report.explored ?? 0);
  }
  el.style.display = "flex";
  return true;
};

/** Draws the dock, the flight pill or the report card. Call on every HUD render. */
export const renderScoutDroneHud = (state: ClientState, deps: ScoutHudDeps): void => {
  current = { state, deps };
  const nowMs = (deps.now ?? Date.now)();
  renderScoutDroneDock(state, deps);
  // Only over the map itself: a flight replayed on reconnect drew the pill over the loading screen.
  const mapUp = isMapUnobstructed(state);
  const card = mapUp ? renderCard(state, deps, nowMs) : (hide(CARD_ID), false);
  const pill = mapUp ? renderPill(state, deps, nowMs, card) : (hide(PILL_ID), false);
  const offering = pill && scoutDroneReadyToOffer(state, nowMs);
  // The "drone ready" offer sits above the search lens and leaves the guide and House popups be.
  document.body.classList.toggle("scout-focus", state.scoutDronePicking.active || (pill && !offering) || card);
  // The pill's clock moves every second, and the card times out; the dock keeps its own ticker.
  if ((pill || card) && !ticker) {
    ticker = setInterval(() => {
      if (current) renderScoutDroneHud(current.state, current.deps);
    }, 1000);
  } else if (!pill && !card && ticker) {
    clearInterval(ticker);
    ticker = undefined;
  }
};
