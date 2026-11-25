// What a relic site's plate says and where it stands. Pure, so the layer
// (relic-site-plates.ts) stays a thin DOM writer and this is testable.
//
// The plate replaced a bare light column and a hollow square that said
// nothing (player report 2026-11-25: "how am I supposed to know what a needle
// means?"). A rival's aether wake reads "Concordance relic" with the House
// operating it; a transponder in signal range reads "Relic signal".
import { WORLD_HEIGHT, WORLD_WIDTH, type NaturalWonderState, type RelicMapHint } from "@border-empires/shared";
import { shouldDrawRelicHint } from "./relic-map-hints.js";

export type RelicSitePlate = {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly kind: "WAKE" | "RELIC";
  readonly title: string;
  readonly detail: string;
  readonly ownerId?: string;
};

export const RELIC_WAKE_TITLE = "Concordance relic";
export const RELIC_SIGNAL_TITLE = "Relic signal";

/** Behind the card's "?": what a relic is (docs/lore/galactic-lore.md, Surviving relic installations). */
export const RELIC_EXPLAINER =
  "An old Concordance installation, dormant until a House garrisons it. Running, it gives its holder a lasting bonus. Capture and garrison it to take it over.";

/** The plate for one hint, or none: survey signatures keep their own marks, and a transponder already on the map needs none. */
export const relicSitePlateFor = (
  hint: RelicMapHint | undefined,
  tile: { naturalWonder?: NaturalWonderState | null | undefined } | undefined,
  me: string,
  ownerName: (ownerId: string) => string | undefined
): RelicSitePlate | undefined => {
  if (!shouldDrawRelicHint(hint, tile) || hint.kind === "RESOURCE") return undefined;
  const key = `${hint.x},${hint.y}`;
  if (hint.kind === "RELIC") return { key, x: hint.x, y: hint.y, kind: "RELIC", title: RELIC_SIGNAL_TITLE, detail: "In signal range" };
  if (hint.ownerId === me) return undefined;
  return { key, x: hint.x, y: hint.y, kind: "WAKE", title: RELIC_WAKE_TITLE, detail: `${ownerName(hint.ownerId) ?? "A rival House"} · running`, ownerId: hint.ownerId };
};

/** Signed shortest offset from `from` to `to` on a wrapping axis. */
export const wrappedDelta = (from: number, to: number, size: number): number => {
  const d = (((to - from) % size) + size) % size;
  return d > size / 2 ? d - size : d;
};

/** Tiles from the camera to the site, across the world's wrap. */
export const tilesFromCamera = (camX: number, camY: number, x: number, y: number): number =>
  Math.round(Math.hypot(wrappedDelta(camX, x, WORLD_WIDTH), wrappedDelta(camY, y, WORLD_HEIGHT)));

export type ScreenInsets = { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };

/**
 * Clamps an off-screen point onto the inset screen rectangle along the ray from
 * the rectangle's centre, and gives the ray's angle for the tab's arrow.
 * Undefined when the point is already inside.
 */
export const edgeTabPoint = (
  sx: number,
  sy: number,
  width: number,
  height: number,
  insets: ScreenInsets
): { x: number; y: number; angle: number } | undefined => {
  const left = insets.left, right = Math.max(left + 1, width - insets.right);
  const top = insets.top, bottom = Math.max(top + 1, height - insets.bottom);
  if (sx >= left && sx <= right && sy >= top && sy <= bottom) return undefined;
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const dx = sx - cx, dy = sy - cy;
  const scaleX = dx !== 0 ? (right - left) / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? (bottom - top) / 2 / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY, 1);
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
};

/**
 * While the player is picking a map point (scout waypoints, a march origin or
 * target), a tap on a relic is that pick, not the relic's card: plates let the
 * tap through to the map and the tile tap does not open the card.
 */
export const mapPointPickArmed = (state: {
  readonly scoutDronePicking: { readonly active: boolean };
  readonly marchOriginPicking: { readonly active: boolean };
  readonly musterMarchTargeting: { readonly active: boolean };
}): boolean => state.scoutDronePicking.active || state.marchOriginPicking.active || state.musterMarchTargeting.active;
