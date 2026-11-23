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

type DockNavigatorState = Pick<ClientState, "fogDisabled" | "discoveredDockTiles" | "dockPairs" | "camX" | "camY" | "camSubX" | "camSubY" | "me" | "tiles"> &
  Partial<Pick<ClientState, "allies" | "activeTruces">>;

const isOwnDockAt = (state: Pick<DockNavigatorState, "tiles" | "me">, x: number, y: number): boolean =>
  Boolean(state.me) && state.tiles.get(`${x},${y}`)?.ownerId === state.me;

/** Only a garrisoned dock reveals the docks it links to (apps/simulation runtime-linked-dock-deltas.ts). */
const isOwnSettledDockAt = (state: Pick<DockNavigatorState, "tiles" | "me">, x: number, y: number): boolean =>
  isOwnDockAt(state, x, y) && state.tiles.get(`${x},${y}`)?.ownershipState === "SETTLED";

/**
 * A far dock Cross the sea can land you on: the client has it (so its sheet can open) and it isn't yours,
 * an ally's or a truce partner's -- you can Expand To a neutral dock or Attack a rival's, nothing else.
 */
const isCrossableDockAt = (state: DockNavigatorState, x: number, y: number): boolean => {
  const tile = state.tiles.get(`${x},${y}`);
  if (!tile || !tile.dockId) return false;
  const owner = tile.ownerId;
  if (!owner) return true;
  if (owner === state.me || (state.allies ?? []).includes(owner)) return false;
  return !(state.activeTruces ?? []).some((truce) => truce.otherPlayerId === owner);
};

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

/**
 * A lane the player knows: both ends discovered, or one end is their own garrisoned dock and the client holds
 * the other -- a garrisoned dock reveals the docks it links to, and discoveredDockTiles is only this device's
 * copy, so an owner's lanes vanished after a sign-in on a fresh device (Playtest Run 4: Mark's row was missing).
 */
const ownLaneKnown = (state: DockNavigatorState, ownX: number, ownY: number, farX: number, farY: number): boolean =>
  isOwnSettledDockAt(state, ownX, ownY) && state.tiles.has(`${farX},${farY}`);

const knownDockPairs = (state: DockNavigatorState): DockPair[] =>
  state.dockPairs.filter((pair) =>
    ownLaneKnown(state, pair.ax, pair.ay, pair.bx, pair.by) || ownLaneKnown(state, pair.bx, pair.by, pair.ax, pair.ay) ||
    isDockRouteVisibleForPlayer(pair, { fogDisabled: state.fogDisabled, discoveredDockTiles: state.discoveredDockTiles, keyFor: (tileX, tileY) => `${tileX},${tileY}` }));

const discoveredDockStops = (state: DockNavigatorState, x: number, y: number): ConnectedDockStop[] =>
  connectedDockStops(knownDockPairs(state), x, y);

/**
 * Where "Cross the sea" goes: the nearest crossable dock (isCrossableDockAt) across a known lane. A lane that
 * ends at another of the player's own garrisoned docks is followed onward along that chain (fewest hops, then
 * shortest total route), since crossing to your own land gets you nowhere (Playtest Run 4: Mark's only lane
 * joined his two docks). `distance` is the whole route from the origin. Prefers the far dock the navigator is
 * showing when that one is crossable. Undefined when no lane leads out.
 */
export const findCrossTarget = (state: DockNavigatorState, originX: number, originY: number): ConnectedDockStop | undefined => {
  const pairs = knownDockPairs(state);
  const direct = connectedDockStops(pairs, originX, originY);
  const shown = direct[stopIndexAtCamera(direct, state.camX, state.camY)];
  if (shown && isCrossableDockAt(state, shown.x, shown.y)) return shown;
  const seen = new Set([`${originX},${originY}`]);
  let frontier: ConnectedDockStop[] = [{ x: originX, y: originY, distance: 0, bySea: true }];
  // Bounded by the docks reachable through the player's own garrisoned docks.
  while (frontier.length > 0) {
    const next: ConnectedDockStop[] = [];
    const outward: ConnectedDockStop[] = [];
    for (const dock of frontier) {
      for (const stop of connectedDockStops(pairs, dock.x, dock.y)) {
        const key = `${stop.x},${stop.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const total = { ...stop, distance: dock.distance + stop.distance };
        if (isOwnSettledDockAt(state, stop.x, stop.y)) next.push(total);
        else if (isCrossableDockAt(state, stop.x, stop.y)) outward.push(total);
      }
    }
    if (outward.length > 0) return outward.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y)[0];
    frontier = next;
  }
  return undefined;
};

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

/** Cross the sea: findCrossTarget, with the camera moved there. */
export const crossDockTarget = (state: DockNavigatorState, originX: number, originY: number): ConnectedDockStop | undefined => {
  const stop = findCrossTarget(state, originX, originY);
  if (stop) centerCamera(state, stop.x, stop.y);
  return stop;
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

export const DOCK_CROSS_ACTION_ID = "dock_cross_sea" as const;

/**
 * "Cross the sea" on your own dock, as a real tile action so both the tile menu and the HUD v2 action bar
 * show it (HUD v2 drops buttons inside detail rows). A player stranded on an island held a dock for two days
 * and never crossed (Playtest Run 4, Mark): nothing said the dock was the road off. Offered only when a lane
 * leads to new ground (findCrossTarget).
 */
export const injectDockCrossAction = (view: TileMenuView, tile: Tile, state: DockNavigatorState): void => {
  // Garrisoned only: on a frontier dock Garrison stays the main action, and it's what reveals the lanes.
  if (!tile.dockId || tile.ownerId !== state.me || tile.ownershipState !== "SETTLED" || view.actions.some((a) => a.id === DOCK_CROSS_ACTION_ID)) return;
  const target = findCrossTarget(state, tile.x, tile.y);
  if (!target) return;
  view.actions.unshift({
    id: DOCK_CROSS_ACTION_ID,
    label: "Cross the sea",
    cost: `${target.distance} tiles`,
    detail: `Go to the dock at (${target.x}, ${target.y}) across the sea lane. Expand To or Attack it from there to land.`
  });
};

/**
 * Handles Cross the sea: moves the camera to the far dock, selects it and opens its sheet, whose Expand To
 * (or Attack) crosses the lane. True when `actionId` was Cross the sea.
 */
export const dispatchDockCrossAction = (
  actionId: string,
  selected: { x: number; y: number } | undefined,
  state: DockNavigatorState & Pick<ClientState, "selected">,
  openTile: (tile: Tile) => void
): boolean => {
  if (actionId !== DOCK_CROSS_ACTION_ID) return false;
  if (!selected) return true;
  const stop = crossDockTarget(state, selected.x, selected.y);
  if (!stop) return true;
  state.selected = { x: stop.x, y: stop.y };
  const far = state.tiles.get(`${stop.x},${stop.y}`);
  if (far) openTile(far);
  return true;
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
