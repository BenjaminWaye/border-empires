// Map lenses, Civ-style: a round button notched into the top edge of the
// minimap opens a short list of views (Terrain, Diplomacy). The button shows the
// lens that is on. There is no legend: the colours speak for themselves, and a
// tile's owner carries a stance tag in the tile panel (client-hud-v2-stance-tag.ts).
// The host lives inside #mini-map-wrap so it moves with the minimap.

import type { HudV2Deps } from "./client-hud-v2-context.js";

export type MapLens = "terrain" | "diplomacy";

const LENSES: ReadonlyArray<{ id: MapLens; label: string }> = [
  { id: "terrain", label: "Terrain" },
  { id: "diplomacy", label: "Diplomacy" }
];

export const OVERLAYS_HOST_ID = "hud-v2-overlays";

/** Whether the lens list is unfolded; it closes on a pick, a second click, Esc or a click elsewhere. */
export const lensMenu = { open: false };

const lensIcon = (src: string): string => `<img class="hud-v2-lens-icon" src="${src}" alt="" aria-hidden="true" draggable="false">`;

export const activeLens = (diplomacyOn: boolean): MapLens => (diplomacyOn ? "diplomacy" : "terrain");

export const overlaysHtml = (diplomacyOn: boolean, menuOpen: boolean): string => {
  const active = activeLens(diplomacyOn);
  const label = active === "terrain" ? "Map lens" : `Map lens: ${LENSES.find((l) => l.id === active)?.label}`;
  const button = `<button type="button" class="hud-v2-lens-btn${active !== "terrain" ? " hud-v2-lens-on" : ""}" data-hud-v2-lens-toggle aria-haspopup="true" aria-expanded="${menuOpen}" aria-label="${label}" title="${label}">${lensIcon(active === "terrain" ? "/icons/simple/lens.svg" : `/icons/simple/lens-${active}.svg`)}</button>`;
  if (!menuOpen) return button;
  const items = LENSES.map((l) => `<button type="button" class="hud-v2-lens-item${l.id === active ? " hud-v2-lens-item-on" : ""}" data-hud-v2-lens="${l.id}" aria-pressed="${l.id === active}">${lensIcon(`/icons/simple/lens-${l.id}.svg`)}${l.label}</button>`).join("");
  return `<div class="hud-v2-lens-menu" role="group" aria-label="Map lens">${items}</div>${button}`;
};

/** Applies a click inside the lens host; true when it was a lens control. */
export const lensClick = (state: Pick<HudV2Deps["state"], "showDiplomacyOverlay">, target: Element): { handled: boolean; viewChanged: boolean } => {
  if (target.closest("[data-hud-v2-lens-toggle]")) {
    lensMenu.open = !lensMenu.open;
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
    const { handled, viewChanged } = lensClick(deps.state, target);
    if (!handled) return;
    if (viewChanged) deps.requestViewRefresh();
    rerender();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!lensMenu.open || (event.target instanceof Node && host.contains(event.target))) return;
    lensMenu.open = false;
    rerender();
  }, true);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !lensMenu.open) return;
    lensMenu.open = false;
    event.stopPropagation();
    rerender();
  }, true);
};
