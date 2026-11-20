// Rings on the tiles of one scout drone find, after its chip is clicked in the
// Chronicle (client-hud-v2-chronicle-scout-chips.ts). Both map renderers draw
// them through the map guide's ring markers: client-map-guide-overlays-2d.ts
// on the 2D canvas and client-map-3d-map-guide-overlay.ts in true 3D.

import type { ScoutFindingTile } from "@border-empires/shared";

/** How long a find stays ringed after its chip is clicked. */
export const SCOUT_FINDING_HIGHLIGHT_MS = 8_000;

export type ScoutFindingHighlight = { tiles: ScoutFindingTile[]; until: number };

export const showScoutFindingHighlight = (
  state: { scoutFindingHighlight: ScoutFindingHighlight | undefined },
  tiles: readonly ScoutFindingTile[],
  wallNowMs: number
): void => {
  state.scoutFindingHighlight = tiles.length > 0 ? { tiles: tiles.map((t) => ({ x: t.x, y: t.y })), until: wallNowMs + SCOUT_FINDING_HIGHLIGHT_MS } : undefined;
};

/** The tiles to ring now (wall clock, not the renderers' performance.now()); empty once the highlight has run out. */
export const scoutFindingRingTiles = (state: { scoutFindingHighlight?: ScoutFindingHighlight | undefined }, wallNowMs: number): readonly ScoutFindingTile[] => {
  const highlight = state.scoutFindingHighlight;
  return highlight && wallNowMs < highlight.until ? highlight.tiles : [];
};
