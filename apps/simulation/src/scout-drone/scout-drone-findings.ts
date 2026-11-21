import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_VISION_RADIUS, type ScoutFind, type ScoutReportFindings } from "@border-empires/shared";

import { revealedResourceValueForPlayer } from "../tech-domain-bridge/tech-resource-reveal.js";

// What a scout drone saw on its way out (docs/explore-scout-plan.md §4):
// towns, docks, unclaimed waystations, dormant watchtowers, resource tiles,
// Planetary Defense tiles and other empires. Each tile counts once per
// flight. The viewer's own and allied land is skipped, so the report lists
// only what is new to them. The vision square is the drone's radius-3 box.

export type ScoutFindings = {
  /** Walks the drone's vision square at a step; returns what it found there that this flight had not seen yet. */
  readonly observe: (x: number, y: number, viewer: DomainPlayer) => ScoutFind[];
  readonly seenTileCount: () => number;
  readonly counts: () => ScoutReportFindings;
};

const wrap = (v: number, size: number): number => ((v % size) + size) % size;

export const createScoutFindings = (
  tiles: () => ReadonlyMap<string, DomainTileState>,
  width: number,
  height: number
): ScoutFindings => {
  // Bounded by the flight: at most (2r+1)^2 tiles per outbound step.
  const seen = new Set<string>();
  const result: ScoutReportFindings = { towns: 0, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
  const empires = new Set<string>();
  const resourceCounts = new Map<string, number>();
  const r = SCOUT_DRONE_VISION_RADIUS;
  // Lower rank = more notable. Ties go to the latest tile seen: the flight is observed outbound,
  // so a later tile is farther from home, and a known town by the border never hides a new find.
  let focus: { x: number; y: number; rank: number } | undefined;
  const consider = (rank: number, x: number, y: number): void => {
    if (!focus || rank <= focus.rank) focus = { x, y, rank };
  };
  return {
    observe: (x, y, viewer) => {
      const found: ScoutFind[] = [];
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const tx = wrap(x + dx, width);
          const ty = wrap(y + dy, height);
          const key = `${tx},${ty}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const tile = tiles().get(key);
          if (!tile) continue;
          const owner = tile.ownerId;
          if (owner && (owner === viewer.id || viewer.allies.has(owner))) continue;
          if (owner?.startsWith("barbarian-")) {
            // One pop for Planetary Defense ground per flight, not one per tile.
            if (result.planetaryDefenseTiles === 0) found.push({ kind: "defense", x: tx, y: ty });
            result.planetaryDefenseTiles += 1;
            consider(6, tx, ty);
          } else if (owner && !empires.has(owner)) {
            empires.add(owner);
            result.empiresSighted.push(owner);
            consider(5, tx, ty);
            found.push({ kind: "empire", x: tx, y: ty });
          }
          if (tile.town) {
            result.towns += 1;
            consider(0, tx, ty);
            found.push({ kind: "town", x: tx, y: ty });
          }
          if (tile.dockId) {
            result.docks += 1;
            consider(1, tx, ty);
            found.push({ kind: "dock", x: tx, y: ty });
          }
          if (tile.waystation) {
            result.waystations += 1;
            consider(2, tx, ty);
            found.push({ kind: "waystation", x: tx, y: ty });
          }
          if (tile.watchtower && !tile.watchtower.activated) {
            result.watchtowers += 1;
            consider(3, tx, ty);
            found.push({ kind: "watchtower", x: tx, y: ty });
          }
          const resource = revealedResourceValueForPlayer(tile.resource, viewer);
          if (resource) {
            result.resourceTiles += 1;
            consider(4, tx, ty);
            resourceCounts.set(resource, (resourceCounts.get(resource) ?? 0) + 1);
            found.push({ kind: "resource", x: tx, y: ty, resource });
          }
        }
      }
      return found;
    },
    seenTileCount: () => seen.size,
    counts: () => ({
      ...result,
      empiresSighted: [...result.empiresSighted],
      resourcesSighted: Array.from(resourceCounts, ([resource, count]) => ({ resource, count })),
      // Every tile the drone saw, out and home: the report card's "+N Tiles" (review 2026-11-21: a client-side
      // count of newly discovered tiles mixed in other reveals and reset on reload).
      tilesSeen: seen.size,
      ...(focus ? { focusX: focus.x, focusY: focus.y } : {})
    })
  };
};

export const scoutFindingsReport = (findings: ScoutFindings): ScoutReportFindings => findings.counts();
