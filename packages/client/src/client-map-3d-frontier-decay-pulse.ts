import { Color } from "three";
import { OUT_OF_REACH_DECAY_MS, type FrontierDecayKind } from "@border-empires/shared";
import type { OwnershipOverlay } from "./client-map-3d-ownership-overlay.js";

// The frontier-decay countdown color pulse used to be baked directly into
// ownerColor inside rebuildVisibleTerrain, sampling Date.now() at rebuild
// time. rebuildVisibleTerrain also reruns on every camera pan/zoom (not just
// on actual game-state changes), so the pulse visibly jumped/restarted every
// time the camera moved instead of animating smoothly. This tracker holds
// the small list of currently-decaying frontier tiles (rebuilt alongside the
// terrain, same throttle as before) and re-colors just those tiles every
// frame via OwnershipOverlay's partial-update API -- matching the pattern
// already used by renderReachOverlay3DPylons/attackOverlay.tick in
// client-map-3d.ts: placement/animation runs unconditionally every frame,
// only the underlying data is throttled.
export type DecayingFrontierTile = {
  readonly index: number;
  readonly isHill: boolean;
  readonly frontierDecayAt: number;
  readonly frontierDecayKind: FrontierDecayKind | undefined;
  readonly baseColor: Color;
};

export type FrontierDecayPulseTracker = {
  readonly reset: () => void;
  readonly track: (entry: DecayingFrontierTile) => void;
  readonly render: (nowMs: number, overlay: OwnershipOverlay) => void;
};

export const createFrontierDecayPulseTracker = (): FrontierDecayPulseTracker => {
  let tiles: DecayingFrontierTile[] = [];
  const tmpColor = new Color();
  const tmpWhite = new Color("#ffffff");
  const tmpDecayAmber = new Color("#ffb03b");

  const reset = (): void => {
    tiles = [];
  };

  const track = (entry: DecayingFrontierTile): void => {
    tiles.push(entry);
  };

  const render = (nowMs: number, overlay: OwnershipOverlay): void => {
    if (tiles.length === 0) return;
    overlay.beginFrontierColorUpdates();
    for (const tile of tiles) {
      const remainingMs = tile.frontierDecayAt - nowMs;
      const windowMs = tile.frontierDecayKind === "OUT_OF_REACH" ? OUT_OF_REACH_DECAY_MS : 60_000;
      if (remainingMs <= 0 || remainingMs > windowMs) continue;
      const blink = 0.5 + 0.5 * Math.sin((nowMs / 2_000) * Math.PI * 2);
      tmpColor.copy(tile.baseColor).lerp(tile.frontierDecayKind === "OUT_OF_REACH" ? tmpDecayAmber : tmpWhite, blink * 0.35);
      if (tile.isHill) overlay.setFrontierHillTileColor(tile.index, tmpColor);
      else overlay.setFrontierTileColor(tile.index, tmpColor);
    }
  };

  return { reset, track, render };
};
