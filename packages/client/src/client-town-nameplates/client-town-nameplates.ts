import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { createSeparatedOwnerColor } from "../client-owner-colors/client-owner-color-separation.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { resourceSimpleIconUrl } from "../client-resource-icons/client-resource-icons.js";
import type { Tile } from "../client-types.js";
import { formatPlatePopulation, STATUS_LABEL, townNameplateFor, type TownNameplate, type TownNameplateStatus } from "./client-town-nameplate-model.js";
import "./client-town-nameplates.css";

interface NameplateTile { readonly wx: number; readonly wy: number; readonly wk: string; readonly px: number; readonly py: number; readonly vis: string; readonly t?: Tile | undefined }
interface NameplateProjection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }
export interface TownNameplatesState {
  readonly me: string;
  readonly authSessionReady: boolean;
  readonly profileSetupRequired: boolean;
  readonly playerColors: ReadonlyMap<string, string>;
}

const MAX_PLATES = 160;
// The game's own simple icons, so unfed is the same food icon as the resource bar.
// Nearby war and recent capture both pause growth, and the plate says that
// (a growth line struck through) rather than the cause; the town's details give the reason.
const STATUS_ICON: Record<TownNameplateStatus, string> = {
  unfed: resourceSimpleIconUrl("FOOD"),
  upgrade: "/icons/simple/town-upgrade.svg",
  war: "/icons/simple/town-growth.svg",
  captured: "/icons/simple/town-growth.svg"
};
// A red strike, not a red rim: red next to the owner colour clashed. The growth
// line rises bottom-left to top-right, so its strike runs the other way to cross it.
const strike = (path: string): string =>
  `<svg class="town-plate-slash" viewBox="0 0 24 24"><path d="${path}" stroke="#2a0805" stroke-width="5" stroke-linecap="round"/><path d="${path}" stroke="#e5412c" stroke-width="2.8" stroke-linecap="round"/></svg>`;
const STATUS_STRIKE: Partial<Record<TownNameplateStatus, string>> = {
  unfed: strike("M5 19 19 5"),
  war: strike("M5 5 19 19"),
  captured: strike("M5 5 19 19")
};
// The CSS caps the name at NAME_MAX_W, so these upper-bound footprints in CSS
// px (at scale 1) hold for the greedy overlap cull below.
const NAME_MAX_W = 150, NAME_CHAR_W = 9, PLATE_H = 32, PLATE_GAP = 4;
const plateWidth = (plate: TownNameplate): number =>
  22 + Math.min(NAME_MAX_W, plate.name.length * NAME_CHAR_W) + (plate.status ? 22 : 0) + (plate.population === undefined ? 0 : 40);

/** Like Civ banners, plates grow as you zoom in: base size up to ~48px tiles, then up to 1.6x. */
export const plateScaleForTile = (tileCssPx: number): number => Math.min(1.6, Math.max(1, 0.7 + tileCssPx / 160));

interface Placed { readonly key: string; readonly plate: TownNameplate; readonly x: number; readonly y: number; readonly scale: number }

// Plates are centred on x but grow upward from y (their bottom), so each spans [y - PLATE_H * scale, y].
const overlaps = (a: Placed, b: Placed): boolean =>
  Math.abs(a.x - b.x) * 2 < plateWidth(a.plate) * a.scale + plateWidth(b.plate) * b.scale &&
  a.y - PLATE_H * a.scale < b.y && b.y - PLATE_H * b.scale < a.y;

/** Pick which plates to draw: highest rank first (ties by tile key, so panning doesn't flip them), dropping any that would overlap one already placed. */
export const placeNameplates = (candidates: readonly Placed[]): Placed[] => {
  const placed: Placed[] = [];
  const ordered = [...candidates].sort((a, b) => b.plate.rank - a.plate.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const candidate of ordered) {
    if (placed.length >= MAX_PLATES) break;
    if (!placed.some((other) => overlaps(candidate, other))) placed.push(candidate);
  }
  return placed;
};

