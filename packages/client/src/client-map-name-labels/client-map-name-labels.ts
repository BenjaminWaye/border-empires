// Map name labels, drawn on the overlay canvas in both renderers (see
// client-map-name-label-draw.ts for how 3D is covered):
//   - zoomed far out: each player's name across their garrisoned territory
//     (client-territory-name-layout.ts), in their own colour;
//   - zoomed in: island names from the simulation's ISLAND_NAMES push
//     (client-island-names-state.ts) -- generated names faint, chosen names in
//     brass, a contested name tarnished, a fading one ghosted.
// The two crossfade over a short zoom band so only one set reads at a time.
import type { IslandLabel } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { drawNameAlongPath, type LabelStyle, type NameLabelPath } from "./client-map-name-label-draw.js";
import { createNamePlacementCache } from "./client-map-name-placements.js";

/** Player names are fully shown at or below this zoom (tile px)... */
export const PLAYER_NAMES_FULL_AT_ZOOM = 14;
/** ...and island names at or above this one; the band between crossfades. */
export const ISLAND_NAMES_FULL_AT_ZOOM = 18;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
/** Opacity steps across the crossfade band. */
const FADE_STEPS = 4;

export const nameLabelAlphasForZoom = (zoom: number): { players: number; islands: number } => {
  const band = ISLAND_NAMES_FULL_AT_ZOOM - PLAYER_NAMES_FULL_AT_ZOOM;
  return {
    players: clamp01((ISLAND_NAMES_FULL_AT_ZOOM - zoom) / band),
    islands: clamp01((zoom - PLAYER_NAMES_FULL_AT_ZOOM) / band)
  };
};

const DECORATIVE_FONT = (px: number): string => `700 ${px}px "Cinzel Decorative", "Cinzel", Georgia, serif`;
const PLAIN_FONT = (px: number): string => `600 ${px}px "Cinzel", Georgia, serif`;

// Cartographer's ink, as on a printed campaign map: dark lettering with a
// faint parchment halo, painted on the ground under every unit and building.
const INK_HALO = "rgba(246, 236, 210, 0.38)";
const INK_HALO_EM = 0.07;

const islandStyle = (label: IslandLabel, alpha: number): LabelStyle => {
  const base = { font: PLAIN_FONT, stroke: INK_HALO, strokeEm: INK_HALO_EM, maxSpacingEm: 0.9, minFontPx: 10, maxFontPx: 54 };
  if (label.status === "held") return { ...base, fill: "rgb(46, 26, 8)", alpha: alpha * 0.85 };
  if (label.status === "contested") return { ...base, fill: "rgb(92, 30, 18)", alpha: alpha * 0.8 };
  if (label.status === "fading") return { ...base, fill: "rgb(46, 34, 20)", alpha: alpha * 0.35 };
  return { ...base, fill: "rgb(30, 22, 14)", alpha: alpha * 0.6 };
};

export { islandLabelPath } from "./client-map-name-placements.js";

export type MapNameLabelSourceDeps = {
  readonly state: Pick<ClientState, "tiles" | "tilesRevision" | "zoom" | "islandLabels" | "me" | "meName" | "playerNames" | "leaderboard">;
  /** False for ground the player has never explored: an island name there stays hidden. */
  readonly isExploredAt: (x: number, y: number) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

export type PlacedNameLabel = { readonly kind: "player" | "island"; readonly path: NameLabelPath; readonly style: LabelStyle };

export type MapNameLabelSource = {
  /** This frame's labels, islands first (players draw on top), plus a signature that only changes when what they'd draw does. */
  readonly current: (nowMs: number) => { readonly labels: readonly PlacedNameLabel[]; readonly signature: string };
};

let fontRequested = false;
const requestLabelFonts = (): void => {
  if (fontRequested || typeof document === "undefined" || !document.fonts) return;
  fontRequested = true;
  // Canvas text only uses a web font once it has loaded; ask for both faces up front.
  void document.fonts.load(DECORATIVE_FONT(32)).catch(() => undefined);
  void document.fonts.load(PLAIN_FONT(32)).catch(() => undefined);
};

/** Labels shared by the 2D overlay pass (createMapNameLabels) and the 3D ground decal (client-map-3d-name-decal). */
export const createMapNameLabelSource = (deps: MapNameLabelSourceDeps): MapNameLabelSource => {
  const placements = createNamePlacementCache(deps);
  return {
    current: (nowMs) => {
      // Fade in steps, not continuously: the 3D decal redraws (and re-uploads) its texture whenever these change.
      const smooth = nameLabelAlphasForZoom(deps.state.zoom);
      const alphas = { players: Math.round(smooth.players * FADE_STEPS) / FADE_STEPS, islands: Math.round(smooth.islands * FADE_STEPS) / FADE_STEPS };
      const labels: PlacedNameLabel[] = [];
      if (alphas.players <= 0 && alphas.islands <= 0) return { labels, signature: "none" };
      requestLabelFonts();
      const placed = placements.current(nowMs);
      if (alphas.islands > 0) {
        for (const { label, path } of placed.islands) labels.push({ kind: "island", path, style: islandStyle(label, alphas.islands) });
      }
      if (alphas.players > 0) {
        for (const { path } of placed.players) {
          labels.push({
            kind: "player",
            path,
            // Realm names in deep ink, widely spaced across the land; the owner's colour is already the ground under them.
            style: {
              font: DECORATIVE_FONT,
              fill: "rgb(26, 18, 10)",
              stroke: INK_HALO,
              strokeEm: INK_HALO_EM,
              alpha: alphas.players * 0.82,
              maxSpacingEm: 2.2,
              minFontPx: 11,
              maxFontPx: 96
            }
          });
        }
      }
      return { labels, signature: `${alphas.players.toFixed(2)};${alphas.islands.toFixed(2)};${placed.version}` };
    }
  };
};

export type MapNameLabelsDeps = MapNameLabelSourceDeps & { readonly ctx: CanvasRenderingContext2D };

export type MapNameLabels = {
  /** Draws this frame's labels on the overlay canvas (2D renderer). `project` is the frame's worldToScreen. */
  readonly render: (project: (wx: number, wy: number) => { sx: number; sy: number }, nowMs: number) => void;
};

export const createMapNameLabels = (deps: MapNameLabelsDeps): MapNameLabels => {
  const source = createMapNameLabelSource(deps);
  return {
    render: (project, nowMs) => {
      const viewport = { width: deps.ctx.canvas.width, height: deps.ctx.canvas.height };
      for (const label of source.current(nowMs).labels) drawNameAlongPath(deps.ctx, label.path, label.style, project, viewport);
    }
  };
};
