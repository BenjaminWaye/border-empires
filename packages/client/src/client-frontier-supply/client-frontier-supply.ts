/**
 * Frontier supply lines: where the viewer's frontier beyond reach hangs on a
 * single tile.
 *
 * Mirrors the simulation's encirclement rule
 * (apps/simulation/src/encirclement/encirclement.ts): a FRONTIER tile stays
 * owned only while a path through its owner's own FRONTIER (8 neighbours,
 * plus active Aether bridge links and dock sea lanes) reaches one of their
 * SETTLED tiles or one of their FRONTIER dock tiles. Cut that path and everything past the cut is
 * lost at once. Out-of-reach frontier can't be settled, so that path is the
 * only thing keeping it.
 *
 * Most land beyond reach has several ways back to supply, and losing any one
 * tile changes nothing; drawing it is noise. So the model only keeps the
 * fragile part: beyond-reach land that sits past a cut tile -- a single
 * FRONTIER tile whose loss would cut it off (an articulation point of the
 * supply graph). Each such stretch gets a line from the nearest supply tile
 * (settled land or a frontier dock), through the cut tile, which the
 * renderers mark, out to its tips -- tiles with nothing further out -- along
 * the fewest-steps supply path (ties prefer straight steps). Side-by-side tips
 * at the same distance share one line. Nested cuts (a snake is all cut tiles)
 * report only the one nearest supply: losing it loses the most. A beach
 * landing hangs on the viewer's dock across the sea (a sea lane), so that
 * dock is its cut even when settled, and the hop across follows the dock's
 * sea route (`via`).
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
  /** `to` is a frontier tip the line ends at. */
  tip: boolean;
  /** Sea-route tiles crossed between `from` and `to` (a sea-lane hop), in order. */
  via?: ReadonlyArray<{ x: number; y: number }>;
};

export type FrontierSupplyModel = {
  links: FrontierSupplyLink[];
  /** Cut tiles: each is the single tile some drawn stretch of beyond-reach land hangs on. */
  cuts: Array<{ x: number; y: number }>;
};

export type FrontierSupplyInput = {
  tiles: Iterable<FrontierSupplyTile>;
  me: string;
  /** Tile keys inside the viewer's reach border. */
  reach: ReadonlySet<string>;
  /** Extra supply links (active Aether bridges the viewer owns), as tile-key pairs. */
  extraLinks?: ReadonlyArray<readonly [string, string]>;
  /** The viewer's dock sea lanes: a dock and a landing it supplies, with the sea route from the dock (client-dock-landing-ground.ts). */
  seaLanes?: ReadonlyArray<{ dockKey: string; landingKey: string; via: ReadonlyArray<{ x: number; y: number }> }>;
  worldWidth?: number;
  worldHeight?: number;
};

