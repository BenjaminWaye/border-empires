import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { createSeparatedOwnerColor } from "../client-owner-colors/client-owner-color-separation.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { garrisonPlannedTileKeys } from "../client-town-growth/client-town-growth.js";
import { resourceSimpleIconUrl } from "../client-resource-icons/client-resource-icons.js";
import type { Tile } from "../client-types.js";
import type { BiotaTownStatus } from "@border-empires/sim-protocol";
import { formatPlatePopulation, STATUS_LABEL, townNameplateFor, type TownNameplate, type TownNameplateGrowth, type TownNameplateStatus } from "./client-town-nameplate-model.js";
import { foodFixLabel, requestFoodFix } from "../client-food-fix/client-food-fix-store.js";
import "./client-town-nameplates.css";

interface NameplateTile { readonly wx: number; readonly wy: number; readonly wk: string; readonly px: number; readonly py: number; readonly vis: string; readonly t?: Tile | undefined }
interface NameplateProjection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }
export interface TownNameplatesState {
  readonly me: string;
  readonly authSessionReady: boolean;
  readonly profileSetupRequired: boolean;
  readonly playerColors: ReadonlyMap<string, string>;
  readonly manpowerBreakdown?: { readonly biotaTowns?: readonly BiotaTownStatus[] | undefined } | undefined;
  /** Garrisons under way, queued or planned (garrisonPlannedTileKeys): their town doesn't show as not garrisoned. */
  readonly settleProgressByTile?: { has(key: string): boolean } | undefined;
  readonly developmentQueue?: ReadonlyArray<{ kind: string; tileKey: string }> | undefined;
  readonly autoSettleTargets?: { has(key: string): boolean } | undefined;
}

/** Your large towns that get less biota than they need: they show as unruly. */
export const unrulyTownKeys = (biotaTowns: readonly BiotaTownStatus[] | undefined): ReadonlySet<string> =>
  new Set((biotaTowns ?? []).filter(town => town.received < town.needed).map(town => town.tileKey));

const MAX_PLATES = 160;
/** A neutral town has no owner colour: its plate keeps the plain edge colour as its line. */
const NEUTRAL_PLATE_LINE = "#5a4828";
// The game's own simple icons, so unfed is the same food icon as the resource bar.
// The bubble names the cause; whether the town grows rides on its population (GROWTH_MARK).
const STATUS_ICON: Record<TownNameplateStatus, string> = {
  ungarrisoned: resourceSimpleIconUrl("GOLD"),
  // The same garrison badge, without the "Not garrisoned" tag: the town itself is garrisoned.
  plots: resourceSimpleIconUrl("GOLD"),
  unfed: resourceSimpleIconUrl("FOOD"),
  unruly: resourceSimpleIconUrl("LUXURY_BIOTA"),
  upgrade: "/icons/simple/town-upgrade.svg",
  war: "/icons/simple/town-war.svg",
  // Raised fist, as in Civ resistance: a flag read as the muster flag, not "just taken".
  captured: "/icons/simple/town-captured-fist.svg"
};
// Unfed is the food icon struck through, not a red rim: red next to the owner colour clashed.
// Unruly is the biota icon struck through the same way; not garrisoned is the coin icon struck through.
const STATUS_STRIKE =
  '<svg class="town-plate-slash" viewBox="0 0 24 24"><path d="M5 19 19 5" stroke="#2a0805" stroke-width="5" stroke-linecap="round"/><path d="M5 19 19 5" stroke="#e5412c" stroke-width="2.8" stroke-linecap="round"/></svg>';
