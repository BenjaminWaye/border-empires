// A returning player's map reopens where they last looked (client-camera-storage.ts). When the land
// in that view was lost while they were away, nothing in it is visible any more: both renderers draw
// remembered tiles as a slate-grey wash with drifting mist and unexplored ones as storm, so the whole
// screen is grey fog. On a phone the login Chronicle covers the map first, so the player only meets
// it when they close the Chronicle (playtest: "Lost 12 tiles to Konrad", then an empty grey map
// read as "my whole empire is gone", until the overview map took them back).
//
// On the first INIT of a page load the INIT snapshot already holds every tile the player can see, so
// "nothing visible in the restored view" is decidable there. A view that still shows anything live (your
// land, a contested front, an ally's border, a rival you can see) is kept. Only camX/camY move, which
// both the 2D and the true-3D renderer read.

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { DEFAULT_ZOOM } from "../client-constants.js";

export type RestoredCameraTile = { readonly x: number; readonly y: number; readonly ownerId?: string | undefined; readonly fogged?: boolean | undefined };

export type RestoredCameraState = {
  camX: number;
  camY: number;
  camSubX: number;
  camSubY: number;
  readonly zoom: number;
  readonly me: string;
  cameraRestoredFromStorage: boolean;
  readonly cameraRestoredPlayerId: string | null | undefined;
  readonly tiles: ReadonlyMap<string, RestoredCameraTile>;
};

export type ViewportPx = { readonly width: number; readonly height: number };

/**
 * The true-3D camera is tilted, so it shows more rows toward the horizon than the flat 2D view of the
 * same zoom. Widening the window errs toward keeping the player's chosen view.
 */
export const RESTORED_VIEW_PAD = 1.5;

/** Used when there is no window (tests, workers): a typical desktop viewport. */
const FALLBACK_VIEWPORT: ViewportPx = { width: 1280, height: 800 };

const currentViewport = (): ViewportPx =>
  typeof window === "undefined" || !window.innerWidth || !window.innerHeight
    ? FALLBACK_VIEWPORT
    : { width: window.innerWidth, height: window.innerHeight };

/** Shortest signed distance from `from` to `to` on a wrapping axis of `size` tiles. */
const wrappedDelta = (from: number, to: number, size: number): number => {
  let d = (to - from) % size;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
};

/** Tiles from the centre to the edge of the view along each axis at `zoom` (pixels per tile), padded. */
export const restoredViewHalfExtents = (zoom: number, viewport: ViewportPx): { halfW: number; halfH: number } => {
  const tilePx = zoom > 0 ? zoom : DEFAULT_ZOOM;
  return {
    halfW: Math.ceil((viewport.width / tilePx / 2) * RESTORED_VIEW_PAD),
    halfH: Math.ceil((viewport.height / tilePx / 2) * RESTORED_VIEW_PAD)
  };
};

/**
 * Moves a restored camera whose view holds no visible tile to the player's own tile nearest that spot
 * (wrap-aware). Leaves it alone for a ?x=&y= deep link (cameraRestoredPlayerId null), when no restore
 * happened, or when none of the player's tiles are known yet. Returns true when it moved the camera.
 */
export const recentreRestoredCameraOverFog = (state: RestoredCameraState, viewport: ViewportPx = currentViewport()): boolean => {
  if (!state.cameraRestoredFromStorage || state.cameraRestoredPlayerId === null || !state.me) return false;
  const { halfW, halfH } = restoredViewHalfExtents(state.zoom, viewport);
  let nearest: RestoredCameraTile | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const tile of state.tiles.values()) {
    const dx = Math.abs(wrappedDelta(state.camX, tile.x, WORLD_WIDTH));
    const dy = Math.abs(wrappedDelta(state.camY, tile.y, WORLD_HEIGHT));
    if (!tile.fogged && dx <= halfW && dy <= halfH) return false;
    if (tile.ownerId !== state.me) continue;
    const distance = Math.max(dx, dy);
    if (distance < nearestDistance) {
      nearest = tile;
      nearestDistance = distance;
    }
  }
  if (!nearest) return false;
  state.camX = nearest.x;
  state.camY = nearest.y;
  state.camSubX = 0;
  state.camSubY = 0;
  // Consumed: the CHUNK handler's one-shot restore guard (client-network.ts) has nothing left to protect.
  state.cameraRestoredFromStorage = false;
  return true;
};
