// Relic site plates: a rival's running relic (aether wake) and a transponder
// in signal range get a named plate on the map, in the town-plate style, in
// place of the old light column and hollow square. A wake off screen keeps a
// tab on the screen edge pointing at it until the player first brings the site
// on screen (relic-site-reached.ts). The plates are DOM buttons over the
// canvas placed through the frame's projection, so one layer serves the 2D
// canvas and the true-3D renderer (isTrue3DRendererActive picks the anchor).
// A tap opens the site's card (Show, Send scout) and never reaches the map,
// where a tap on fog would start a scout flight plan instead.
import type { ClientState } from "../client-state/client-state.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { PHOTO_MODE_BODY_CLASS } from "../client-photo-mode/client-photo-mode.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { createSeparatedOwnerColor } from "../client-owner-colors/client-owner-color-separation.js";
import { handleScoutPlanTap, scoutPlanTapStarts } from "../client-scout-drone/client-scout-drone-plan.js";
import { RELIC_WAKE_FALLBACK_COLOR } from "./relic-map-hints.js";
import { edgeTabPoint, mapPointPickArmed, relicSitePlateFor, tilesFromCamera, wrappedDelta, type RelicSitePlate, type ScreenInsets } from "./relic-site-plate-model.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { markRelicSiteReached, relicSiteReached } from "./relic-site-reached.js";
import "./relic-site-plates.css";

interface Projection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }

export type RelicSiteActions = {
  readonly renderHud: () => void;
  readonly requestViewRefresh: () => void;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

/** Clear of the resource bar above and the Explore button and nav bar below (CSS px). */
const EDGE_INSETS: ScreenInsets = { top: 96, right: 12, bottom: 150, left: 12 };
const DIAMOND = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill="currentColor" fill-opacity=".28" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ARROW = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.5 8.5 5 2 8.5Z" fill="currentColor"/></svg>';

let openKey: string | undefined;

/** Opens the card for a relic site under a map tap (the tile itself, not the plate). True when there is one. */
export const openRelicSiteCardAt = (
  state: Pick<ClientState, "me" | "relicMapHints" | "tiles" | "scoutDronePicking" | "marchOriginPicking" | "musterMarchTargeting">,
  wx: number,
  wy: number
): boolean => {
  if (mapPointPickArmed(state)) return false;
  const key = `${wx},${wy}`;
  const plate = relicSitePlateFor(state.relicMapHints.get(key), state.tiles.get(key), state.me, () => undefined);
  if (!plate) return false;
  openKey = key;
  return true;
};

export const closeRelicSiteCard = (): void => { openKey = undefined; };

const plateHtml = (plate: RelicSitePlate, edge: boolean, distance: number): string =>
  `${edge ? `<span class="relic-plate-arrow">${ARROW}</span>` : ""}<span class="relic-plate-badge">${DIAMOND}</span>` +
  `<span class="relic-plate-body"><span class="relic-plate-title"></span><span class="relic-plate-detail"></span>` +
  `${edge ? `<span class="relic-plate-distance">${distance} tiles</span>` : ""}</span>`;

/** The plate layer and its card over the map canvas; `render` runs every frame with the frame's projection. */
export function createRelicSitePlates(canvas: HTMLCanvasElement, state: ClientState, actions: RelicSiteActions): {
  render: (projection: Projection, mapDrawn: boolean) => void;
  dispose: () => void;
} {
  const doc = canvas.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "relic-plate-layer";
  canvas.parentElement?.append(layer);
  const buttons = new Map<string, { el: HTMLButtonElement; html: string }>();
  const card = doc.createElement("div");
  card.className = "relic-card";
  card.hidden = true;
  card.onpointerdown = (event) => event.stopPropagation();
  layer.append(card);
  // A tap anywhere else on the map closes the card (a tap on a site's tile reopens it: openRelicSiteCardAt).
  const closeOnMapPress = (): void => { openKey = undefined; };
  canvas.addEventListener("pointerdown", closeOnMapPress);
  let cardFor = "";
  const ownerColor = createSeparatedOwnerColor((ownerId) => resolveOwnerColor(ownerId, state.playerColors, fallbackOwnerColor), () => state.me);
  const nameOf = (ownerId: string): string | undefined => playerDisplayNameForOwnerFromState(state, ownerId);

  const centerOn = (x: number, y: number): void => {
    state.camX = actions.wrapX(x); state.camY = actions.wrapY(y);
    state.camSubX = 0; state.camSubY = 0;
    // No selection: on unexplored ground it only drew an empty selection frame under the plate.
    actions.requestViewRefresh();
  };

  const renderCard = (plate: RelicSitePlate, anchor: HTMLElement, bounds: DOMRect): void => {
    const canScout = !state.scoutDronePicking.active && scoutPlanTapStarts(state, plate.x, plate.y);
    const signature = `${plate.key}|${plate.detail}|${canScout}`;
    if (cardFor !== signature) {
      cardFor = signature;
      card.innerHTML =
        `<div class="relic-card-head"><span class="relic-plate-badge">${DIAMOND}</span><div><div class="relic-card-title"></div><div class="relic-card-detail"></div></div></div>` +
        `<div class="relic-card-where">(${plate.x}, ${plate.y})</div>` +
        `<div class="relic-card-actions"><button type="button" data-relic-show>Show</button>${canScout ? "<button type=\"button\" data-relic-scout>Send scout</button>" : ""}</div>`;
      (card.querySelector(".relic-card-title") as HTMLElement).textContent = plate.title;
      (card.querySelector(".relic-card-detail") as HTMLElement).textContent = plate.detail;
      (card.querySelector("[data-relic-show]") as HTMLButtonElement).onclick = (event) => {
        event.stopPropagation(); openKey = undefined; centerOn(plate.x, plate.y); actions.renderHud();
      };
      const scout = card.querySelector("[data-relic-scout]") as HTMLButtonElement | null;
      if (scout) scout.onclick = (event) => {
        event.stopPropagation(); openKey = undefined;
        handleScoutPlanTap(state, plate.x, plate.y, Date.now());
        actions.renderHud();
      };
    }
    card.style.setProperty("--relic-owner", plate.ownerId ? ownerColor(plate.ownerId) : RELIC_WAKE_FALLBACK_COLOR);
    // Centred above the plate (below it near the top), kept on screen.
    const at = anchor.getBoundingClientRect();
    const plateX = at.left - bounds.left + at.width / 2, plateTop = at.top - bounds.top, plateBottom = at.bottom - bounds.top;
    const w = card.offsetWidth || 220, h = card.offsetHeight || 120;
    const x = Math.min(bounds.width - w - 8, Math.max(8, plateX - w / 2));
    const y = plateTop - h - 8 < 8 ? Math.min(bounds.height - h - 8, plateBottom + 8) : plateTop - h - 8;
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    card.hidden = false;
  };

  return {
    render(projection, mapDrawn) {
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const live = mapDrawn && state.authSessionReady && !state.profileSetupRequired && !doc.body.classList.contains(PHOTO_MODE_BODY_CLASS);
      const shown = new Set<string>();
      let cardShown = false;
      // Picking a map point: plates let taps through to the map and no card is open.
      const passive = mapPointPickArmed(state);
      if (passive) openKey = undefined;
      for (const hint of live ? state.relicMapHints.values() : []) {
        const plate = relicSitePlateFor(hint, state.tiles.get(`${hint.x},${hint.y}`), state.me, nameOf);
        if (!plate) continue;
        const at = projection.project(plate.x, plate.y);
        const lift = three ? 8 : projection.size * 0.3;
        let left = at.sx * scaleX, top = (at.sy - lift) * scaleY;
        const onScreen = Number.isFinite(left) && Number.isFinite(top) && left >= 0 && top >= 0 && left <= bounds.width && top <= bounds.height;
        let edge: ReturnType<typeof edgeTabPoint>;
        if (!onScreen) {
          // Only a rival's running relic is worth a tab; the direction comes from the world, which both renderers keep north-up.
          if (plate.kind !== "WAKE" || !plate.ownerId || relicSiteReached(plate.ownerId, plate.key)) continue;
          const dx = wrappedDelta(state.camX, plate.x, WORLD_WIDTH), dy = wrappedDelta(state.camY, plate.y, WORLD_HEIGHT);
          const len = Math.max(1e-6, Math.hypot(dx, dy));
          edge = edgeTabPoint(bounds.width / 2 + (dx / len) * 1e5, bounds.height / 2 + (dy / len) * 1e5, bounds.width, bounds.height, EDGE_INSETS);
          if (!edge) continue;
          left = edge.x; top = edge.y;
        } else if (plate.kind === "WAKE" && plate.ownerId) markRelicSiteReached(plate.ownerId, plate.key);
        shown.add(plate.key);
        let entry = buttons.get(plate.key);
        if (!entry) {
          const el = doc.createElement("button");
          el.type = "button";
          // The tap is the plate's: the fog tile under it does not start a scout plan.
          el.onpointerdown = (event) => event.stopPropagation();
          layer.append(el);
          entry = { el, html: "" };
          buttons.set(plate.key, entry);
        }
        const { el } = entry;
        el.onclick = (event) => { event.stopPropagation(); if (mapPointPickArmed(state)) return; openKey = openKey === plate.key ? undefined : plate.key; };
        const html = plateHtml(plate, Boolean(edge), edge ? tilesFromCamera(state.camX, state.camY, plate.x, plate.y) : 0);
        if (entry.html !== html) {
          el.innerHTML = html; entry.html = html;
          (el.querySelector(".relic-plate-title") as HTMLElement).textContent = plate.title;
          (el.querySelector(".relic-plate-detail") as HTMLElement).textContent = plate.detail;
        } else {
          const detail = el.querySelector(".relic-plate-detail") as HTMLElement;
          if (detail.textContent !== plate.detail) detail.textContent = plate.detail;
        }
        const className = `relic-plate is-${plate.kind === "WAKE" ? "wake" : "signal"}${edge ? ` is-edge${edge.x >= bounds.width / 2 ? " is-edge-right" : ""}` : ""}${openKey === plate.key ? " is-open" : ""}${passive ? " is-passive" : ""}`;
        if (el.className !== className) el.className = className;
        const label = `${plate.title}, ${plate.detail}, at ${plate.x}, ${plate.y}`;
        if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
        el.style.setProperty("--relic-owner", plate.ownerId ? ownerColor(plate.ownerId) : "#d3e7be");
        if (edge) el.style.setProperty("--relic-arrow-angle", `${edge.angle}rad`);
        const transform = edge ? `translate3d(${left}px, ${top}px, 0) translate(${edge.x < bounds.width / 2 ? "0" : "-100%"}, -50%)` : `translate3d(${left}px, ${top}px, 0) translate(-50%, -100%)`;
        if (el.style.transform !== transform) el.style.transform = transform;
        if (openKey === plate.key) { renderCard(plate, el, bounds); cardShown = true; }
      }
      for (const [key, entry] of buttons) if (!shown.has(key)) { entry.el.remove(); buttons.delete(key); }
      if (!cardShown) { card.hidden = true; if (openKey && !shown.has(openKey)) openKey = undefined; }
    },
    dispose() { canvas.removeEventListener("pointerdown", closeOnMapPress); buttons.clear(); layer.remove(); }
  };
}
