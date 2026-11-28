// A short-lived marker on the map where something the player did was confirmed by the server: "+1 tile"
// on a claimed tile, "Hydrogarden started" on its tile, "Trade agreed" on the other House's land
// (first-15 playtest round 1: no "accepted!" moment, builds and claims closed with no confirmation).
// It replaces a top-of-screen toast: the owner asked for indicators on the map that fade, with an arrow
// at the screen edge when the tile is off-screen (2026-11-28). Callers raise a marker only on a server
// message, never when the order is sent. client-action-marker-layer.ts draws them.
//
// A marker respects the notice gate (client-notice-gate.ts): while a sheet or modal covers the map, or the
// player is mid-tap, it waits, and its fade clock starts only once the map is clear. A deal agreed while
// the Diplomacy screen is open still shows when the player closes it. A marker that waits too long is dropped.

/** How long a marker is on screen once shown: a pulse, the label, then a fade. */
export const ACTION_MARKER_MS = 4_000;
/** A marker held back by the notice gate longer than this is dropped unseen (stale news). */
export const ACTION_MARKER_WAIT_MS = 60_000;
/** At most this many markers at once; the oldest goes first. */
export const ACTION_MARKER_CAP = 8;
/** The fade-out takes this last share of a marker's life. */
const FADE_OUT_SHARE = 0.4;
const FADE_IN_MS = 150;

export type ActionMarker = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly queuedAt: number;
  /** When the marker was first shown; undefined while the notice gate holds it. */
  startedAt: number | undefined;
};

export type ShownActionMarker = ActionMarker & { startedAt: number };

let nextId = 1;
const markers: ActionMarker[] = [];

/** Puts a marker on tile (x, y). A newer marker on the same tile replaces the old one. */
export const showActionMarker = (x: number, y: number, label: string, nowMs = Date.now()): void => {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !label.trim()) return;
  const same = markers.findIndex((marker) => marker.x === x && marker.y === y);
  if (same >= 0) markers.splice(same, 1);
  markers.push({ id: nextId++, x, y, label: label.trim(), queuedAt: nowMs, startedAt: undefined });
  while (markers.length > ACTION_MARKER_CAP) markers.shift();
};

/**
 * The markers to draw now, oldest first. Drops finished and stale ones. While `held` (the notice gate is
 * closed) nothing new starts; once it opens, every waiting marker starts its clock at `nowMs`.
 */
export const liveActionMarkers = (nowMs: number, held: boolean): ShownActionMarker[] => {
  const live: ShownActionMarker[] = [];
  for (let i = markers.length - 1; i >= 0; i -= 1) {
    const marker = markers[i];
    if (!marker) continue;
    const done = marker.startedAt === undefined ? nowMs - marker.queuedAt > ACTION_MARKER_WAIT_MS : nowMs - marker.startedAt >= ACTION_MARKER_MS;
    if (done) markers.splice(i, 1);
  }
  for (const marker of markers) {
    if (marker.startedAt === undefined && !held) marker.startedAt = nowMs;
    if (marker.startedAt !== undefined) live.push(marker as ShownActionMarker);
  }
  return live;
};

/** 0..1 opacity: a quick fade in, full strength, then a fade over the last part of its life. */
export const actionMarkerOpacity = (marker: ShownActionMarker, nowMs: number): number => {
  const age = nowMs - marker.startedAt;
  if (age < 0 || age >= ACTION_MARKER_MS) return 0;
  const fadeInto = Math.min(1, age / FADE_IN_MS);
  const fadeStart = ACTION_MARKER_MS * (1 - FADE_OUT_SHARE);
  const fadeOut = age <= fadeStart ? 1 : 1 - (age - fadeStart) / (ACTION_MARKER_MS - fadeStart);
  return Math.max(0, Math.min(1, fadeInto * fadeOut));
};

/** Test helper. */
export const resetActionMarkers = (): void => {
  markers.length = 0;
};

/** Test helper: every marker, shown or waiting. */
export const pendingActionMarkers = (): readonly ActionMarker[] => markers;
