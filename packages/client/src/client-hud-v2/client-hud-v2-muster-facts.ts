// A muster flag's size and order in the tile panel's fact strip. The staged/cap
// figure used to live only in the muster buttons' tooltips, which a phone never
// shows, so tapping a flag gave no way to read its size (2026-11-16 playtest).

import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { musterStagedAndCap } from "../client-muster-tile-actions.js";
import type { TileFact } from "./client-hud-v2-tile-facts.js";

const musterOrder = (muster: NonNullable<Tile["muster"]>): string => {
  if (muster.mode === "HOLD") return "Hold";
  if (muster.mode === "MARCH") return "March";
  return "Advance";
};

/** Facts for your own muster flag on this tile; empty for anything else. */
export const musterFactsFor = (
  tile: Tile | undefined,
  state: Pick<ClientState, "me" | "manpowerCap" | "manpower" | "musterAmountRateByTile">
): TileFact[] => {
  // Your flag on your tile: a flag left on a tile a rival just took, or a stale flag owner, shows nothing.
  if (!tile?.muster || !state.me || tile.ownerId !== state.me || tile.muster.ownerId !== state.me) return [];
  const size = musterStagedAndCap(tile, state);
  if (!size) return [];
  return [
    { label: "Muster", value: `${size.staged} / ${size.cap} manpower`, ...(size.staged >= size.cap ? { tone: "good" as const } : {}) },
    { label: "Order", value: musterOrder(tile.muster) }
  ];
};

/**
 * The flag's facts first, then the tile's; when that is too many, the tile's plain facts give way before
 * its warnings (an unfed town, a dormant building), which must stay visible.
 */
export const leadWithMusterFacts = (muster: readonly TileFact[], tile: readonly TileFact[], max: number): TileFact[] => {
  const out = [...muster, ...tile];
  for (let i = out.length - 1; out.length > max && i >= muster.length; i -= 1) {
    if (out[i]?.tone !== "warn") out.splice(i, 1);
  }
  return out.slice(0, max);
};
