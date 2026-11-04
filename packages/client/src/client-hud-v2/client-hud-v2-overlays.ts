// Map lenses, Civ-style: a round button notched into the top edge of the
// minimap opens a short list of views (Terrain, Diplomacy). The button shows the
// lens that is on. There is no legend: the colours speak for themselves, and a
// tile's owner carries a stance tag in the tile panel (client-hud-v2-stance-tag.ts).
// The host lives inside #mini-map-wrap so it moves with the minimap.
//
// On a phone (compact layout) the minimap is folded away behind that same round button: tapping it opens the
// map overview, the minimap full screen with the lenses under it. Tapping a place on the map centres the view
// there and closes the overview; ✕, Esc and the back gesture close it too.

import type { HudV2Deps } from "./client-hud-v2-context.js";

export type MapLens = "terrain" | "diplomacy";

const LENSES: ReadonlyArray<{ id: MapLens; label: string }> = [
  { id: "terrain", label: "Terrain" },
  { id: "diplomacy", label: "Diplomacy" }
];

export const OVERLAYS_HOST_ID = "hud-v2-overlays";

/** Whether the lens list is unfolded; it closes on a pick, a second click, Esc, a click elsewhere or leaving the HUD. */
export const lensMenu = { open: false };

/** Phone only: the full-screen minimap with the lenses (body.v2c-map-overview). */
export const mapOverview = { open: false };
export const MAP_OVERVIEW_CLASS = "v2c-map-overview";

/** The overview's canvas resolution: its on-screen size at the screen's pixel density, kept between 220 and 960 px. */
export const overviewCanvasPx = (cssPx: number, devicePixelRatio: number): number =>
  Math.max(MINIMAP_BASE_PX, Math.min(OVERVIEW_MAX_PX, Math.round(cssPx * Math.max(1, devicePixelRatio))));
const MINIMAP_BASE_PX = 220;
const OVERVIEW_MAX_PX = 960;

/**
 * The minimap canvas is 220px, fine in a corner but blurry stretched full screen. While the overview is open it
 * renders at screen resolution (the minimap redraws on a size change, client-minimap.ts); closing puts it back.
 */
/**
 * Sizes the open overview's canvas from its layout size (clientWidth: unaffected by the opening animation's scale,
 * and without the frame's border). Exported for tests.
 */
export const fitOverviewCanvas = (canvas: HTMLCanvasElement, devicePixelRatio: number): void => {
  const cssPx = Math.min(canvas.clientWidth, canvas.clientHeight);
  if (cssPx <= 0) return;
  const px = overviewCanvasPx(cssPx, devicePixelRatio);
  if (canvas.width !== px) canvas.width = canvas.height = px;
};

let refitOnResize: (() => void) | undefined;

const sizeMinimapCanvas = (open: boolean): void => {
  const canvas = typeof document === "undefined" ? null : document.getElementById("mini-map");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  if (refitOnResize) {
    window.removeEventListener("resize", refitOnResize);
    refitOnResize = undefined;
  }
  if (!open) {
    if (canvas.width !== MINIMAP_BASE_PX) canvas.width = canvas.height = MINIMAP_BASE_PX;
    return;
  }
  const fit = (): void => {
    if (mapOverview.open) fitOverviewCanvas(canvas, window.devicePixelRatio || 1);
  };
  // After the overview class has laid the canvas out; again whenever the screen resizes or rotates while open.
  requestAnimationFrame(fit);
  refitOnResize = fit;
  window.addEventListener("resize", fit);
};

export const setMapOverview = (open: boolean, body: HTMLElement | undefined = typeof document === "undefined" ? undefined : document.body): void => {
  const changed = mapOverview.open !== open;
  mapOverview.open = open;
  lensMenu.open = false;
  body?.classList.toggle(MAP_OVERVIEW_CLASS, open);
  if (changed) sizeMinimapCanvas(open);
};

const lensIcon = (src: string): string => `<img class="hud-v2-lens-icon" src="${src}" alt="" aria-hidden="true" draggable="false">`;

export const activeLens = (diplomacyOn: boolean): MapLens => (diplomacyOn ? "diplomacy" : "terrain");

/** The overview's header and lens row; the minimap canvas itself sits between them (CSS order). */
const mapOverviewHtml = (active: MapLens): string => {
  const items = LENSES.map((l) => `<button type="button" role="radio" class="hud-v2-lens-item${l.id === active ? " hud-v2-lens-item-on" : ""}" data-hud-v2-lens="${l.id}" aria-checked="${l.id === active}">${lensIcon(`/icons/simple/lens-${l.id}.svg`)}${l.label}</button>`).join("");
  return `<div class="v2c-map-head"><div><h2 class="v2c-map-title">Map</h2><p class="v2c-map-hint">Tap a place to go there</p><span class="v2c-map-key">your view</span></div><button type="button" class="v2c-map-close" data-v2c-map-close aria-label="Close the map">✕</button></div>
    <div class="v2c-map-lenses"><span class="v2c-map-lens-label" id="v2c-map-lens-label">Lens</span><div class="v2c-map-segments" role="radiogroup" aria-labelledby="v2c-map-lens-label">${items}</div></div>`;
};