const plateHtml = (plate: TownNameplate): string => {
  const badge = plate.status
    ? `<span class="town-plate-badge" data-status="${plate.status}"><img src="${STATUS_ICON[plate.status]}" alt="" draggable="false">${STATUS_STRIKE[plate.status] ?? ""}</span>`
    : "";
  const population = plate.population === undefined ? "" : `<span class="town-plate-pop">${formatPlatePopulation(plate.population)}</span>`;
  return `${badge}<span class="town-plate-body"><span class="town-plate-name"></span>${population}</span>`;
};

/** Screen-space town plates over either map renderer, fed the frame's visible tiles and real projection. */
export function createTownNameplates(canvas: HTMLCanvasElement, state: TownNameplatesState): {
  render: (tiles: readonly NameplateTile[], projection: NameplateProjection) => void;
  dispose: () => void;
} {
  const layer = canvas.ownerDocument.createElement("div");
  layer.className = "town-plate-layer";
  layer.setAttribute("aria-hidden", "true");
  canvas.parentElement?.append(layer);
  const elements = new Map<string, { el: HTMLElement; html: string }>();
  // Same rival-spacing as the map tint (client-map-facade), so the plate's line matches the territory.
  const ownerColor = createSeparatedOwnerColor((ownerId) => resolveOwnerColor(ownerId, state.playerColors, fallbackOwnerColor), () => state.me);
  return {
    render(tiles, { size, project }) {
      const nowMs = Date.now();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const candidates: Placed[] = [];
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
        if (vis !== "visible") continue;
        const plate = townNameplateFor(t, state.me, nowMs);
        if (!plate) continue;
        const at = three ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
        // 3D: the tile's on-screen width comes from the camera (zoom alone doesn't say it);
        // 2D: it's the zoom. It sizes the plate.
        const tile = (three ? Math.abs(project(wx + 1, wy).sx - at.sx) : size) * scaleX;
        // The plate's bottom sits on the town tile's back (upper) edge, which on the 3D
        // map is about where the town model's roof ends, never on the tile behind.
        // Both half-tile edges are projected and the higher one taken, so this
        // doesn't depend on which way world y runs on screen.
        const backEdge = three ? Math.min(project(wx, wy - 0.5).sy, project(wx, wy + 0.5).sy) : py;
        const x = at.sx * scaleX, y = backEdge * scaleY - PLATE_GAP;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
        candidates.push({ key: wk, plate, x, y, scale: plateScaleForTile(tile) });
      }
      const shown = new Set<string>();
      for (const { key, plate, x, y, scale } of placeNameplates(candidates)) {
        shown.add(key);
        let entry = elements.get(key);
        if (!entry) {
          const el = canvas.ownerDocument.createElement("div");
          layer.append(el);
          entry = { el, html: "" };
          elements.set(key, entry);
        }
        const html = plateHtml(plate);
        if (entry.html !== html) { entry.el.innerHTML = html; entry.html = html; }
        const name = entry.el.querySelector(".town-plate-name");
        if (name && name.textContent !== plate.name) name.textContent = plate.name;
        const className = `town-plate${plate.own ? " town-plate-own" : ""}${plate.status ? " town-plate-has-status" : ""}`;
        if (entry.el.className !== className) entry.el.className = className;
        const title = plate.status ? `${plate.name}: ${STATUS_LABEL[plate.status]}` : plate.name;
        if (entry.el.title !== title) entry.el.title = title;
        const color = ownerColor(plate.ownerId);
        if (entry.el.style.getPropertyValue("--town-plate-owner") !== color) entry.el.style.setProperty("--town-plate-owner", color);
        // transform, not left/top: moving plates then never dirties layout, so the
        // AFC layer's getBoundingClientRect right after doesn't force a reflow.
        // Scale applies first, about the plate's bottom centre (CSS transform-origin), so the plate grows upward from its anchor.
        const transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
        if (entry.el.style.transform !== transform) entry.el.style.transform = transform;
      }
      for (const [key, entry] of elements) if (!shown.has(key)) { entry.el.remove(); elements.delete(key); }
    },
    dispose() { elements.clear(); layer.remove(); }
  };
}
