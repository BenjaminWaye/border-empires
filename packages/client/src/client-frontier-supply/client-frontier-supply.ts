/**
 * Frontier supply lines: which way supply flows out to the viewer's frontier
 * that sits beyond their reach.
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
 * A multi-source BFS gives every tile its fewest-steps route back to supply
 * (ties prefer straight steps). Lines are drawn only out to the frontier's
 * tips -- tiles with nothing of the viewer's further out -- so a snake or a
 * branch gets one line, and a wide area gets a few lines to its far edge
 * instead of a line into every tile. Side-by-side tips at the same distance
 * (the edge of a block, the end of a two-wide corridor) share one line.
 *
 * Pure and O(owned tiles).
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
  /** Beyond-reach tiles this hop carries: everything fed through `to`, plus undrawn branches beside it that the line stands in for. Drawn as line thickness. */
  downstream: number;
  /** `to` is a frontier tip the line ends at: drawn with an arrowhead. */
  tip: boolean;
};

export type FrontierSupplyModel = {
  links: FrontierSupplyLink[];
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

export const EMPTY_FRONTIER_SUPPLY_MODEL: FrontierSupplyModel = { links: [] };

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

  // How many beyond-reach tiles each hop feeds: accumulate up the supply
  // tree in reverse BFS order, so every child is counted before its parent.
  const fed = new Int32Array(nodeCount);
  for (let n = tail - 1; n >= 1; n -= 1) {
    const i = order[n]!;
    if (beyondReach(i)) fed[i]! += 1;
    if (parent[i]! > 0) fed[parent[i]!]! += fed[i]!;
  }

  // Tips: where the frontier ends. Group side-by-side beyond-reach tiles at
  // the same distance from supply; a group is an edge of the frontier only if
  // none of its tiles has a neighbour further out (so a block's near corners,
  // which sit level with tiles that lead on, don't count, and nor does the
  // point where two arms of a loop meet). Each edge gets one line, into its
  // middle tile.
  const isTip = new Uint8Array(nodeCount);
  const grouped = new Uint8Array(nodeCount);
  for (let n = 1; n < tail; n += 1) {
    const seed = order[n]!;
    if (grouped[seed] === 1 || !beyondReach(seed)) continue;
    const group: number[] = [seed];
    grouped[seed] = 1;
    let leadsFurther = false;
    for (let g = 0; g < group.length; g += 1) {
      const i = group[g]!;
      for (const j of adjacency[i]!) {
        // Only beyond-reach land counts: a deeper in-reach neighbour (a concave
        // reach border) doesn't make this out-of-reach pocket any less of an edge.
        if (level[j]! > level[i]! && beyondReach(j)) leadsFurther = true;
        if (level[j] === level[i] && grouped[j] === 0 && beyondReach(j)) {
          grouped[j] = 1;
          group.push(j);
        }
      }
    }
    if (leadsFurther) continue;
    // Middle tile: nearest the group's centre (offsets from the seed, so a group straddling the world seam still averages correctly).
    const seedTile = nodeTiles[seed]!;
    const offset = (i: number): [number, number] => {
      const dx = nodeTiles[i]!.x - seedTile.x;
      const dy = nodeTiles[i]!.y - seedTile.y;
      return [dx - Math.round(dx / width) * width, dy - Math.round(dy / height) * height];
    };
    let cx = 0;
    let cy = 0;
    for (const i of group) {
      const [dx, dy] = offset(i);
      cx += dx / group.length;
      cy += dy / group.length;
    }
    let middle = seed;
    let best = Infinity;
    for (const i of group) {
      const [dx, dy] = offset(i);
      const d = (dx - cx) ** 2 + (dy - cy) ** 2;
      if (d < best) { best = d; middle = i; }
    }
    isTip[middle] = 1;
  }

  // Keep only the hops on a route out to a tip.
  const onRoute = new Uint8Array(nodeCount);
  for (let i = 1; i < nodeCount; i += 1) {
    if (isTip[i] !== 1) continue;
    for (let node = i; node > 0 && beyondReach(node) && onRoute[node] === 0; node = parent[node]!) onRoute[node] = 1;
  }

  // A drawn line stands in for the undrawn land beside it: give each drawn
  // hop the weight of its pruned sibling branches too, so the single line into
  // a wide block draws as thick as the land it carries.
  const carried = Int32Array.from(fed);
  const firstDrawnChild = new Int32Array(nodeCount).fill(-1);
  for (let i = 1; i < nodeCount; i += 1) {
    if (onRoute[i] === 1 && parent[i]! >= 0 && firstDrawnChild[parent[i]!] === -1) firstDrawnChild[parent[i]!] = i;
  }
  for (let i = 1; i < nodeCount; i += 1) {
    const p = parent[i]!;
    if (onRoute[i] === 1 || p < 0 || !beyondReach(i)) continue;
    const stand = firstDrawnChild[p]!;
    if (stand > 0) carried[stand]! += fed[i]!;
  }

  const links: FrontierSupplyLink[] = [];
  for (let i = 1; i < nodeCount; i += 1) {
    const from = parent[i]!;
    if (from <= 0 || onRoute[i] !== 1) continue;
    const fromTile = nodeTiles[from]!;
    const toTile = nodeTiles[i]!;
    links.push({
      from: { x: fromTile.x, y: fromTile.y },
      to: { x: toTile.x, y: toTile.y },
      depthBeyondReach: depth[i]!,
      downstream: carried[i]!,
      tip: isTip[i] === 1
    });
  }

  return { links };
};
