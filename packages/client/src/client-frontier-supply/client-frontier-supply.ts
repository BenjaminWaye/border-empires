/**
 * Frontier supply lines: which way supply flows into the viewer's frontier
 * that sits beyond their reach, and which single tiles hold it together.
 *
 * Mirrors the simulation's encirclement rule
 * (apps/simulation/src/encirclement/encirclement.ts): a FRONTIER tile stays
 * owned only while a path through its owner's own FRONTIER (8 neighbours,
 * plus active Aether bridge links) reaches one of their SETTLED tiles or one
 * of their FRONTIER dock tiles. Cut that path and everything past the cut is
 * lost at once. Out-of-reach frontier can't be settled, so that path is the
 * only thing keeping it -- this model is what the map draws to make that
 * visible.
 *
 * - `links`: one supply hop per beyond-reach tile, parent (closer to supply)
 *   -> child, from a multi-source BFS. Drawn as flowing chevrons; a hop out
 *   of a chokepoint is `fragile` and drawn as a warning.
 * - `chokepoints`: FRONTIER tiles whose loss alone would cut beyond-reach
 *   tiles off from supply (articulation points of the supply graph), with
 *   how many tiles depend on each. `pinch` marks the first chokepoint of a
 *   fragile stretch (its supply parent isn't one), so a one-wide snake gets
 *   one marker where it narrows rather than one on every tile.
 *
 * Pure and O(owned tiles): one pass to collect the viewer's tiles, a BFS, and
 * an iterative Tarjan DFS (no recursion -- a long snake would blow the stack).
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export type FrontierSupplyTile = {
  x: number;
  y: number;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
};

export type FrontierSupplyLink = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Hops beyond reach at the child end (1 = first tile past the reach edge). Drawn fainter the further out it is. */
  depthBeyondReach: number;
  /** The hop leaves a chokepoint: losing `from` would cut `to` off. */
  fragile: boolean;
};

export type FrontierSupplyChokepoint = {
  x: number;
  y: number;
  /** Owned FRONTIER tiles that would be cut off from supply if this tile were lost. */
  dependentTiles: number;
  /** First chokepoint of a fragile stretch: where the supply line narrows to one tile. */
  pinch: boolean;
};

export type FrontierSupplyModel = {
  links: FrontierSupplyLink[];
  chokepoints: Map<string, FrontierSupplyChokepoint>;
};

export type FrontierSupplyInput = {
  tiles: Iterable<FrontierSupplyTile>;
  me: string;
  /** Tile keys inside the viewer's reach border. */
  reach: ReadonlySet<string>;
  /** Extra supply links (active Aether bridges the viewer owns), as tile-key pairs. */
  extraLinks?: ReadonlyArray<readonly [string, string]>;
  worldWidth?: number;
  worldHeight?: number;
};

export const EMPTY_FRONTIER_SUPPLY_MODEL: FrontierSupplyModel = { links: [], chokepoints: new Map() };

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
];

const isSupplySource = (tile: FrontierSupplyTile): boolean =>
  tile.ownershipState === "SETTLED" || (tile.ownershipState === "FRONTIER" && Boolean(tile.dockId));

