// Grid helpers for the strategic-deposit reach pass
// (server-worldgen-strategic-reach.ts). The world wraps on both axes, like
// every other worldgen pass (wrapX/wrapY), so all neighbour and distance
// maths here wraps too. Every buffer is sized to the world and discarded once
// the pass returns; nothing here is cached across calls.

export interface StrategicReachGrid {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
}

export const NOT_IN_REACH = -1;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * Multi-source BFS from every town tile, 8-way steps over LAND tiles only,
 * stopping at `maxSteps`. Returns a per-tile step count (flat index
 * y * WORLD_WIDTH + x), NOT_IN_REACH beyond `maxSteps` or off land. A town
 * tile is always a source even if it is not LAND (it never is in practice).
 */
export const landDistanceFromTowns = (
  grid: StrategicReachGrid,
  townCoords: Iterable<{ x: number; y: number }>,
  isLand: (x: number, y: number) => boolean,
  maxSteps: number
): Int16Array => {
  const { WORLD_WIDTH: width, WORLD_HEIGHT: height } = grid;
  const distance = new Int16Array(width * height).fill(NOT_IN_REACH);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const { x, y } of townCoords) {
    const index = y * width + x;
    if (distance[index] === 0) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const steps = distance[index]!;
    if (steps >= maxSteps) continue;
    const x = index % width;
    const y = (index - x) / width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrap(x + dx, width);
        const ny = wrap(y + dy, height);
        const next = ny * width + nx;
        if (distance[next] !== NOT_IN_REACH) continue;
        if (!isLand(nx, ny)) continue;
        distance[next] = steps + 1;
        queue[tail++] = next;
      }
    }
  }
  return distance;
};

/**
 * 1 where a strategic deposit may not sit: a town tile, a dock tile, or any
 * tile within Chebyshev distance `ringRadius` of a town (both support rings
 * at radius 2).
 */
export const forbiddenDepositMask = (
  grid: StrategicReachGrid,
  townCoords: Iterable<{ x: number; y: number }>,
  dockCoords: Iterable<{ x: number; y: number }>,
  ringRadius: number
): Uint8Array => {
  const { WORLD_WIDTH: width, WORLD_HEIGHT: height } = grid;
  const mask = new Uint8Array(width * height);
  for (const { x, y } of townCoords) {
    for (let dy = -ringRadius; dy <= ringRadius; dy += 1) {
      for (let dx = -ringRadius; dx <= ringRadius; dx += 1) {
        mask[wrap(y + dy, height) * width + wrap(x + dx, width)] = 1;
      }
    }
  }
  for (const { x, y } of dockCoords) mask[y * width + x] = 1;
  return mask;
};

/**
 * Splits a set of tiles into 8-connected components (with wrap). Worldgen
 * collects a cluster's tiles with a 4-way BFS that skips non-habitat tiles,
 * so one cluster can split into several fields; the game treats each
 * connected group as its own field (territory plan Phase 2 rule 3).
 */
export const eightConnectedComponents = (
  grid: StrategicReachGrid,
  coords: ReadonlyArray<{ x: number; y: number }>
): Array<Array<{ x: number; y: number }>> => {
  const { WORLD_WIDTH: width, WORLD_HEIGHT: height } = grid;
  const byIndex = new Map<number, { x: number; y: number }>();
  for (const coord of coords) byIndex.set(coord.y * width + coord.x, coord);
  const seen = new Set<number>();
  const components: Array<Array<{ x: number; y: number }>> = [];
  for (const coord of coords) {
    const start = coord.y * width + coord.x;
    if (seen.has(start)) continue;
    seen.add(start);
    const component: Array<{ x: number; y: number }> = [];
    const stack = [coord];
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const next = wrap(current.y + dy, height) * width + wrap(current.x + dx, width);
          const neighbour = byIndex.get(next);
          if (!neighbour || seen.has(next)) continue;
          seen.add(next);
          stack.push(neighbour);
        }
      }
    }
    components.push(component);
  }
  return components;
};

/**
 * The reach guarantee for one placement: no tile is forbidden, and every
 * 8-connected field has at least one tile within reach of a town.
 */
export const depositPlacementSatisfiesReach = (
  grid: StrategicReachGrid,
  coords: ReadonlyArray<{ x: number; y: number }>,
  landDistance: Int16Array,
  forbidden: Uint8Array
): boolean => {
  if (coords.length === 0) return false;
  const width = grid.WORLD_WIDTH;
  for (const { x, y } of coords) if (forbidden[y * width + x] === 1) return false;
  return eightConnectedComponents(grid, coords).every((component) =>
    component.some(({ x, y }) => landDistance[y * width + x] !== NOT_IN_REACH)
  );
};
