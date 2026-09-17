import { Color } from "three";
import type { OwnershipOverlay } from "./client-map-3d-ownership-overlay.js";

// Tint-expansion effect for a barbarian tile eating a neutral/frontier tile
// (bare land, no town) — the routine one-tile expansion the barbarian
// planner does constantly (system-job-barbarian-planner.ts), as opposed to
// fighting a settled town (which already gets its own capture-shock/smoke
// treatment elsewhere and keeps the Voidcrystal Colossus's Attack
// animation — see client-map-3d-barbarian-overlay.ts). Without this, a
// frontier tile flipping to barbarian ownership was an instant, jarring
// pop the moment the server applied the capture.
//
// Same shape and wiring pattern as client-map-3d-frontier-decay-pulse.ts
// (the existing precedent for animating one already-committed
// OwnershipOverlay tile's color every frame via its partial-update API,
// instead of touching OwnershipOverlay itself): reset() once per rebuild,
// observeTile() during the per-tile scan to detect a tile that just
// BECAME barbarian-owned frontier land (comparing against the previous
// rebuild's set) and register a fade-in window for it, track() right
// after addTile/addHillTile to capture that tile's THIS-FRAME buffer
// index (buckets are fully rebuilt every frame, so the index can't be
// cached across frames), and render() after commit() to write the
// interpolated color for every tile still inside its fade-in window.
const TINT_EXPANSION_MS = 1500;

type TileKey = string;

type ActiveTransition = {
  readonly startAt: number;
  readonly ownerColor: Color;
};

type TrackedTile = {
  readonly index: number;
  readonly isHill: boolean;
  readonly transition: ActiveTransition;
};

export type BarbarianFrontierTintTracker = {
  // Call once per rebuild, before scanning tiles (mirrors
  // ownershipOverlay.clear() / frontierDecayPulse.reset()). Also prunes
  // any in-flight transition that wasn't reconfirmed as barbarian-frontier
  // on the immediately preceding rebuild, or whose window has elapsed --
  // this is the map's only eviction point, and it bounds activeTransitions
  // to (at most) last frame's barbarian-frontier tile count, so a tile
  // that flips away mid-fade (recaptured by a player, or promoted to
  // settled) can't leak an entry forever.
  readonly reset: (nowMs: number) => void;
  // Call once per barbarian-owned frontier tile during the scan, BEFORE
  // addTile/addHillTile. Returns the active transition if this tile is
  // still inside its fade-in window (whether just-started this frame or
  // continuing from an earlier one), or undefined if it's not currently
  // transitioning (either long-settled barbarian ground, or not
  // barbarian/frontier at all -- callers should only call this for tiles
  // that ARE barbarian-owned frontier land).
  readonly observeTile: (tileKey: TileKey, ownerColor: Color, nowMs: number) => ActiveTransition | undefined;
  // Call right after addTile/addHillTile, only when observeTile returned
  // a transition, passing that same transition back plus the resulting
  // buffer index.
  readonly track: (index: number, isHill: boolean, transition: ActiveTransition) => void;
  readonly render: (nowMs: number, overlay: OwnershipOverlay) => void;
};

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const createBarbarianFrontierTintTracker = (): BarbarianFrontierTintTracker => {
  // Tiles observed as barbarian-frontier as of the LAST completed rebuild
  // -- used to detect "this tile just became barbarian" this frame.
  let previousBarbarianFrontierTiles = new Set<TileKey>();
  let currentBarbarianFrontierTiles = new Set<TileKey>();
  // Active fade-in windows, keyed by tile -- persists across many frames
  // (the whole TINT_EXPANSION_MS window), independent of the per-frame
  // rebuild.
  const activeTransitions = new Map<TileKey, ActiveTransition>();
  // Tiles to actually recolor THIS frame (populated by track(), consumed
  // by render() -- mirrors frontierDecayPulse's own `tiles` array).
  let tracked: TrackedTile[] = [];

  const tmpColor = new Color();
  const neutralBase = new Color("#8f9a84");

  const reset = (nowMs: number): void => {
    previousBarbarianFrontierTiles = currentBarbarianFrontierTiles;
    currentBarbarianFrontierTiles = new Set();
    tracked = [];
    for (const [tileKey, transition] of activeTransitions) {
      if (!previousBarbarianFrontierTiles.has(tileKey) || nowMs - transition.startAt >= TINT_EXPANSION_MS) {
        activeTransitions.delete(tileKey);
      }
    }
  };

  const observeTile = (tileKey: TileKey, ownerColor: Color, nowMs: number): ActiveTransition | undefined => {
    currentBarbarianFrontierTiles.add(tileKey);
    if (!previousBarbarianFrontierTiles.has(tileKey) && !activeTransitions.has(tileKey)) {
      activeTransitions.set(tileKey, { startAt: nowMs, ownerColor: ownerColor.clone() });
    }
    const transition = activeTransitions.get(tileKey);
    if (!transition) return undefined;
    if (nowMs - transition.startAt >= TINT_EXPANSION_MS) {
      activeTransitions.delete(tileKey);
      return undefined;
    }
    return transition;
  };

  const track = (index: number, isHill: boolean, transition: ActiveTransition): void => {
    tracked.push({ index, isHill, transition });
  };

  const render = (nowMs: number, overlay: OwnershipOverlay): void => {
    if (tracked.length === 0) return;
    overlay.beginFrontierColorUpdates();
    for (const tile of tracked) {
      const rawT = Math.min(1, Math.max(0, (nowMs - tile.transition.startAt) / TINT_EXPANSION_MS));
      const t = easeOutCubic(rawT);
      tmpColor.copy(neutralBase).lerp(tile.transition.ownerColor, t);
      if (tile.isHill) overlay.setFrontierHillTileColor(tile.index, tmpColor);
      else overlay.setFrontierTileColor(tile.index, tmpColor);
    }
  };

  return { reset, observeTile, track, render };
};

// Bundles the "is this a barbarian-owned frontier tile" gate with
// observeTile() into one call, so call sites (client-map-3d.ts, already
// over its line budget) don't need their own inline condition.
export const observeBarbarianFrontierTint = (
  tracker: BarbarianFrontierTintTracker,
  ownerId: string | undefined,
  ownershipState: string | undefined,
  tileKey: TileKey,
  ownerColor: Color
): ActiveTransition | undefined =>
  ownerId === "barbarian-1" && ownershipState === "FRONTIER" ? tracker.observeTile(tileKey, ownerColor, Date.now()) : undefined;
