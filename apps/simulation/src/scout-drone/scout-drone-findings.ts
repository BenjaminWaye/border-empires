import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_VISION_RADIUS, SCOUT_FINDING_SITES_MAX_TILES, type ScoutFind, type ScoutFindingSites, type ScoutFindingTile, type ScoutReportFindings } from "@border-empires/shared";

import { revealedResourceValueForPlayer } from "../tech-domain-bridge/tech-resource-reveal.js";

// What a scout drone saw on its way out (docs/explore-scout-plan.md §4):
// towns, docks, unclaimed waystations, dormant watchtowers, resource tiles,
// Planetary Defense tiles and other empires. Each tile counts once per
// flight. The viewer's own and allied land is skipped, so the report lists
// only what is new to them. The vision square is the drone's radius-3 box.
// Each find group also keeps where it was (capped), so the Chronicle can jump to it.

export type ScoutFindings = {
  /** Walks the drone's vision square at a step; returns what it found there that this flight had not seen yet. */
  readonly observe: (x: number, y: number, viewer: DomainPlayer) => ScoutFind[];
  readonly seenTileCount: () => number;
  readonly counts: () => ScoutReportFindings;
};

const wrap = (v: number, size: number): number => ((v % size) + size) % size;

const keep = (list: ScoutFindingTile[], x: number, y: number): void => {
  if (list.length < SCOUT_FINDING_SITES_MAX_TILES) list.push({ x, y });
};

const keepKeyed = (groups: Record<string, ScoutFindingTile[]>, key: string, x: number, y: number): void => {
  keep((groups[key] ??= []), x, y);
};

const copyKeyed = (groups: Record<string, ScoutFindingTile[]>): Record<string, ScoutFindingTile[]> =>
  Object.fromEntries(Object.entries(groups).map(([key, tiles]) => [key, tiles.map((t) => ({ ...t }))]));

export const createScoutFindings = (
  tiles: () => ReadonlyMap<string, DomainTileState>,
  width: number,
  height: number
): ScoutFindings => {
  // Bounded by the flight: at most (2r+1)^2 tiles per outbound step.
  const seen = new Set<string>();
  const result: ScoutReportFindings = { towns: 0, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
  const sites: ScoutFindingSites = { towns: [], docks: [], waystations: [], watchtowers: [], planetaryDefense: [], resources: {}, empires: {} };
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
            keep(sites.planetaryDefense, tx, ty);
            consider(6, tx, ty);
          } else if (owner) {
            if (!empires.has(owner)) {
              empires.add(owner);
              result.empiresSighted.push(owner);
              consider(5, tx, ty);
              found.push({ kind: "empire", x: tx, y: ty });
            }
            keepKeyed(sites.empires, owner, tx, ty);
          }
          if (tile.town) {
            result.towns += 1;
            keep(sites.towns, tx, ty);
            consider(0, tx, ty);
            found.push({ kind: "town", x: tx, y: ty });
          }
          if (tile.dockId) {
            result.docks += 1;
            keep(sites.docks, tx, ty);
            consider(1, tx, ty);
            found.push({ kind: "dock", x: tx, y: ty });
          }
          if (tile.waystation) {
            result.waystations += 1;
            keep(sites.waystations, tx, ty);
            consider(2, tx, ty);
            found.push({ kind: "waystation", x: tx, y: ty });
          }
          if (tile.watchtower && !tile.watchtower.activated) {
            result.watchtowers += 1;
            keep(sites.watchtowers, tx, ty);
            consider(3, tx, ty);
            found.push({ kind: "watchtower", x: tx, y: ty });
          }
          const resource = revealedResourceValueForPlayer(tile.resource, viewer);
          if (resource) {
            result.resourceTiles += 1;
            consider(4, tx, ty);
            resourceCounts.set(resource, (resourceCounts.get(resource) ?? 0) + 1);
            keepKeyed(sites.resources, resource, tx, ty);
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
      sites: {
        towns: sites.towns.map((t) => ({ ...t })),
        docks: sites.docks.map((t) => ({ ...t })),
        waystations: sites.waystations.map((t) => ({ ...t })),
        watchtowers: sites.watchtowers.map((t) => ({ ...t })),
        planetaryDefense: sites.planetaryDefense.map((t) => ({ ...t })),
        resources: copyKeyed(sites.resources),
        empires: copyKeyed(sites.empires)
      },
      // Every tile the drone saw, out and home: the report card's "+N Tiles" (review 2026-11-21: a client-side
      // count of newly discovered tiles mixed in other reveals and reset on reload).
      tilesSeen: seen.size,
      ...(focus ? { focusX: focus.x, focusY: focus.y } : {})
    })
  };
};

export const scoutFindingsReport = (findings: ScoutFindings): ScoutReportFindings => findings.counts();
