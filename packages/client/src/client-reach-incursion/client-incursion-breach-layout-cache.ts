import { recordClientDebugEvent } from "../client-debug/client-debug.js";
import { NEIGHBOUR_OFFSETS, incursionBreachLayout, type BreachNeighbourKind, type IncursionBreachLayout } from "./client-incursion-breach-layout.js";
import type { IncursionBreachStyle } from "./client-incursion-breach-style.js";

// The spikes front line is the costly layout (noise-warped polygons, about a
// hundred points a side) and the 3D terrain rebuild asks for it for every
// visible pocket tile on every rebuild. It depends only on the tile's world
// position and its 8 neighbours' kinds (client-incursion-breach-front.ts never
// looks further out), so cache it on exactly that. The other styles are cheap
// (and the ember / ink band looks two tiles out), so they skip the cache.

/** Hard bound: a few screens' worth of pocket tiles. Over it, the cache starts again from empty. */
export const MAX_CACHED_BREACH_LAYOUTS = 8192;

const cache = new Map<string, IncursionBreachLayout>();
let clears = 0;

export const cachedIncursionBreachLayout = (
  style: IncursionBreachStyle,
  kindAt: (dx: number, dy: number) => BreachNeighbourKind,
  worldX: number,
  worldY: number
): IncursionBreachLayout => {
  if (style !== "spikes") return incursionBreachLayout(style, kindAt, worldX, worldY);
  // Kinds start with distinct letters (pocket / rival / mine / other).
  const key = `${worldX},${worldY}|${NEIGHBOUR_OFFSETS.map(([dx, dy]) => kindAt(dx, dy)[0]).join("")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= MAX_CACHED_BREACH_LAYOUTS) {
    cache.clear();
    clears += 1;
    recordClientDebugEvent("info", "incursion-breach-layout-cache", "clear", { max: MAX_CACHED_BREACH_LAYOUTS, clears });
  }
  const layout = incursionBreachLayout(style, kindAt, worldX, worldY);
  cache.set(key, layout);
  return layout;
};

export const incursionBreachLayoutCacheStats = (): { readonly size: number; readonly clears: number } => ({ size: cache.size, clears });