export const EMPTY_FRONTIER_SUPPLY_MODEL: FrontierSupplyModel = { links: [], cuts: [] };

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
  // Sea-lane hops, keyed "from>to" by node, carrying the route each way.
  const seaLaneVia = new Map<string, ReadonlyArray<{ x: number; y: number }>>();
  for (const lane of input.seaLanes ?? []) {
    const dock = indexByKey.get(lane.dockKey);
    const landing = indexByKey.get(lane.landingKey);
    if (dock === undefined || landing === undefined || dock === landing || seaLaneVia.has(`${dock}>${landing}`)) continue;
    linkNodes(dock, landing);
    seaLaneVia.set(`${dock}>${landing}`, lane.via);
    seaLaneVia.set(`${landing}>${dock}`, [...lane.via].reverse());
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
  for (let n = 1; n < tail; n += 1) {
    const i = order[n]!;
    let best = -1;
    for (const candidate of adjacency[i]!) {
      if (level[candidate] !== level[i]! - 1) continue;
      if (best === -1 || (candidate > 0 && isStraightStep(i, candidate) && !(best > 0 && isStraightStep(i, best)))) best = candidate;
    }
    parent[i] = best;
  }

  // Any FRONTIER tile can be taken and cut what hangs on it -- a frontier dock
  // included, though it is also a supply source. Settled tiles are not cuts,
  // except a dock for the landings across its sea lanes: they hang on it alone.
  const cutOf = cutTilesFor(
    adjacency,
    (parentNode, childNode) => nodeTiles[parentNode]!.ownershipState === "FRONTIER" || seaLaneVia.has(`${parentNode}>${childNode}`)
  );
  const fragile = (i: number): boolean => beyondReach(i) && cutOf[i]! > 0;

  // Tips: where a fragile stretch ends. Group side-by-side fragile tiles at
  // the same distance from supply; a group is an edge of the frontier only if
  // none of its tiles has a neighbour further out (so a block's near corners,
  // which sit level with tiles that lead on, don't count, and nor does the
  // point where two arms of a loop meet). Each edge gets one line, into its
  // middle tile.
  const isTip = new Uint8Array(nodeCount);
  const grouped = new Uint8Array(nodeCount);
  for (let n = 1; n < tail; n += 1) {
    const seed = order[n]!;
    if (grouped[seed] === 1 || !fragile(seed)) continue;
    const group: number[] = [seed];
    grouped[seed] = 1;
    let leadsFurther = false;
    for (let g = 0; g < group.length; g += 1) {
      const i = group[g]!;
      for (const j of adjacency[i]!) {
        // Only beyond-reach land counts: a deeper in-reach neighbour (a concave
        // reach border) doesn't make this out-of-reach pocket any less of an edge.
        if (level[j]! > level[i]! && beyondReach(j)) leadsFurther = true;
        if (level[j] === level[i] && grouped[j] === 0 && fragile(j)) {
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

  // Keep only the hops from each tip back to the supply tile nearest it (the
  // last tile before the virtual root). Every supply path from the tip runs
  // through its cut, so its supply-tree path does too.
  const onRoute = new Uint8Array(nodeCount);
  const cutNodes = new Set<number>();
  for (let i = 1; i < nodeCount; i += 1) {
    if (isTip[i] !== 1) continue;
    cutNodes.add(cutOf[i]!);
    for (let node = i; node > 0 && !isSource[node] && onRoute[node] === 0; node = parent[node]!) onRoute[node] = 1;
  }

  const links: FrontierSupplyLink[] = [];
  for (let i = 1; i < nodeCount; i += 1) {
    const from = parent[i]!;
    if (from <= 0 || onRoute[i] !== 1) continue;
    const fromTile = nodeTiles[from]!;
    const toTile = nodeTiles[i]!;
    const via = seaLaneVia.get(`${from}>${i}`);
    links.push({ from: { x: fromTile.x, y: fromTile.y }, to: { x: toTile.x, y: toTile.y }, tip: isTip[i] === 1, ...(via?.length ? { via } : {}) });
  }
  const cuts = [...cutNodes].sort((a, b) => a - b).map((i) => ({ x: nodeTiles[i]!.x, y: nodeTiles[i]!.y }));

  return { links, cuts };
};

/**
 * For every node, the cut tile nearest supply that it hangs on, or -1: a
 * tile allowed by `canCut` (asked per parent and the child it would cut off)
 * whose removal disconnects the node from the root (node 0).
 *
 * Iterative Tarjan articulation points from the root: a DFS-tree child c of v
 * (v not the root) has its whole subtree cut off by v when no back edge from
 * that subtree climbs above v (low[c] >= disc[v]). Walking the tree top-down,
 * a node inherits its parent's cut if it has one, so the cut reported is the
 * one nearest supply. Parallel edges (a bridge link beside a neighbour edge)
 * and the edge back to the DFS parent only lower `low` to disc[v] at most,
 * which leaves the test unchanged.
 */
const cutTilesFor = (adjacency: number[][], canCut: (node: number, child: number) => boolean): Int32Array => {
  const nodeCount = adjacency.length;
  const disc = new Int32Array(nodeCount).fill(-1);
  const low = new Int32Array(nodeCount);
  const dfsParent = new Int32Array(nodeCount).fill(-1);
  const nextEdge = new Int32Array(nodeCount);
  const preorder: number[] = [0];
  const stack: number[] = [0];
  disc[0] = 0;
  let time = 1;
  while (stack.length > 0) {
    const u = stack[stack.length - 1]!;
    const edges = adjacency[u]!;
    if (nextEdge[u]! < edges.length) {
      const w = edges[nextEdge[u]!]!;
      nextEdge[u]! += 1;
      if (disc[w] === -1) {
        disc[w] = time;
        low[w] = time;
        time += 1;
        dfsParent[w] = u;
        preorder.push(w);
        stack.push(w);
      } else if (disc[w]! < low[u]!) {
        low[u] = disc[w]!;
      }
      continue;
    }
    stack.pop();
    const p = dfsParent[u]!;
    if (p >= 0 && low[u]! < low[p]!) low[p] = low[u]!;
  }

  const cutOf = new Int32Array(nodeCount).fill(-1);
  for (const n of preorder) {
    const p = dfsParent[n]!;
    if (p <= 0) continue;
    if (cutOf[p]! > 0) cutOf[n] = cutOf[p]!;
    else if (low[n]! >= disc[p]! && canCut(p, n)) cutOf[n] = p;
  }
  return cutOf;
};
