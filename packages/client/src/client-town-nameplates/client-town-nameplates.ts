import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { Tile } from "../client-types.js";
import { nameplateModeAt, STATUS_LABEL, townNameplateFor, type NameplateMode, type TownNameplate, type TownNameplateStatus } from "./client-town-nameplate-model.js";
import "./client-town-nameplates.css";

interface NameplateTile { readonly wx: number; readonly wy: number; readonly wk: string; readonly px: number; readonly py: number; readonly vis: string; readonly t?: Tile | undefined }
interface NameplateProjection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }
export interface TownNameplatesState { readonly me: string; readonly authSessionReady: boolean }

const MAX_PLATES = 160;
// Inline SVG rather than symbol glyphs: swords and flag symbols are missing from some Android system fonts.
const svg = (body: string): string => `<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const STATUS_GLYPH: Record<TownNameplateStatus, string> = {
  unfed: svg('<path d="M6 2v5"/><circle cx="6" cy="9.8" r=".4" fill="currentColor"/>'),
  upgrade: svg('<path d="M6 10V2M2.5 5.5 6 2l3.5 3.5"/>'),
  war: svg('<path d="M2 2l8 8M10 2l-8 8M2 7.5 4.5 10M10 7.5 7.5 10"/>'),
  captured: svg('<path d="M3 11V1.5M3 2h6l-1.5 2L9 6H3"/>')
};
// Rough plate footprints in CSS px, for the greedy overlap cull below.
const FULL_W = 120, FULL_H = 34, DOT = 22;

interface Placed { readonly key: string; readonly plate: TownNameplate; readonly mode: Exclude<NameplateMode, "hidden">; readonly x: number; readonly y: number }

const overlaps = (a: Placed, b: Placed): boolean => {
  const aw = a.mode === "full" ? FULL_W : DOT, ah = a.mode === "full" ? FULL_H : DOT;
  const bw = b.mode === "full" ? FULL_W : DOT, bh = b.mode === "full" ? FULL_H : DOT;
  return Math.abs(a.x - b.x) * 2 < aw + bw && Math.abs(a.y - b.y) * 2 < ah + bh;
};

/** Pick which plates to draw: highest rank first, dropping any that would overlap one already placed. */
export const placeNameplates = (candidates: readonly Placed[]): Placed[] => {
  const placed: Placed[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.plate.rank - a.plate.rank)) {
    if (placed.length >= MAX_PLATES) break;
    if (!placed.some((other) => overlaps(candidate, other))) placed.push(candidate);
  }
  return placed;
};

const plateHtml = (plate: TownNameplate, mode: Placed["mode"]): string => {
  const status = plate.status ? `<span class="town-plate-status" data-status="${plate.status}">${STATUS_GLYPH[plate.status]}</span>` : "";
  if (mode === "dot") return status;
  const tier = plate.own ? `<span class="town-plate-tier">${plate.tier}</span>` : "";
  return `${status}<span class="town-plate-name"></span>${tier}`;
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
  return {
    render(tiles, { size, project }) {
      const nowMs = Date.now();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const lift = three ? Math.max(30, size * 1.5) : Math.max(18, size * 0.55);
      const candidates: Placed[] = [];
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady ? tiles : []) {
        if (vis !== "visible") continue;
        const plate = townNameplateFor(t, state.me, nowMs);
        if (!plate) continue;
        const mode = nameplateModeAt(plate, size, (t?.town?.populationTier ?? t?.townPopulationTier) === "SETTLEMENT");
        if (mode === "hidden") continue;
        const at = three ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
        const x = at.sx * scaleX, y = (at.sy - lift) * scaleY;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
        candidates.push({ key: wk, plate, mode, x, y });
      }
      const shown = new Set<string>();
      for (const { key, plate, mode, x, y } of placeNameplates(candidates)) {
        shown.add(key);
        let entry = elements.get(key);
        if (!entry) {
          const el = canvas.ownerDocument.createElement("div");
          layer.append(el);
          entry = { el, html: "" };
          elements.set(key, entry);
        }
        const html = plateHtml(plate, mode);
        if (entry.html !== html) { entry.el.innerHTML = html; entry.html = html; }
        const name = entry.el.querySelector(".town-plate-name");
        if (name && name.textContent !== plate.name) name.textContent = plate.name;
        const className = `town-plate town-plate-${mode}${plate.own ? " town-plate-own" : ""}`;
        if (entry.el.className !== className) entry.el.className = className;
        const title = plate.status ? `${plate.name}: ${STATUS_LABEL[plate.status]}` : plate.name;
        if (entry.el.title !== title) entry.el.title = title;
        if (entry.el.style.left !== `${x}px`) entry.el.style.left = `${x}px`;
        if (entry.el.style.top !== `${y}px`) entry.el.style.top = `${y}px`;
      }
      for (const [key, entry] of elements) if (!shown.has(key)) { entry.el.remove(); elements.delete(key); }
    },
    dispose() { elements.clear(); layer.remove(); }
  };
}
