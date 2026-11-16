/**
 * Wire and snapshot form of one player's explored-tile memory: every tile
 * that has ever been in that player's vision this season.
 *
 * The simulation keeps it as a world-sized bitset per player (bit index
 * `y * width + x`). Explored land is a few contiguous blobs, so it is stored
 * and sent as alternating run lengths over that bit order, starting with an
 * unexplored run (which may be 0). A typical empire encodes to a few hundred
 * numbers instead of a 25KB bitset.
 *
 * `width`/`height` record the world size it was written under: a record from
 * a different world size is meaningless and decodes to nothing.
 */
export type ExploredTilesRuns = {
  width: number;
  height: number;
  runs: number[];
};

/** Encodes a bitset (bit i set = cell i explored) into alternating runs. */
export const encodeExploredTilesRuns = (bits: Uint8Array, width: number, height: number): ExploredTilesRuns => {
  const cellCount = width * height;
  const runs: number[] = [];
  let current = 0; // 0 = counting unexplored, 1 = counting explored
  let length = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    const bit = ((bits[cell >> 3] ?? 0) >> (cell & 7)) & 1;
    if (bit === current) {
      length += 1;
      continue;
    }
    runs.push(length);
    current = bit;
    length = 1;
  }
  // A trailing unexplored run carries no information; a trailing explored run does.
  if (current === 1) runs.push(length);
  return { width, height, runs };
};

const isValidRuns = (value: unknown): value is ExploredTilesRuns => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ExploredTilesRuns>;
  return (
    typeof record.width === "number" &&
    typeof record.height === "number" &&
    Number.isInteger(record.width) &&
    Number.isInteger(record.height) &&
    Array.isArray(record.runs)
  );
};

/**
 * Calls `visit(x, y)` for every explored cell. Returns false (visiting
 * nothing) when the record is malformed or was written for another world
 * size, so callers can fall back to whatever they already know.
 */
export const forEachExploredTile = (
  value: unknown,
  width: number,
  height: number,
  visit: (x: number, y: number) => void
): boolean => {
  if (!isValidRuns(value) || value.width !== width || value.height !== height) return false;
  const cellCount = width * height;
  for (const run of value.runs) {
    if (typeof run !== "number" || !Number.isInteger(run) || run < 0) return false;
  }
  let cell = 0;
  let explored = false;
  for (const run of value.runs) {
    const end = Math.min(cellCount, cell + run);
    if (explored) {
      for (let index = cell; index < end; index += 1) visit(index % width, Math.floor(index / width));
    }
    cell = end;
    explored = !explored;
    if (cell >= cellCount) break;
  }
  return true;
};
