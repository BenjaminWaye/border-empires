import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { deviationFromMarchLine } from "./muster-march-pathfinding.js";

/**
 * How far either side of the traced march path a flag may expand or fight.
 * 1 gives a spear three tiles wide: wide enough to keep moving while the
 * tile on the path is locked in a fight, narrow enough that the march no
 * longer floods the whole area between the flag and its target.
 */
export const MARCH_PATH_BAND_RADIUS = 1;

/**
 * How far either side of the traced path the owned-land walk may go beyond
 * its local radius (ADVANCE_MAX_RANGE_TILES around the flag). Wider than the
 * candidate band so the walk can reach every front tile in that band, while
 * staying a strip along the route rather than the whole diamond between the
 * flag and the target.
 */
export const MARCH_WALK_BAND_RADIUS = 2;

/**
 * Traces the single route a march follows: from the flag, step to the
 * neighbour (or dock/bridge crossing) one step closer to the target on the
 * terrain distance field, choosing the one nearest the ruler-drawn flag ->
 * target line when several are. Chebyshev movement makes every tile in a wide
 * diamond "on a shortest route", so ranking candidates by route length alone
 * let a march spread over that whole diamond; candidates are held to a band
 * around this one path instead (see bandAroundPath).
 *
 * Only steps onto tiles `passable` accepts, so when the flood never reached
 * the flag (straight-line fallback distances) the path still goes round water
 * and mountains instead of straight across them.
 *
 * Returns the set of tile keys on the path, flag and target included. Stops
 * early when no neighbour gets closer (unreachable target), so it costs at
 * most maxSteps * 8 lookups.
 */
export const traceMarchPath = (
  flag: { x: number; y: number },
  target: { x: number; y: number },
  distanceToTarget: (x: number, y: number) => number,
  crossingKeysFor: (key: string) => readonly string[] | undefined,
  maxSteps: number,
  passable: (x: number, y: number) => boolean = () => true
): Set<string> => {
  const path = new Set<string>();
  let x = flag.x;
  let y = flag.y;
  let dist = distanceToTarget(x, y);
  path.add(simulationTileKey(x, y));
  for (let step = 0; step < maxSteps && dist > 0; step += 1) {
    let next: { x: number; y: number; dist: number; deviation: number } | undefined;
    const consider = (nx: number, ny: number): void => {
      const nDist = distanceToTarget(nx, ny);
      if (!(nDist < dist) || !passable(nx, ny)) return;
      const deviation = deviationFromMarchLine(flag.x, flag.y, target.x, target.y, nx, ny, WORLD_WIDTH, WORLD_HEIGHT);
      if (!next || nDist < next.dist || (nDist === next.dist && deviation < next.deviation)) next = { x: nx, y: ny, dist: nDist, deviation };
    };
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) consider(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      }
    }
    for (const linked of crossingKeysFor(simulationTileKey(x, y)) ?? []) {
      const [lx, ly] = linked.split(",").map(Number);
      consider(lx!, ly!);
    }
    if (!next) break;
    ({ x, y, dist } = next);
    path.add(simulationTileKey(x, y));
  }
  return path;
};

/** Every tile within `radius` (Chebyshev) of a tile on the path, as keys. */
export const bandAroundPath = (path: ReadonlySet<string>, radius: number): Set<string> => {
  const band = new Set<string>();
  for (const key of path) {
    const [px, py] = key.split(",").map(Number);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) band.add(simulationTileKey(wrapX(px! + dx, WORLD_WIDTH), wrapY(py! + dy, WORLD_HEIGHT)));
    }
  }
  return band;
};
