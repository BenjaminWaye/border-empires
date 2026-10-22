// Where to write each player's name across their garrisoned (SETTLED) land
// when the map is zoomed far out. Pure: tiles in, label paths out.
//
// A connected run of one owner's garrisoned tiles only earns a label once it
// holds a fully garrisoned 3x3 square somewhere. Its "core" is every tile
// whose 8 neighbours are all the same owner's garrison (a Chebyshev distance
// of at least 2 from the territory's edge): the centre of such a square. The
// label runs along the core's long axis, bending with it (the core is cut
// into one-tile slices across the axis and each slice's weighted middle is a
// path point), so the name stretches out and follows the land as the
// garrisoned area grows. Glyph height follows how thick the core is.
import { WORLD_HEIGHT, WORLD_WIDTH, type Terrain } from "@border-empires/shared";

export type TerritoryLayoutTile = {
  readonly x: number;
  readonly y: number;
  readonly terrain: Terrain;
  readonly ownerId?: string | undefined;
  readonly ownershipState?: string | undefined;
};

export type TerritoryNameLabel = {
  readonly ownerId: string;
  /** Path in world tile coordinates, unwrapped (may run past the world edge). */
  readonly points: ReadonlyArray<{ x: number; y: number }>;
  /** Preferred glyph height, in tiles. */
  readonly heightTiles: number;
  /** Tiles the name may spread across: the core path plus the one-tile rim at each end. */
  readonly spanTiles: number;
  /** Garrisoned tiles in the territory; bigger territories draw on top. */
  readonly tileCount: number;
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const smooth = (values: readonly number[], radius: number): number[] =>
  values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (value === undefined) continue;
      sum += value;
      count += 1;
    }
    return sum / count;
  });

export type CorePoint = { x: number; y: number; depth: number };

export const labelForCore = (ownerId: string, core: readonly CorePoint[], maxDepth: number, tileCount: number): TerritoryNameLabel => {
  let totalWeight = 0;
  let meanX = 0;
  let meanY = 0;
  for (const p of core) {
    totalWeight += p.depth;
    meanX += p.x * p.depth;
    meanY += p.y * p.depth;
  }
  meanX /= totalWeight;
  meanY /= totalWeight;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of core) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (angle <= -Math.PI / 2) angle += Math.PI;
  if (angle > Math.PI / 2) angle -= Math.PI;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const slices = new Map<number, { across: number; weight: number }>();
  for (const p of core) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    const slice = Math.round(dx * ux + dy * uy);
    const entry = slices.get(slice) ?? { across: 0, weight: 0 };
    entry.across += (-dx * uy + dy * ux) * p.depth;
    entry.weight += p.depth;
    slices.set(slice, entry);
  }
  const keys = [...slices.keys()].sort((a, b) => a - b);
  const across = smooth(keys.map((key) => { const entry = slices.get(key)!; return entry.across / entry.weight; }), 2);
  const points = keys.map((along, index) => ({
    x: meanX + along * ux - across[index]! * uy,
    y: meanY + along * uy + across[index]! * ux
  }));
  if (points.length === 1) {
    const only = points[0]!;
    points.splice(0, 1, { x: only.x - 0.5 * ux, y: only.y - 0.5 * uy }, { x: only.x + 0.5 * ux, y: only.y + 0.5 * uy });
  }
  const pathLength = (keys[keys.length - 1]! - keys[0]!) || 1;
  return {
    ownerId,
    points,
    heightTiles: Math.min(8, 1.4 + (maxDepth - 2) * 0.9),
    spanTiles: pathLength + 2,
    tileCount
  };
};

export const computeTerritoryNameLabels = (
  tiles: Iterable<TerritoryLayoutTile>,
  options: { readonly skipOwner?: (ownerId: string) => boolean; readonly width?: number; readonly height?: number } = {}
): TerritoryNameLabel[] => {
  const width = options.width ?? WORLD_WIDTH;
  const height = options.height ?? WORLD_HEIGHT;
  const ownerIds: string[] = [];
  const ownerIndexById = new Map<string, number>();
  const ownerByCell = new Int32Array(width * height).fill(-1);
  const garrisonedCells: number[] = [];
  for (const tile of tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (options.skipOwner?.(tile.ownerId)) continue;
    if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) continue;
    let ownerIndex = ownerIndexById.get(tile.ownerId);
    if (ownerIndex === undefined) {
      ownerIndex = ownerIds.length;
      ownerIds.push(tile.ownerId);
      ownerIndexById.set(tile.ownerId, ownerIndex);
    }
    const cell = tile.y * width + tile.x;
    ownerByCell[cell] = ownerIndex;
    garrisonedCells.push(cell);
  }
  const visited = new Uint8Array(width * height);
  const depthByCell = new Int16Array(width * height);
  const labels: TerritoryNameLabel[] = [];
  const neighbourCell = (x: number, y: number): number => wrap(y, height) * width + wrap(x, width);
  for (const startCell of garrisonedCells) {
    if (visited[startCell]) continue;
    const owner = ownerByCell[startCell]!;
    // Flood fill in unwrapped coordinates so a territory straddling the world
    // edge keeps one contiguous path.
    const members: Array<{ x: number; y: number; cell: number }> = [{ x: startCell % width, y: Math.floor(startCell / width), cell: startCell }];
    visited[startCell] = 1;
    for (let index = 0; index < members.length; index += 1) {
      const current = members[index]!;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const cell = neighbourCell(current.x + dx, current.y + dy);
          if (visited[cell] || ownerByCell[cell] !== owner) continue;
          visited[cell] = 1;
          members.push({ x: current.x + dx, y: current.y + dy, cell });
        }
      }
    }
    if (members.length < 9) continue;
    // Chebyshev distance to the territory's edge: 1 on the rim, +1 per ring inward.
    const frontier: typeof members = [];
    for (const member of members) {
      depthByCell[member.cell] = 0;
    }
    for (const member of members) {
      let onRim = false;
      for (let dy = -1; dy <= 1 && !onRim; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx !== 0 || dy !== 0) && ownerByCell[neighbourCell(member.x + dx, member.y + dy)] !== owner) {
            onRim = true;
            break;
          }
        }
      }
      if (onRim) {
        depthByCell[member.cell] = 1;
        frontier.push(member);
      }
    }
    for (let index = 0; index < frontier.length; index += 1) {
      const current = frontier[index]!;
      const nextDepth = depthByCell[current.cell]! + 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const cell = neighbourCell(current.x + dx, current.y + dy);
          if (ownerByCell[cell] !== owner || depthByCell[cell] !== 0) continue;
          depthByCell[cell] = nextDepth;
          frontier.push({ x: current.x + dx, y: current.y + dy, cell });
        }
      }
    }
    const core: CorePoint[] = [];
    let maxDepth = 0;
    for (const member of members) {
      const depth = depthByCell[member.cell]!;
      if (depth < 2) continue;
      core.push({ x: member.x, y: member.y, depth });
      maxDepth = Math.max(maxDepth, depth);
    }
    if (core.length === 0) continue;
    labels.push(labelForCore(ownerIds[owner]!, core, maxDepth, members.length));
  }
  return labels.sort((a, b) => a.tileCount - b.tileCount);
};