export const computeFrontierSupplyModel = (input: FrontierSupplyInput): FrontierSupplyModel => {
  const width = input.worldWidth ?? WORLD_WIDTH;
  const height = input.worldHeight ?? WORLD_HEIGHT;
  const key = (x: number, y: number): string => `${x},${y}`;

  // Index the viewer's tiles: node 0 is a virtual root joined to every supply
  // source, so "connected to supply" becomes "connected to node 0".
  const indexByKey = new Map<string, number>();
  const nodeTiles: Array<FrontierSupplyTile | undefined> = [undefined];
  const isSource: boolean[] = [false];
  let anyBeyondReach = false;
  for (const tile of input.tiles) {
    if (tile.ownerId !== input.me) continue;
    const source = isSupplySource(tile);
    if (!source && tile.ownershipState !== "FRONTIER") continue;
    const tileKey = key(tile.x, tile.y);
    indexByKey.set(tileKey, nodeTiles.length);
    nodeTiles.push(tile);
    isSource.push(source);
    if (!source && !input.reach.has(tileKey)) anyBeyondReach = true;
  }
  if (!anyBeyondReach) return EMPTY_FRONTIER_SUPPLY_MODEL;

  const nodeCount = nodeTiles.length;
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  const linkNodes = (a: number, b: number): void => {
    adjacency[a]!.push(b);
    adjacency[b]!.push(a);
  };
  for (let i = 1; i < nodeCount; i += 1) {
    const tile = nodeTiles[i]!;
    if (isSource[i]) linkNodes(0, i);
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const j = indexByKey.get(key((((tile.x + dx) % width) + width) % width, (((tile.y + dy) % height) + height) % height));
      // Each undirected edge once; source-source edges are redundant (both hang off the root).
      if (j === undefined || j <= i || (isSource[i] && isSource[j])) continue;
      linkNodes(i, j);
    }
  }
  for (const [aKey, bKey] of input.extraLinks ?? []) {
    const a = indexByKey.get(aKey);
    const b = indexByKey.get(bKey);
    if (a !== undefined && b !== undefined && a !== b) linkNodes(a, b);
  }

  const beyondReach = (i: number): boolean => i > 0 && !isSource[i] && !input.reach.has(key(nodeTiles[i]!.x, nodeTiles[i]!.y));

  // Multi-source BFS from the root gives every tile its hop distance from
  // supply. (The sim walks the other way -- frontier inward until it hits a
  // source -- which reaches exactly the same tiles.)
  const level = new Int32Array(nodeCount).fill(-1);
  const order = new Int32Array(nodeCount);
  let head = 0;
  let tail = 0;
  level[0] = 0;
  order[tail++] = 0;
  while (head < tail) {
    const current = order[head++]!;
    for (const next of adjacency[current]!) {
      if (level[next] !== -1) continue;
      level[next] = level[current]! + 1;
      order[tail++] = next;
    }
  }

  // Each tile's supply parent: a neighbour one hop closer to supply,
  // preferring a straight (orthogonal) step over a diagonal one so the drawn
  // flow runs along rows and columns instead of zig-zagging. Walked in BFS
  // order, so a parent's own depth is always settled first.
  const isStraightStep = (a: number, b: number): boolean => {
    const dx = Math.abs(nodeTiles[a]!.x - nodeTiles[b]!.x);
    const dy = Math.abs(nodeTiles[a]!.y - nodeTiles[b]!.y);
    return Math.min(dx, width - dx) + Math.min(dy, height - dy) === 1;
  };
  const parent = new Int32Array(nodeCount).fill(-1);
  const depth = new Int32Array(nodeCount);
  for (let n = 1; n < tail; n += 1) {
    const i = order[n]!;
    let best = -1;
    for (const candidate of adjacency[i]!) {
      if (level[candidate] !== level[i]! - 1) continue;
      if (best === -1 || (candidate > 0 && isStraightStep(i, candidate) && !(best > 0 && isStraightStep(i, best)))) best = candidate;
    }
    parent[i] = best;
    depth[i] = beyondReach(i) ? depth[best]! + 1 : 0;
  }

  const chokepoints = findChokepoints(adjacency, isSource, nodeTiles, beyondReach);
  const tileKeyOf = (i: number): string => key(nodeTiles[i]!.x, nodeTiles[i]!.y);
  for (const [chokeKey, chokepoint] of chokepoints) {
    const from = parent[indexByKey.get(chokeKey)!]!;
    chokepoint.pinch = !(from > 0 && chokepoints.has(tileKeyOf(from)));
  }

  const links: FrontierSupplyLink[] = [];
  for (let i = 1; i < nodeCount; i += 1) {
    const from = parent[i]!;
    if (from <= 0 || !beyondReach(i)) continue;
    const fromTile = nodeTiles[from]!;
    const toTile = nodeTiles[i]!;
    links.push({
      from: { x: fromTile.x, y: fromTile.y },
      to: { x: toTile.x, y: toTile.y },
      depthBeyondReach: depth[i]!,
      fragile: chokepoints.has(tileKeyOf(from))
    });
  }

  return { links, chokepoints };
};

/**
 * Articulation points of the supply graph (iterative Tarjan from the root).
 * Removing non-source vertex v disconnects the DFS subtree of each child c
 * with low[c] >= disc[v]. Only FRONTIER (non-source) tiles qualify -- those
 * are the instantly capturable ones -- and only when what they hold up
 * includes at least one beyond-reach tile, which is where the map is meant to
 * warn.
 */
const findChokepoints = (
  adjacency: number[][],
  isSource: boolean[],
  nodeTiles: Array<FrontierSupplyTile | undefined>,
  beyondReach: (i: number) => boolean
): Map<string, FrontierSupplyChokepoint> => {
  const nodeCount = adjacency.length;
  const disc = new Int32Array(nodeCount).fill(-1);
  const low = new Int32Array(nodeCount);
  const subtreeSize = new Int32Array(nodeCount);
  const subtreeBeyond = new Int32Array(nodeCount);
  const cutSize = new Int32Array(nodeCount);
  const cutBeyond = new Int32Array(nodeCount);
  const edgeCursor = new Int32Array(nodeCount);
  const stack: number[] = [0];
  const dfsParent = new Int32Array(nodeCount).fill(-1);
  let time = 0;
  disc[0] = low[0] = time++;
  subtreeSize[0] = 1;

  while (stack.length > 0) {
    const v = stack[stack.length - 1]!;
    const edges = adjacency[v]!;
    if (edgeCursor[v]! < edges.length) {
      const w = edges[edgeCursor[v]!]!;
      edgeCursor[v]! += 1;
      if (disc[w] === -1) {
        dfsParent[w] = v;
        disc[w] = low[w] = time++;
        subtreeSize[w] = 1;
        subtreeBeyond[w] = beyondReach(w) ? 1 : 0;
        stack.push(w);
      } else if (w !== dfsParent[v]) {
        low[v] = Math.min(low[v]!, disc[w]!);
      }
      continue;
    }
    stack.pop();
    const p = dfsParent[v]!;
    if (p < 0) continue;
    low[p] = Math.min(low[p]!, low[v]!);
    subtreeSize[p]! += subtreeSize[v]!;
    subtreeBeyond[p]! += subtreeBeyond[v]!;
    if (low[v]! >= disc[p]!) {
      cutSize[p]! += subtreeSize[v]!;
      cutBeyond[p]! += subtreeBeyond[v]!;
    }
  }

  const chokepoints = new Map<string, FrontierSupplyChokepoint>();
  for (let v = 1; v < nodeCount; v += 1) {
    if (isSource[v] || cutBeyond[v]! === 0) continue;
    const tile = nodeTiles[v]!;
    chokepoints.set(`${tile.x},${tile.y}`, { x: tile.x, y: tile.y, dependentTiles: cutSize[v]!, pinch: false }); // pinch filled in by the caller
  }
  return chokepoints;
};
