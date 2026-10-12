import { isSeaTerrain, type Terrain } from "@border-empires/shared";

// Decides which docks are linked to which, from the docks' *actual* placed
// positions and the real sea distance between them.
//
// The old linker built a spanning tree over land components using a
// throwaway "primary" candidate per component (picked with a different seed
// than the dock that was actually placed), then handed each component edge
// to a large island's docks round-robin -- so a continent's west-coast dock
// could be linked to an island off its east coast. It also measured
// Manhattan distance straight through land. In practice ~25% of links went
// to a dock outside the 5 nearest, and some sea routes ran 600+ tiles.
//
// Rules here:
// 1. Every dock links to its nearest dock on a *different* landmass.
//    These links are emitted first, so a dock's pairedDockId (its first
//    link) is always a nearest-neighbour link -- its own, or another
//    dock's nearest pointing at it -- never a longer spanning-tree link.
// 2. A minimum spanning tree over landmasses (Kruskal on dock-pair
//    distances) keeps the whole network connected, realised on the closest
//    dock pair between each pair of landmasses.
// Distances are true sea path lengths (BFS over sea tiles). Docks whose
// seas never meet (e.g. an inland-lake dock) fall back to toroidal
// Manhattan distance plus a penalty, so they are still linked -- matching
// the old behaviour of never stranding a landmass -- but only when no
// sea-reachable option exists.

export type DockLinkSite = { componentId: number; seaX: number; seaY: number };

export type DockLinkTerrain = {
  worldWidth: number;
  worldHeight: number;
  terrainAt: (x: number, y: number) => Terrain;
};

const UNREACHABLE = -1;

/** Sea path distance from each dock's sea tile to every other dock's sea tile; -1 when unreachable. */
export const dockSeaDistanceMatrix = (sites: readonly DockLinkSite[], terrain: DockLinkTerrain): Int32Array[] => {
  const { worldWidth: w, worldHeight: h } = terrain;
  const total = w * h;
  const seaMask = new Uint8Array(total);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (isSeaTerrain(terrain.terrainAt(x, y))) seaMask[y * w + x] = 1;
    }
  }
  const sitesByTile = new Map<number, number[]>();
  sites.forEach((site, index) => {
    const idx = site.seaY * w + site.seaX;
    const list = sitesByTile.get(idx) ?? [];
    list.push(index);
    sitesByTile.set(idx, list);
  });
  const dist = new Int32Array(total);
  const queue = new Int32Array(total);
  const matrix: Int32Array[] = [];
  for (let from = 0; from < sites.length; from += 1) {
    const row = new Int32Array(sites.length).fill(UNREACHABLE);
    dist.fill(-1);
    const start = sites[from]!.seaY * w + sites[from]!.seaX;
    let head = 0;
    let tail = 0;
    let found = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail && found < sites.length) {
      const idx = queue[head++]!;
      const d = dist[idx]!;
      const hits = sitesByTile.get(idx);
      if (hits) {
        for (const to of hits) row[to] = d;
        found += hits.length;
      }
      const x = idx % w;
      const y = (idx - x) / w;
      const visit = (n: number): void => {
        if (dist[n] !== -1 || seaMask[n] !== 1) return;
        dist[n] = d + 1;
        queue[tail++] = n;
      };
      visit(y * w + (x + 1 === w ? 0 : x + 1));
      visit(y * w + (x === 0 ? w - 1 : x - 1));
      visit((y + 1 === h ? 0 : y + 1) * w + x);
      visit((y === 0 ? h - 1 : y - 1) * w + x);
    }
    matrix.push(row);
  }
  return matrix;
};

/** Undirected dock-index edges, deterministic for a given input. */
export const planDockLinks = (sites: readonly DockLinkSite[], terrain: DockLinkTerrain): Array<[number, number]> => {
  const { worldWidth: w, worldHeight: h } = terrain;
  const seaDistance = dockSeaDistanceMatrix(sites, terrain);
  // Any sea-reachable pair beats any unreachable one.
  const unreachablePenalty = w * h;
  const cost = (a: number, b: number): number => {
    const sea = seaDistance[a]![b]!;
    if (sea !== UNREACHABLE) return sea;
    const dx = Math.abs(sites[a]!.seaX - sites[b]!.seaX);
    const dy = Math.abs(sites[a]!.seaY - sites[b]!.seaY);
    return unreachablePenalty + Math.min(dx, w - dx) + Math.min(dy, h - dy);
  };

  const edges: Array<[number, number]> = [];
  const edgeKeys = new Set<string>();
  const addEdge = (a: number, b: number): void => {
    const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeKeys.has(edgeKey)) return;
    edgeKeys.add(edgeKey);
    edges.push(a < b ? [a, b] : [b, a]);
  };

  // Rule 1: each dock's nearest foreign dock.
  for (let a = 0; a < sites.length; a += 1) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let b = 0; b < sites.length; b += 1) {
      if (sites[a]!.componentId === sites[b]!.componentId) continue;
      const c = cost(a, b);
      if (c < bestCost) {
        bestCost = c;
        best = b;
      }
    }
    if (best >= 0) addEdge(a, best);
  }

  // Rule 2: Kruskal over landmasses.
  const candidates: Array<{ a: number; b: number; cost: number }> = [];
  for (let a = 0; a < sites.length; a += 1) {
    for (let b = a + 1; b < sites.length; b += 1) {
      if (sites[a]!.componentId === sites[b]!.componentId) continue;
      candidates.push({ a, b, cost: cost(a, b) });
    }
  }
  candidates.sort((left, right) => left.cost - right.cost || left.a - right.a || left.b - right.b);
  const parent = new Map<number, number>();
  const find = (componentId: number): number => {
    let root = componentId;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
    parent.set(componentId, root);
    return root;
  };
  for (const candidate of candidates) {
    const rootA = find(sites[candidate.a]!.componentId);
    const rootB = find(sites[candidate.b]!.componentId);
    if (rootA === rootB) continue;
    parent.set(rootA, rootB);
    addEdge(candidate.a, candidate.b);
  }
  return edges;
};
