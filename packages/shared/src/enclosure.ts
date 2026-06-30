/**
 * BFS flood-fill check: returns true if every path from `origin` to the
 * boundary of the bounding box is blocked by tiles owned by `enclosingOwnerId`.
 *
 * Tiles are addressed as "x,y" strings in `tileOwners`.
 */
export const isEnclosedBy = (
  origin: string,
  tileOwners: ReadonlyMap<string, string>,
  enclosingOwnerId: string,
  width: number,
  height: number
): boolean => {
  const comma = origin.indexOf(",");
  if (comma < 0) return false;
  const ox = Number(origin.slice(0, comma));
  const oy = Number(origin.slice(comma + 1));
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return false;

  const visited = new Set<string>();
  const queue: [number, number][] = [[ox, oy]];
  visited.add(origin);

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const [x, y] = entry;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (tileOwners.get(key) === enclosingOwnerId) continue;
      queue.push([nx, ny]);
    }
  }
  return true;
};