// Inline SVG, not ▲/❚❚ glyphs: those render inconsistently across system fonts.
const GROWTH_MARK: Record<TownNameplateGrowth, string> = {
  growing: '<svg class="town-plate-growth" viewBox="0 0 10 10"><path d="M5 1.5 9 8.5H1Z" fill="currentColor"/></svg>',
  paused: '<svg class="town-plate-growth" viewBox="0 0 10 10"><path d="M2 1.5h2.2v7H2zM5.8 1.5H8v7H5.8z" fill="currentColor"/></svg>'
};
// The CSS caps the name at NAME_MAX_W, so these upper-bound footprints in CSS
// px (at scale 1) hold for the greedy overlap cull below.
const NAME_MAX_W = 150, NAME_CHAR_W = 9, PLATE_H = 32, PLATE_GAP = 4;
// The struck coin alone was missed (2026-11-21 playtest): an ungarrisoned town spells it out on its plate.
const UNGARRISONED_TAG = "Not garrisoned", UNGARRISONED_TAG_W = 106;
// First-15 playtest 2026-11-28: an unfed town said so only in the Towns panel. Its plate now spells it out and
// offers the HUD's one-tap FOOD fix ("Garrison grain ›", client-food-fix-store.ts) when one is in reach.
const UNFED_TAG = "Unfed", UNFED_TAG_W = 46, FIX_CHAR_W = 7, FIX_PAD_W = 22;
const unfedFix = (plate: TownNameplate): string | undefined => (plate.status === "unfed" ? foodFixLabel() : undefined);
const plateWidth = (plate: TownNameplate): number => {
  const fix = unfedFix(plate);
  return 22 + Math.min(NAME_MAX_W, plate.name.length * NAME_CHAR_W) + (plate.status ? 22 : 0) + (plate.population === undefined ? 0 : 40) + (plate.growth ? 12 : 0) +
    (plate.status === "ungarrisoned" ? UNGARRISONED_TAG_W : 0) + (plate.status === "unfed" ? UNFED_TAG_W : 0) + (fix ? FIX_PAD_W + (fix.length + 2) * FIX_CHAR_W : 0);
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    ? `<span class="town-plate-badge" data-status="${plate.status}"><img src="${STATUS_ICON[plate.status]}" alt="" draggable="false">${plate.status === "ungarrisoned" || plate.status === "plots" || plate.status === "unfed" || plate.status === "unruly" ? STATUS_STRIKE : ""}</span>`
    : "";
  const growth = plate.growth ? GROWTH_MARK[plate.growth] : "";
  const population = plate.population === undefined
    ? ""
    : `<span class="town-plate-pop"${plate.growth ? ` data-growth="${plate.growth}"` : ""}>${formatPlatePopulation(plate.population)}${growth}</span>`;
  const fix = unfedFix(plate);
  const tag = plate.status === "ungarrisoned" ? `<span class="town-plate-tag">${UNGARRISONED_TAG}</span>`
    : plate.status === "unfed" ? `<span class="town-plate-tag town-plate-tag-unfed">${UNFED_TAG}</span>${fix ? `<button type="button" class="town-plate-fix" data-town-plate-fix>${escapeHtml(fix)} ›</button>` : ""}`
    : "";
  return `${badge}<span class="town-plate-body"><span class="town-plate-name"></span>${population}${tag}</span>`;
};

/** Screen-space town plates over either map renderer, fed the frame's visible tiles and real projection. */
export function createTownNameplates(
  canvas: HTMLCanvasElement,
  state: TownNameplatesState,
  /** Per frame: which of your garrisoned towns still have plots to garrison (townHasPlotsToGarrison). */
  plotsToGarrison?: () => (town: Tile) => boolean
): {
  render: (tiles: readonly NameplateTile[], projection: NameplateProjection) => void;
  dispose: () => void;
} {
  const layer = canvas.ownerDocument.createElement("div");
  layer.className = "town-plate-layer";
  layer.setAttribute("aria-hidden", "true");
  canvas.parentElement?.append(layer);
  // The layer lets taps through to the map; only an unfed plate's fix button takes them, and none may reach the
  // map under it (its window mouseup/mousedown and canvas touches would select the tile).
  const onFix = (event: Event): void => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-town-plate-fix]")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "click") requestFoodFix();
  };
  for (const type of ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"]) layer.addEventListener(type, onFix);
  const elements = new Map<string, { el: HTMLElement; html: string }>();
  // Same rival-spacing as the map tint (client-map-facade), so the plate's line matches the territory.
  const ownerColor = createSeparatedOwnerColor((ownerId) => resolveOwnerColor(ownerId, state.playerColors, fallbackOwnerColor), () => state.me);
  return {
    render(tiles, { size, project }) {
      const nowMs = Date.now();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const unruly = unrulyTownKeys(state.manpowerBreakdown?.biotaTowns);
      const garrisoning = garrisonPlannedTileKeys(state);
      const hasPlots = plotsToGarrison?.();
      const candidates: Placed[] = [];
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
        if (vis !== "visible") continue;
        const plate = townNameplateFor(t, state.me, nowMs, unruly, garrisoning, hasPlots);
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
        const className = `town-plate${plate.own ? " town-plate-own" : ""}${plate.ownerId ? "" : " town-plate-neutral"}${plate.status ? " town-plate-has-status" : ""}`;
        if (entry.el.className !== className) entry.el.className = className;
        const title = plate.status ? `${plate.name}: ${STATUS_LABEL[plate.status]}` : plate.name;
        if (entry.el.title !== title) entry.el.title = title;
        const color = plate.ownerId ? ownerColor(plate.ownerId) : NEUTRAL_PLATE_LINE;
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
