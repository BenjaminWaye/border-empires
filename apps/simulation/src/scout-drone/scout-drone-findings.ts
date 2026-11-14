import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_VISION_RADIUS, type ScoutReportFindings } from "@border-empires/shared";

// What a scout drone saw on its way out (docs/explore-scout-plan.md §4):
// towns, docks, unclaimed waystations, dormant watchtowers, resource tiles,
// Planetary Defense tiles and other empires. Each tile counts once per
// flight. The viewer's own and allied land is skipped, so the report lists
// only what is new to them. The vision square is the drone's radius-3 box.

export type ScoutFindings = {
  readonly observe: (x: number, y: number, viewer: DomainPlayer) => void;
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
  const r = SCOUT_DRONE_VISION_RADIUS;
  return {
    observe: (x, y, viewer) => {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const key = `${wrap(x + dx, width)},${wrap(y + dy, height)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const tile = tiles().get(key);
          if (!tile) continue;
          const owner = tile.ownerId;
          if (owner && (owner === viewer.id || viewer.allies.has(owner))) continue;
          if (owner?.startsWith("barbarian-")) result.planetaryDefenseTiles += 1;
          else if (owner && !empires.has(owner)) {
            empires.add(owner);
            result.empiresSighted.push(owner);
          }
          if (tile.town) result.towns += 1;
          if (tile.dockId) result.docks += 1;
          if (tile.waystation) result.waystations += 1;
          if (tile.watchtower && !tile.watchtower.activated) result.watchtowers += 1;
          if (tile.resource) result.resourceTiles += 1;
        }
      }
    },
    seenTileCount: () => seen.size,
    counts: () => ({ ...result, empiresSighted: [...result.empiresSighted] })
  };
};

export const scoutFindingsReport = (findings: ScoutFindings): ScoutReportFindings => findings.counts();
