import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { isDockRouteVisibleForPlayer } from "../client-dock-routes.js";
import type { ClientState } from "../client-state/client-state.js";
import type { DockPair, Tile, TileMenuView } from "../client-types.js";

// "Connected docks ◀ 2/3 ▶" row in a dock's tile menu. Steps the camera
// through every dock linked to the selected one (nearest first) so the
// player doesn't have to scroll along a long dashed route by hand. The
// selection stays on the origin dock, so its route lines keep drawing while
// the camera visits each end; "Back" returns to the origin.
//
// Renderer parity: both the 2D canvas and true-3D renderers read the camera
// from the same shared camX/camY/camSubX/camSubY state every frame (and the
// runtime loop's maybeRefreshForCamera picks up the move), so setting that
// state is enough for both -- no isTrue3DRendererActive() branch needed.

export type ConnectedDockStop = { x: number; y: number; distance: number; bySea: boolean };

type DockNavigatorState = Pick<ClientState, "fogDisabled" | "discoveredDockTiles" | "dockPairs" | "camX" | "camY" | "camSubX" | "camSubY">;

const toroidManhattan = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.min(dx, WORLD_WIDTH - dx) + Math.min(dy, WORLD_HEIGHT - dy);
};

/** Docks linked to (x, y), nearest first by sea-route length (straight-line distance when no route shipped). */
export const connectedDockStops = (dockPairs: readonly DockPair[], x: number, y: number): ConnectedDockStop[] => {
  const byKey = new Map<string, ConnectedDockStop>();
  for (const pair of dockPairs) {
    const fromA = pair.ax === x && pair.ay === y;
    const fromB = pair.bx === x && pair.by === y;
    if (!fromA && !fromB) continue;
    const otherX = fromA ? pair.bx : pair.ax;
    const otherY = fromA ? pair.by : pair.ay;
    const bySea = Boolean(pair.route && pair.route.length >= 2);
    const distance = bySea ? pair.route!.length - 1 : toroidManhattan(x, y, otherX, otherY);
    const stopKey = `${otherX},${otherY}`;
    const existing = byKey.get(stopKey);
    if (!existing || distance < existing.distance) byKey.set(stopKey, { x: otherX, y: otherY, distance, bySea });
  }
  return [...byKey.values()].sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
};

const discoveredDockStops = (state: DockNavigatorState, x: number, y: number): ConnectedDockStop[] =>
  connectedDockStops(state.dockPairs.filter((pair) => isDockRouteVisibleForPlayer(pair, {
    fogDisabled: state.fogDisabled,
    discoveredDockTiles: state.discoveredDockTiles,
    keyFor: (tileX, tileY) => `${tileX},${tileY}`
  })), x, y);

/** Index of the stop the camera is currently centred on, or -1. */
export const stopIndexAtCamera = (stops: readonly ConnectedDockStop[], camX: number, camY: number): number =>
  stops.findIndex((stop) => stop.x === camX && stop.y === camY);

const navigatorLabel = (stops: readonly ConnectedDockStop[], index: number): string =>
  index < 0
    ? `${stops.length} connected dock${stops.length === 1 ? "" : "s"}`
    : `Dock ${index + 1}/${stops.length} · ${stops[index]!.distance} tiles${stops[index]!.bySea ? " by sea" : " away"}`;

export const injectDockNavigatorRow = (view: TileMenuView, tile: Tile, state: DockNavigatorState): void => {
  if (!tile.dockId) return;
  if (view.overviewLines.some((line) => line.html.includes("data-dock-nav-origin"))) return;
  const stops = discoveredDockStops(state, tile.x, tile.y);
  if (stops.length === 0) return;
  const origin = `${tile.x},${tile.y}`;
  const label = navigatorLabel(stops, stopIndexAtCamera(stops, state.camX, state.camY));
  view.overviewLines.push({
    html:
      `<div class="dock-navigator" data-dock-nav-origin="${origin}">` +
      `<button type="button" class="dock-navigator-btn" data-dock-nav="prev" aria-label="Previous connected dock">◀</button>` +
      `<span class="dock-navigator-label" data-dock-nav-label>${label}</span>` +
      `<button type="button" class="dock-navigator-btn" data-dock-nav="next" aria-label="Next connected dock">▶</button>` +
      `<button type="button" class="dock-navigator-btn dock-navigator-home" data-dock-nav="home">Back</button>` +
      `</div>`
  });
};

const centerCamera = (state: DockNavigatorState, x: number, y: number): void => {
  state.camX = x;
  state.camY = y;
  state.camSubX = 0;
  state.camSubY = 0;
};

/** Moves the camera for one navigator press; returns the new label text. */
export const stepDockNavigator = (state: DockNavigatorState, originX: number, originY: number, action: string): string | undefined => {
  const stops = discoveredDockStops(state, originX, originY);
  if (stops.length === 0) return undefined;
  if (action === "home") {
    centerCamera(state, originX, originY);
    return navigatorLabel(stops, -1);
  }
  const current = stopIndexAtCamera(stops, state.camX, state.camY);
  const next =
    action === "prev"
      ? (current <= 0 ? stops.length - 1 : current - 1)
      : (current + 1) % stops.length;
  centerCamera(state, stops[next]!.x, stops[next]!.y);
  return navigatorLabel(stops, next);
};

export const wireDockNavigatorButtons = (root: ParentNode, state: DockNavigatorState): void => {
  root.querySelectorAll<HTMLElement>("[data-dock-nav-origin]").forEach((row) => {
    const [rawX, rawY] = (row.dataset.dockNavOrigin ?? "").split(",");
    const originX = Number(rawX);
    const originY = Number(rawY);
    if (!Number.isFinite(originX) || !Number.isFinite(originY)) return;
    const labelEl = row.querySelector<HTMLElement>("[data-dock-nav-label]");
    row.querySelectorAll<HTMLButtonElement>("button[data-dock-nav]").forEach((btn) => {
      btn.onclick = () => {
        const label = stepDockNavigator(state, originX, originY, btn.dataset.dockNav ?? "");
        if (label !== undefined && labelEl) labelEl.textContent = label;
      };
    });
  });
};
