/**
 * Client side of beach landings (packages/shared dock-landing): which tiles a
 * dock crossing can come ashore on, read from the client's own dock pairs and
 * tile terrain. Shared by origin selection, the muster attack gate, the
 * landing-ground highlight (2D and true-3D) and the supply-line sea legs, so
 * every client surface applies the same rule the simulation enforces.
 */

import { WORLD_HEIGHT, WORLD_WIDTH, dockLandingGroundCoords, isDockLandingTile, type LandingTerrainAt } from "@border-empires/shared";
import type { DockPair, Tile } from "../client-types.js";

type RoutePoint = { x: number; y: number };

/** The client state the landing rule reads. */
export type DockLandingState = { readonly dockPairs: readonly DockPair[]; readonly tiles: ReadonlyMap<string, Tile> };

export const clientTerrainAt = (tiles: ReadonlyMap<string, Tile>): LandingTerrainAt => (x, y) => tiles.get(`${x},${y}`)?.terrain;

/** The far ends of every dock pair touching (x, y), with the pair's sea route (sea tiles only) when it has one. */
export const linkedDocksFrom = (
  dockPairs: readonly DockPair[],
  x: number,
  y: number
): Array<{ x: number; y: number; route?: readonly RoutePoint[] }> => {
  const out: Array<{ x: number; y: number; route?: readonly RoutePoint[] }> = [];
  for (const pair of dockPairs) {
    if (pair.ax === x && pair.ay === y) out.push({ x: pair.bx, y: pair.by, ...(pair.route ? { route: pair.route } : {}) });
    else if (pair.bx === x && pair.by === y) out.push({ x: pair.ax, y: pair.ay, ...(pair.route ? { route: pair.route } : {}) });
  }
  return out;
};

/** True when a crossing from the dock at (originX, originY) may land on (tx, ty): the linked dock or a beach beside it. */
export const isDockLandingTargetFrom = (
  state: DockLandingState,
  originX: number,
  originY: number,
  tx: number,
  ty: number
): boolean => {
  const terrainAt = clientTerrainAt(state.tiles);
  return linkedDocksFrom(state.dockPairs, originX, originY).some((linked) => isDockLandingTile(linked.x, linked.y, tx, ty, terrainAt));
};

const isDockEndpoint = (dockPairs: readonly DockPair[], x: number, y: number): boolean =>
  dockPairs.some((pair) => (pair.ax === x && pair.ay === y) || (pair.bx === x && pair.by === y));

/** LAND tiles of a dock's landing ground, as keys. */
const landingGroundKeys = (state: Pick<DockLandingState, "tiles">, dockX: number, dockY: number): string[] => {
  const terrainAt = clientTerrainAt(state.tiles);
  return dockLandingGroundCoords(dockX, dockY, terrainAt)
    .filter(({ x, y }) => terrainAt(x, y) === "LAND")
    .map(({ x, y }) => `${x},${y}`);
};

/**
 * Landing ground to highlight for the current selection:
 * - a selected dock shows the ground at both ends of its sea lanes -- where
 *   its crossings can land, and where crossings from the far end can land on
 *   its own shore;
 * - a selected beach shows the landing ground of the dock it belongs to.
 * Bounded by the selected dock's links x (2r+1)^2 tiles.
 */
export const landingGroundKeysForSelection = (state: DockLandingState & { readonly selected: RoutePoint | undefined }): Set<string> => {
  const keys = new Set<string>();
  const selected = state.selected;
  if (!selected) return keys;
  const anchors: RoutePoint[] = [];
  if (isDockEndpoint(state.dockPairs, selected.x, selected.y)) {
    anchors.push(selected, ...linkedDocksFrom(state.dockPairs, selected.x, selected.y));
  } else {
    const terrainAt = clientTerrainAt(state.tiles);
    for (const pair of state.dockPairs) {
      for (const dock of [{ x: pair.ax, y: pair.ay }, { x: pair.bx, y: pair.by }]) {
        if (isDockLandingTile(dock.x, dock.y, selected.x, selected.y, terrainAt)) anchors.push(dock);
      }
    }
  }
  for (const anchor of anchors) for (const key of landingGroundKeys(state, anchor.x, anchor.y)) keys.add(key);
  return keys;
};

const wrappedGap = (a: RoutePoint, b: RoutePoint): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

/** A pair's sea route read from `from` outward (routes are stored for one direction of the pair). */
const routeFrom = (route: readonly RoutePoint[], from: RoutePoint): readonly RoutePoint[] => {
  const first = route[0];
  const last = route[route.length - 1];
  if (!first || !last) return [];
  return wrappedGap(first, from) <= wrappedGap(last, from) ? route : [...route].reverse();
};

export type SeaLaneSupplyLink = {
  /** The viewer's dock the landing hangs on. */
  dockKey: string;
  /** The viewer's FRONTIER tile on the far shore's landing ground. */
  landingKey: string;
  /** Sea-route tiles between the dock and the landing, in order, when the pair's route is known. */
  via: readonly RoutePoint[];
};

/**
 * The viewer's sea lanes in use: one per (own dock, own frontier tile on the
 * landing ground of a dock it links to). Mirrors the simulation's sea-lane
 * supply edges (runtime-encirclement-application.ts). O(dock pairs x 9).
 */
export const seaLaneSupplyLinksFor = (state: DockLandingState & { readonly me: string }): SeaLaneSupplyLink[] => {
  const links: SeaLaneSupplyLink[] = [];
  const seen = new Set<string>();
  for (const pair of state.dockPairs) {
    for (const [dx, dy] of [[pair.ax, pair.ay], [pair.bx, pair.by]] as const) {
      const dockKey = `${dx},${dy}`;
      if (seen.has(dockKey) || state.tiles.get(dockKey)?.ownerId !== state.me) continue;
      seen.add(dockKey);
      for (const linked of linkedDocksFrom(state.dockPairs, dx, dy)) {
        for (const landingKey of landingGroundKeys(state, linked.x, linked.y)) {
          const landing = state.tiles.get(landingKey);
          if (landing?.ownerId !== state.me || landing.ownershipState !== "FRONTIER") continue;
          links.push({ dockKey, landingKey, via: routeFrom(linked.route ?? [], { x: dx, y: dy }) });
        }
      }
    }
  }
  return links;
};

/**
 * Tile-menu note for landing ground: which docks' crossings can come ashore
 * on (x, y), naming the viewer's own docks first. Undefined off landing ground.
 */
export const landingGroundMenuLine = (state: DockLandingState & { readonly me: string }, x: number, y: number): string | undefined => {
  const terrainAt = clientTerrainAt(state.tiles);
  const origins = new Map<string, boolean>();
  for (const pair of state.dockPairs) {
    if (isDockLandingTile(pair.bx, pair.by, x, y, terrainAt)) origins.set(`${pair.ax},${pair.ay}`, state.tiles.get(`${pair.ax},${pair.ay}`)?.ownerId === state.me);
    if (isDockLandingTile(pair.ax, pair.ay, x, y, terrainAt)) origins.set(`${pair.bx},${pair.by}`, state.tiles.get(`${pair.bx},${pair.by}`)?.ownerId === state.me);
  }
  if (origins.size === 0) return undefined;
  const ordered = [...origins].sort(([, mineA], [, mineB]) => Number(mineB) - Number(mineA));
  const names = ordered.map(([key, mine]) => `${mine ? "your dock" : "the dock"} at (${key.replace(",", ", ")})`);
  return `Landing ground: sea crossings from ${names.join(" or ")} can come ashore here.`;
};
