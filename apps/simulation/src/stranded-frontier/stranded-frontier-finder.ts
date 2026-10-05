/**
 * Stranded-frontier finder: which of an owner's FRONTIER tiles can no longer
 * reach a supply terminal (one of the owner's SETTLED tiles, or one of the
 * owner's FRONTIER tiles that carries a dock) through the owner's own frontier
 * tiles. Same connectivity rule as encirclement.ts (8-neighbours, plus any
 * extra links such as active Aether bridges); this module only exists to run
 * that rule on demand for tiles nothing has re-checked since they were cut
 * off (see docs/stranded-frontier-cleanup-plan.md).
 *
 * Cost model -- this runs on the sim main thread, so it must stay cheap:
 * - Works one connected frontier component at a time and stops the moment any
 *   member is a terminal or touches one. A connected tile next to settled land
 *   resolves after its own 8 neighbour lookups.
 * - Index-based queue (no Array#shift) and coordinates read from the tile, so a
 *   component costs O(members x neighbours) map lookups and nothing more.
 * - `maxVisited` caps the total tiles explored per call. Hitting it fails open:
 *   the component being explored is left alone (never released on partial
 *   evidence) and `capped` is reported so callers can count it.
 */

import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export type StrandedFrontierTileView = {
  x: number;
  y: number;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
};

export type FindStrandedFrontierInput = {
  seedKeys: Iterable<string>;
  ownerId: string;
  getTile: (key: string) => StrandedFrontierTileView | undefined;
  /** Extra connectivity links (e.g. active Aether bridge endpoints). Only called on the slow path. */
  extraNeighborKeys?: (tileKey: string) => Iterable<string>;
  maxVisited: number;
};

export type FindStrandedFrontierResult = {
  /** FRONTIER tiles in fully explored components that reach no terminal. */
  stranded: string[];
  /** Tiles explored across all components. */
  visited: number;
  /** True when `maxVisited` stopped exploration; that component was left alone. */
  capped: boolean;
};

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
];

const isTerminal = (tile: StrandedFrontierTileView): boolean =>
  tile.ownershipState === "SETTLED" || (tile.ownershipState === "FRONTIER" && Boolean(tile.dockId));

export const findStrandedFrontier = (input: FindStrandedFrontierInput): FindStrandedFrontierResult => {
  const { ownerId, getTile, extraNeighborKeys, maxVisited } = input;
  const classified = new Set<string>();
  const stranded: string[] = [];
  let visited = 0;

  for (const seedKey of input.seedKeys) {
    if (classified.has(seedKey)) continue;
    const seed = getTile(seedKey);
    if (!seed || seed.ownerId !== ownerId || seed.ownershipState !== "FRONTIER") continue;

    const component: string[] = [seedKey];
    const seen = new Set<string>(component);
    let connected = false;
    let head = 0;

    explore: while (head < component.length) {
      const key = component[head]!;
      head += 1;
      const tile = getTile(key);
      if (!tile) continue;
      if (tile.dockId) { connected = true; break; }

      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const neighborKey = `${wrapX(tile.x + dx, WORLD_WIDTH)},${wrapY(tile.y + dy, WORLD_HEIGHT)}`;
        if (seen.has(neighborKey)) continue;
        const neighbor = getTile(neighborKey);
        if (!neighbor || neighbor.ownerId !== ownerId) continue;
        if (isTerminal(neighbor)) { connected = true; break explore; }
        if (neighbor.ownershipState === "FRONTIER") {
          seen.add(neighborKey);
          component.push(neighborKey);
        }
      }
      if (extraNeighborKeys) {
        for (const neighborKey of extraNeighborKeys(key)) {
          if (seen.has(neighborKey)) continue;
          const neighbor = getTile(neighborKey);
          if (!neighbor || neighbor.ownerId !== ownerId) continue;
          if (isTerminal(neighbor)) { connected = true; break explore; }
          if (neighbor.ownershipState === "FRONTIER") {
            seen.add(neighborKey);
            component.push(neighborKey);
          }
        }
      }
      if (visited + seen.size > maxVisited) {
        return { stranded, visited: visited + seen.size, capped: true };
      }
    }

    visited += seen.size;
    // Everything discovered belongs to this one component, so an early
    // "connected" exit classifies the not-yet-expanded members too.
    for (const key of seen) classified.add(key);
    if (!connected) stranded.push(...component);
  }

  return { stranded, visited, capped: false };
};