export const overlaysHtml = (diplomacyOn: boolean, menuOpen: boolean, overviewOpen = false): string => {
  const active = activeLens(diplomacyOn);
  if (overviewOpen) return mapOverviewHtml(active);
  const label = active === "terrain" ? "Map lens" : `Map lens: ${LENSES.find((l) => l.id === active)?.label}`;
  const button = `<button type="button" class="hud-v2-lens-btn${active !== "terrain" ? " hud-v2-lens-on" : ""}" data-hud-v2-lens-toggle aria-haspopup="menu" aria-expanded="${menuOpen}" aria-label="${label}" title="${label}">${lensIcon(active === "terrain" ? "/icons/simple/lens.svg" : `/icons/simple/lens-${active}.svg`)}</button>`;
  if (!menuOpen) return button;
  // One lens is always on, so the items are radio menu items; the list follows the button in tab order.
  const items = LENSES.map((l) => `<button type="button" role="menuitemradio" class="hud-v2-lens-item${l.id === active ? " hud-v2-lens-item-on" : ""}" data-hud-v2-lens="${l.id}" aria-checked="${l.id === active}">${lensIcon(`/icons/simple/lens-${l.id}.svg`)}${l.label}</button>`).join("");
  return `${button}<div class="hud-v2-lens-menu" role="menu" aria-label="Map lens">${items}</div>`;
};

/**
 * Applies a click inside the lens host; true when it was a lens control. On a phone (`compact`) the round button
 * opens the map overview instead of the list, and a lens picked there leaves the overview open.
 */
export const lensClick = (state: Pick<HudV2Deps["state"], "showDiplomacyOverlay">, target: Element, compact = false): { handled: boolean; viewChanged: boolean } => {
  if (target.closest("[data-hud-v2-lens-toggle]")) {
    if (compact) setMapOverview(!mapOverview.open);
    else lensMenu.open = !lensMenu.open;
    return { handled: true, viewChanged: false };
  }
  if (target.closest("[data-v2c-map-close]")) {
    setMapOverview(false);
    return { handled: true, viewChanged: false };
  }
  const pick = target.closest<HTMLElement>("[data-hud-v2-lens]")?.dataset.hudV2Lens;
  if (pick !== "terrain" && pick !== "diplomacy") return { handled: false, viewChanged: false };
  lensMenu.open = false;
  const next = pick === "diplomacy";
  if (state.showDiplomacyOverlay === next) return { handled: true, viewChanged: false };
  state.showDiplomacyOverlay = next;
  return { handled: true, viewChanged: true };
};

/**
 * Moves the lens host into the minimap and wires it. It sits outside the HUD layer there, so it takes its own
 * clicks; Esc and clicks elsewhere fold the list. Call before the HUD's own Esc handler is registered.
 */
export const installLens = (deps: HudV2Deps, rerender: () => void): void => {
  const host = document.getElementById(OVERLAYS_HOST_ID);
  if (!host) return;
  document.getElementById("mini-map-wrap")?.appendChild(host);
  host.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const { handled, viewChanged } = lensClick(deps.state, target, document.body.classList.contains("hud-v2-compact"));
    if (!handled) return;
    if (viewChanged) deps.requestViewRefresh();
    rerender();
    // The rerender replaced the focused button: keep keyboard focus on the lens (the checked item while open).
    host.querySelector<HTMLElement>(lensMenu.open || mapOverview.open ? '[aria-checked="true"]' : "[data-hud-v2-lens-toggle]")?.focus();
  });
  // In the overview, a tap on the map has already centred the view (client-map-input-minimap-drag.ts): close it.
  document.getElementById("mini-map")?.addEventListener("click", () => {
    if (!mapOverview.open) return;
    setMapOverview(false);
    rerender();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!lensMenu.open || (event.target instanceof Node && host.contains(event.target))) return;
    lensMenu.open = false;
    rerender();
  }, true);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || (!lensMenu.open && !mapOverview.open)) return;
    if (mapOverview.open) setMapOverview(false);
    lensMenu.open = false;
    // onEscape listens on the same window, so only stopImmediatePropagation keeps it from also opening Settings.
    event.stopImmediatePropagation();
    rerender();
    host.querySelector<HTMLElement>("[data-hud-v2-lens-toggle]")?.focus();
  }, true);
};
