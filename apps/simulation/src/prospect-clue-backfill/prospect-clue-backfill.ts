// Backfills prospect clues for worlds whose tiles never carried them.
//
// Clues are assigned at worldgen (prospectSignatureAt in game-domain), but
// until this branch every recovered-tile builder dropped the field -- so
// every season generated before it has no clues anywhere, including in its
// frozen worldgen_baselines row. That baseline is frozen on purpose (terrain
// must not change under a running season), so it is not regenerated; the
// worldgen clusters themselves are not persisted either. Instead the clusters
// are re-derived from the persisted strategic resource tiles and the same
// radius rule as prospectSignatureAt is applied. Only prospectSignature is
// added -- terrain, resources and ownership are untouched.
//
// Approximation (documented, accepted): a re-derived cluster's center is the
// centroid of its resource tiles and its radius their farthest distance,
// where worldgen used the planned center/radius. Measured on a fresh
// season-20ai world (204,800 tiles, 19,533 worldgen clue tiles): ~95% of the
// real clue tiles recovered, ~97% of assigned clues agree with worldgen,
// ~20ms. Wider reach or a minimum cluster size both measured worse.
import { prospectSignatureForResource, type DomainTileState } from "@border-empires/game-domain";
import type { ProspectSignature } from "@border-empires/shared";

const LINK_DISTANCE = 3;
const STRATEGIC = new Set(["TITANIUM", "GEMS", "UMBRITE"]);

type Point = { x: number; y: number };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const wrappedDelta = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
};

const components = (points: Point[], worldWidth: number, worldHeight: number): Point[][] => {
  const byKey = new Map(points.map((point) => [`${point.x},${point.y}`, point]));
  const seen = new Set<string>();
  const out: Point[][] = [];
  for (const start of points) {
    const startKey = `${start.x},${start.y}`;
    if (seen.has(startKey)) continue;
    seen.add(startKey);
    const group: Point[] = [];
    const queue = [start];
    while (queue.length > 0) {
      const point = queue.pop();
      if (!point) break;
      group.push(point);
      for (let dy = -LINK_DISTANCE; dy <= LINK_DISTANCE; dy += 1) {
        for (let dx = -LINK_DISTANCE; dx <= LINK_DISTANCE; dx += 1) {
          if (Math.abs(dx) + Math.abs(dy) > LINK_DISTANCE) continue;
          const key = `${wrap(point.x + dx, worldWidth)},${wrap(point.y + dy, worldHeight)}`;
          const next = byKey.get(key);
          if (!next || seen.has(key)) continue;
          seen.add(key);
          queue.push(next);
        }
      }
    }
    out.push(group);
  }
  return out;
};

/** Returns the number of tiles that received a clue (0 when the world already has clues). */
export const backfillProspectClues = (tiles: Map<string, DomainTileState>, worldWidth: number, worldHeight: number): number => {
  const pointsBySignature = new Map<ProspectSignature, Point[]>();
  for (const tile of tiles.values()) {
    if (tile.prospectSignature) return 0;
    if (!tile.resource || !STRATEGIC.has(tile.resource)) continue;
    const signature = prospectSignatureForResource(tile.resource);
    if (!signature) continue;
    const list = pointsBySignature.get(signature) ?? [];
    list.push({ x: tile.x, y: tile.y });
    pointsBySignature.set(signature, list);
  }
  const best = new Map<string, { distance: number; signature: ProspectSignature }>();
  for (const [signature, points] of pointsBySignature) {
    for (const group of components(points, worldWidth, worldHeight)) {
      // Centroid relative to the first tile so clusters straddling the world
      // seam average correctly.
      const anchor = group[0];
      if (!anchor) continue;
      const offsetX = group.reduce((sum, p) => sum + (wrap(p.x - anchor.x + worldWidth / 2, worldWidth) - worldWidth / 2), 0) / group.length;
      const offsetY = group.reduce((sum, p) => sum + (wrap(p.y - anchor.y + worldHeight / 2, worldHeight) - worldHeight / 2), 0) / group.length;
      const centerX = wrap(Math.round(anchor.x + offsetX), worldWidth);
      const centerY = wrap(Math.round(anchor.y + offsetY), worldHeight);
      const radius = Math.max(...group.map((p) => wrappedDelta(p.x, centerX, worldWidth) + wrappedDelta(p.y, centerY, worldHeight)));
      // Same reach as prospectSignatureAt: max(8, cluster radius + 6).
      const reach = Math.max(8, radius + 6);
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance > reach) continue;
          const key = `${wrap(centerX + dx, worldWidth)},${wrap(centerY + dy, worldHeight)}`;
          const current = best.get(key);
          if (current && current.distance <= distance) continue;
          best.set(key, { distance, signature });
        }
      }
    }
  }
  let assigned = 0;
  for (const [key, { signature }] of best) {
    const tile = tiles.get(key);
    if (!tile) continue;
    tiles.set(key, { ...tile, prospectSignature: signature });
    assigned += 1;
  }
  return assigned;
};
