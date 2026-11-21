// The scout drone's HUD at the bottom of the screen, one slot for three moments (docs/explore-scout-plan.md §13):
// - planning: the dock (client-scout-drone-dock.ts);
// - idle with every charge unused: the same pill offers the drone; tapping it opens a plan;
// - flying: a pill with the drone and the time until it is back; tapping it frames the drone;
// - landed: the report card, what the flight found as icons with counts (each tappable to frame its finds).
// While any of them is up, the body carries `scout-focus`, which tucks away the guide card and the House
// charges speech bubble (client-scout-drone-hud.css): first-time players found the landing report buried
// under both, and the drone lost behind them (player review 2026-11-21).
import { WORLD_HEIGHT, WORLD_WIDTH, scoutDronePositionAt, type ScoutFind } from "@border-empires/shared";
import { depositIconKey, resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import type { ClientState } from "../client-state/client-state.js";
import { isMapUnobstructed } from "../client-map-unobstructed/client-map-unobstructed.js";
import { renderScoutDroneDock, scoutClock, type ScoutDockDeps } from "./client-scout-drone-dock.js";
import { canPlanScoutFlight, scoutChargesMax, scoutChargesReady } from "./client-scout-drone-plan.js";
import { SCOUT_DRONE_ICON, SCOUT_FIND_ICONS, type ScoutFindKind } from "./client-scout-drone-icons.js";
import type { ScoutDroneLandingReport } from "./client-scout-drone-state.js";
import { SCOUT_FIND_LABEL as FIND_LABEL, pluralLabel as plural, scoutResourceLabel } from "./client-scout-drone-find-labels.js";
import { scoutFindPlaces } from "./client-scout-drone-finds.js";
import "./client-scout-drone-hud.css";

export type ScoutHudDeps = ScoutDockDeps & {
  /** Centres the camera on a tile (focusCameraOnTile); `select: false` leaves the selection alone. */
  readonly focus: (x: number, y: number, options?: { select?: boolean }) => void;
};

const PILL_ID = "scout-drone-pill";
const CARD_ID = "scout-report-card";
/** A report nobody dismissed gives way after this long, so it never sits on the HUD for good. */
export const SCOUT_REPORT_CARD_MS = 90_000;

type Chip = {
  kind: ScoutFindKind | "resource-icon";
  count: number;
  label: string;
  html?: string;
  tone?: "warn";
  /** The finds this chip stands for: tapping it frames them in turn (absent for the tiles count). */
  find?: { kind: ScoutFind["kind"]; resource?: string };
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The report's finds as chips: tiles explored, then the most valuable finds first, each resource on its own. */
export const scoutReportChips = (report: ScoutDroneLandingReport): Chip[] => {
  const chips: Chip[] = [];
  // Every flight uncovers map, so the card always has something to show, even on open sea (review 2026-11-21).
  if (report.explored) chips.push({ kind: "explored", count: report.explored, label: FIND_LABEL.explored });
  if (report.towns > 0) chips.push({ kind: "town", count: report.towns, label: plural(FIND_LABEL.town, report.towns), find: { kind: "town" } });
  if (report.docks > 0) chips.push({ kind: "dock", count: report.docks, label: plural(FIND_LABEL.dock, report.docks), find: { kind: "dock" } });
  if (report.waystations > 0) chips.push({ kind: "waystation", count: report.waystations, label: plural(FIND_LABEL.waystation, report.waystations), find: { kind: "waystation" } });
  if (report.watchtowers > 0) chips.push({ kind: "watchtower", count: report.watchtowers, label: plural(FIND_LABEL.watchtower, report.watchtowers), find: { kind: "watchtower" } });
  // Each resource sighted gets its own chip, named, so no count is a vague catch-all (review 2026-11-21);
  // a resource without its own icon shows the gem. Older servers send only a total.
  const sighted = report.resourcesSighted ?? [];
  for (const { resource, count } of sighted.slice(0, 4)) {
    const label = scoutResourceLabel(resource);
    const find = { kind: "resource" as const, resource };
    // Deposit names map to their icon (FARM -> the food icon): Grain showed the gem (review round 8).
    const iconKey = depositIconKey(resource);
    chips.push(iconKey ? { kind: "resource-icon", count, label, html: resourceIconHtml(iconKey), find } : { kind: "resource", count, label, find });
  }
  if (sighted.length === 0 && report.resourceTiles > 0) chips.push({ kind: "resource", count: report.resourceTiles, label: FIND_LABEL.resource });
  if (report.empiresSighted.length > 0) chips.push({ kind: "empire", count: report.empiresSighted.length, label: plural(FIND_LABEL.empire, report.empiresSighted.length), tone: "warn", find: { kind: "empire" } });
  if (report.planetaryDefenseTiles > 0) chips.push({ kind: "defense", count: report.planetaryDefenseTiles, label: FIND_LABEL.defense, tone: "warn", find: { kind: "defense" } });
  return chips;
};

/** True while the report card should be on screen: not while planning or with a drone back in the air. */
export const scoutReportCardVisible = (state: Pick<ClientState, "scoutDroneReport" | "scoutDronePicking" | "scoutDroneFlight">, nowMs: number): boolean => {
  const report = state.scoutDroneReport;
  if (!report || state.scoutDronePicking.active || nowMs - report.at >= SCOUT_REPORT_CARD_MS) return false;
  const flight = state.scoutDroneFlight;
  return !(flight && nowMs < flight.landsAt);
};

const chipHtml = (chip: Chip, i: number, framable: boolean): string => {
  const icon = chip.kind === "resource-icon" ? chip.html ?? "" : SCOUT_FIND_ICONS[chip.kind];
  const cls = `srs-chip${chip.tone ? ` is-${chip.tone}` : ""}${chip.kind === "explored" ? " is-explored" : ""}`;
  const inner = `<span class="srs-chip-row"><span class="srs-chip-icon">${icon}</span><b>${chip.kind === "explored" ? "+" : ""}${chip.count}</b></span><span class="srs-chip-label">${escapeHtml(chip.label)}</span>`;
  // A chip whose finds the flight reported (SCOUT_FINDS) is a button: tapping steps the camera through them
  // (player review 2026-11-21: "let me tap Fish 4 to see them").
  if (!chip.find || !framable) return `<span class="${cls}" style="--i:${i}">${inner}</span>`;
  const data = `data-find-kind="${chip.find.kind}"${chip.find.resource ? ` data-find-resource="${escapeHtml(chip.find.resource)}"` : ""}`;
  return `<button type="button" class="${cls} is-framable" style="--i:${i}" ${data} aria-label="Show ${escapeHtml(chip.label)} on the map">${inner}</button>`;
};

const reportCardHtml = (report: ScoutDroneLandingReport, nameOf: (id: string) => string, framable: (chip: Chip) => boolean): string => {
  const chips = scoutReportChips(report);
  const body = chips.length > 0 ? chips.map((chip, i) => chipHtml(chip, i, framable(chip))).join("") : `<span class="srs-empty">Nothing new</span>`;
  const turned = report.blockedBy ? `<span class="srs-turned">⟲ ${escapeHtml(nameOf(report.blockedBy))}</span>` : "";
  return `
    <div class="srs-card${chips.length > 0 ? " has-finds" : ""}" role="status">
      <span class="srs-drone" aria-hidden="true">${SCOUT_DRONE_ICON}</span>
      <div class="srs-finds">${body}${turned}</div>
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
  // Never while another map pick is armed: one armed pick at a time (client-scout-drone-picking.ts).
  !state.crystalTargeting.active &&
  !state.aetherWallTargeting.active &&
  !state.marchOriginPicking.active &&
  !state.musterMarchTargeting.active &&
  !state.buildingPlacement.active &&
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
        // Frames the drone without selecting the fog tile under it, whose sheet would cover the drone.
        if (at) live.deps.focus(Math.round(at.x), Math.round(at.y), { select: false });
        return;
      }
      live.state.scoutDronePicking = { ...live.state.scoutDronePicking, active: true, stops: [] };
      live.deps.rerender();
    };
  }
  const button = el.querySelector("button") as HTMLButtonElement;
  button.classList.toggle("is-ready", ready);
  el.classList.toggle("is-offer", ready);
  button.setAttribute("aria-label", ready ? `Explore: send the scout drone, ${scoutChargesReady(state, nowMs)} charges` : `Find the scout drone, back in ${scoutClock(flight!.landsAt - nowMs)}`);
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
    // Where a chip's finds are: the ones spotted mid-flight (SCOUT_FINDS), or, when none reached this client
    // (reload, dropped socket), the server's main find for the chip it belongs to (review 2026-11-21).
    const mainKind = scoutReportChips(report).find((chip) => chip.find)?.find;
    const placesFor = (live: ClientState, kind: ScoutFind["kind"], resource?: string): Array<{ x: number; y: number }> => {
      const spotted = scoutFindPlaces(live, kind, resource);
      if (spotted.length > 0) return spotted;
      return mainKind && mainKind.kind === kind && mainKind.resource === resource ? [{ x: report.focusX ?? report.targetX, y: report.focusY ?? report.targetY }] : [];
    };
    el.innerHTML = reportCardHtml(report, (id) => state.playerNames.get(id) ?? "another empire", (chip) => Boolean(chip.find && placesFor(state, chip.find.kind, chip.find.resource).length > 0));
    // Each framable chip steps the camera through its finds, one per tap, keeping the card open.
    el.querySelectorAll<HTMLButtonElement>(".srs-chip.is-framable").forEach((chip) => {
      chip.onclick = (event: MouseEvent) => {
        event.stopPropagation();
        const live = current;
        if (!live) return;
        const places = placesFor(live.state, chip.dataset.findKind as ScoutFind["kind"], chip.dataset.findResource);
        if (places.length === 0) return;
        const next = Number(chip.dataset.step ?? "0") % places.length;
        chip.dataset.step = String(next + 1);
        live.deps.focus(places[next]!.x, places[next]!.y, { select: false });
        // A gold ring stays on the find until the next tap or the card closes: the camera moved but players
        // could not tell which tile was the dock (review round 8).
        live.state.scoutFindFocus = { x: places[next]!.x, y: places[next]!.y };
      };
    });
    const close = (): void => {
      if (current?.state.scoutDroneReport?.at === report.at) current.state.scoutDroneReport = undefined;
      if (current) current.state.scoutFindFocus = undefined;
      current?.deps.rerender();
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
  // Planning, the flight and the report fold the guide to its "?" launcher and hide the House nudge. The code
  // review worried a long flight would hide a guide step; the players disagreed: with the guide open in flight
  // it covered the drone and the route for all three (round 6). The step stays one tap away on the launcher.
  // The offer leaves them be.
  document.body.classList.toggle("scout-focus", state.scoutDronePicking.active || (pill && !offering) || card);
  // On a phone the flight pill takes the search lens's corner (client-scout-drone-dock.css).
  document.body.classList.toggle("scout-flying", pill && !offering);
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
