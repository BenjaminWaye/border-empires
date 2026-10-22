// Map name labels, drawn on the overlay canvas in both renderers (see
// client-map-name-label-draw.ts for how 3D is covered):
//   - zoomed far out: each player's name across their garrisoned territory
//     (client-territory-name-layout.ts), in their own colour;
//   - zoomed in: island names from the simulation's ISLAND_NAMES push
//     (client-island-names-state.ts) -- generated names faint, chosen names in
//     brass, a contested name tarnished, a fading one ghosted.
// The two crossfade over a short zoom band so only one set reads at a time.
import type { IslandLabel } from "@border-empires/shared";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { isPlanetaryDefenseOwnerId } from "../client-planetary-defense-style.js";
import type { ClientState } from "../client-state/client-state.js";
import type { TileVisibilityState } from "../client-types.js";
import { drawNameAlongPath, type LabelStyle, type NameLabelPath } from "./client-map-name-label-draw.js";
import { computeTerritoryNameLabels, type TerritoryNameLabel } from "./client-territory-name-layout.js";

/** Player names are fully shown at or below this zoom (tile px)... */
export const PLAYER_NAMES_FULL_AT_ZOOM = 14;
/** ...and island names at or above this one; the band between crossfades. */
export const ISLAND_NAMES_FULL_AT_ZOOM = 18;
/** Territory layout is recomputed at most this often while tiles keep changing. */
const TERRITORY_LAYOUT_MIN_INTERVAL_MS = 1_500;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const nameLabelAlphasForZoom = (zoom: number): { players: number; islands: number } => {
  const band = ISLAND_NAMES_FULL_AT_ZOOM - PLAYER_NAMES_FULL_AT_ZOOM;
  return {
    players: clamp01((ISLAND_NAMES_FULL_AT_ZOOM - zoom) / band),
    islands: clamp01((zoom - PLAYER_NAMES_FULL_AT_ZOOM) / band)
  };
};

const DECORATIVE_FONT = (px: number): string => `700 ${px}px "Cinzel Decorative", "Cinzel", Georgia, serif`;
const PLAIN_FONT = (px: number): string => `600 ${px}px "Cinzel", Georgia, serif`;

/** Mixes a #rrggbb colour toward parchment white so dark empire colours stay legible on the map. */
export const lightenForLabel = (color: string, amount = 0.4): string => {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = parseInt(match[1]!, 16);
  const mix = (channel: number, target: number): number => Math.round(channel + (target - channel) * amount);
  const r = mix((value >> 16) & 0xff, 255);
  const g = mix((value >> 8) & 0xff, 246);
  const b = mix(value & 0xff, 224);
  return `rgb(${r}, ${g}, ${b})`;
};

const islandStyle = (label: IslandLabel, alpha: number): LabelStyle => {
  const base = { maxSpacingEm: 0.9, minFontPx: 10, maxFontPx: 54 };
  if (label.status === "held") return { ...base, font: DECORATIVE_FONT, fill: "#f0cf7a", stroke: "rgba(46, 26, 6, 0.9)", alpha };
  if (label.status === "contested") return { ...base, font: DECORATIVE_FONT, fill: "#e4a46a", stroke: "rgba(52, 22, 8, 0.9)", alpha: alpha * 0.9 };
  if (label.status === "fading") return { ...base, font: DECORATIVE_FONT, fill: "#cdbb94", stroke: "rgba(36, 24, 10, 0.6)", alpha: alpha * 0.45 };
  return { ...base, font: PLAIN_FONT, fill: "rgb(236, 222, 186)", stroke: "rgba(36, 24, 10, 0.7)", alpha: alpha * 0.6 };
};

/** Longest stretch an island name is spread over: a continent's name stays readable instead of scattering letters across the world. */
const ISLAND_LABEL_MAX_HALF_SPAN_TILES = 18;

export const islandLabelPath = (label: IslandLabel): NameLabelPath => {
  const half = Math.min(ISLAND_LABEL_MAX_HALF_SPAN_TILES, Math.max(0.5, label.span * 0.42));
  const ux = Math.cos(label.angle);
  const uy = Math.sin(label.angle);
  return {
    text: label.name,
    points: [{ x: label.x - half * ux, y: label.y - half * uy }, { x: label.x + half * ux, y: label.y + half * uy }],
    heightTiles: Math.min(5, Math.max(1, label.thickness * 0.3)),
    spanTiles: 2 * half + 2
  };
};

export type MapNameLabelsDeps = {
  readonly state: Pick<ClientState, "tiles" | "tilesRevision" | "zoom" | "islandLabels" | "me" | "meName" | "playerNames" | "leaderboard">;
  readonly ctx: CanvasRenderingContext2D;
  readonly ownerColor: (ownerId: string) => string;
  readonly tileVisibilityStateAt: (x: number, y: number) => TileVisibilityState;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

export type MapNameLabels = {
  /** Draws this frame's labels. `project` is the frame's worldToScreen. */
  readonly render: (project: (wx: number, wy: number) => { sx: number; sy: number }, nowMs: number) => void;
};

let fontRequested = false;
const requestLabelFonts = (): void => {
  if (fontRequested || typeof document === "undefined" || !document.fonts) return;
  fontRequested = true;
  // Canvas text only uses a web font once it has loaded; ask for both faces up front.
  void document.fonts.load(DECORATIVE_FONT(32)).catch(() => undefined);
  void document.fonts.load(PLAIN_FONT(32)).catch(() => undefined);
};

export const createMapNameLabels = (deps: MapNameLabelsDeps): MapNameLabels => {
  let territory: { revision: number; computedAt: number; labels: TerritoryNameLabel[] } | undefined;

  const territoryLabels = (nowMs: number): TerritoryNameLabel[] => {
    const revision = deps.state.tilesRevision;
    if (!territory || (territory.revision !== revision && nowMs - territory.computedAt >= TERRITORY_LAYOUT_MIN_INTERVAL_MS)) {
      territory = {
        revision,
        computedAt: nowMs,
        labels: computeTerritoryNameLabels(deps.state.tiles.values(), { skipOwner: (ownerId) => isPlanetaryDefenseOwnerId(ownerId) })
      };
    }
    return territory.labels;
  };

  return {
    render: (project, nowMs) => {
      const alphas = nameLabelAlphasForZoom(deps.state.zoom);
      if (alphas.players <= 0 && alphas.islands <= 0) return;
      requestLabelFonts();
      const viewport = { width: deps.ctx.canvas.width, height: deps.ctx.canvas.height };
      if (alphas.islands > 0) {
        for (const label of deps.state.islandLabels ?? []) {
          if (deps.tileVisibilityStateAt(deps.wrapX(Math.round(label.x)), deps.wrapY(Math.round(label.y))) === "unexplored") continue;
          drawNameAlongPath(deps.ctx, islandLabelPath(label), islandStyle(label, alphas.islands), project, viewport);
        }
      }
      if (alphas.players > 0) {
        for (const label of territoryLabels(nowMs)) {
          const name = playerDisplayNameForOwnerFromState(deps.state, label.ownerId);
          if (!name) continue;
          drawNameAlongPath(
            deps.ctx,
            { text: name, points: label.points, heightTiles: label.heightTiles, spanTiles: label.spanTiles },
            {
              font: DECORATIVE_FONT,
              fill: lightenForLabel(deps.ownerColor(label.ownerId)),
              stroke: "rgba(24, 14, 6, 0.88)",
              alpha: alphas.players,
              maxSpacingEm: 1.6,
              minFontPx: 11,
              maxFontPx: 96
            },
            project,
            viewport
          );
        }
      }
    }
  };
};
