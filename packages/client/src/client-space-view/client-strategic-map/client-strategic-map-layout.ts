// Pure layout for the 2D strategic map (design doc §22). Territory is
// computed, never authored: systems get stable hashed positions, connect to
// their real nearest neighbours (starlanes), and a Duke's territory is just
// the contiguous same-owner systems on that graph. The Core is a fixed
// landmark with no edges (§22.1) -- routing every Fleet through Court space
// would let the Court watch every raid and Writ strike.
import { hashSeed, type SpacePlanetState, type SpacePlanetViewModel } from "../client-space-view-state.js";

export type MapPoint = { x: number; y: number };
export type StrategicNode = { index: number; model: SpacePlanetViewModel; point: MapPoint };
export type Starlane = readonly [number, number];
export type TerritoryPatch = { ownerKey: string; state: SpacePlanetState; nodeIndices: number[] };

// Unit-disc coordinates: the Core sits at (0, 0); systems live between the
// exclusion radius and 1. Positions depend only on the seasonId, so a system
// never moves when others appear.
export const CORE_EXCLUSION_RADIUS = 0.16;
const NEAREST_EXTRA_LINKS = 2;

// FNV-1a on near-identical strings ("season-1", "season-2", ...) yields
// strongly correlated values, which collapsed systems onto a line. murmur3's
// finalizer avalanches every input bit so neighbouring seeds decorrelate.
const avalanche = (h: number): number => {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
};

const unitFloat = (seed: string): number => avalanche(hashSeed(seed)) / 0xffffffff;

export const strategicPosition = (seasonId: string): MapPoint => {
  const angle = unitFloat(`sm:angle:${seasonId}`) * Math.PI * 2;
  // sqrt spreads systems evenly by area rather than clumping near the Core.
  const radius = CORE_EXCLUSION_RADIUS + (1 - CORE_EXCLUSION_RADIUS) * 0.97 * Math.sqrt(unitFloat(`sm:radius:${seasonId}`));
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

export const buildStrategicNodes = (models: ReadonlyArray<SpacePlanetViewModel>): StrategicNode[] =>
  [...models]
    .sort((a, b) => (a.seasonId < b.seasonId ? -1 : a.seasonId > b.seasonId ? 1 : 0))
    .map((model, index) => ({ index, model, point: strategicPosition(model.seasonId) }));

const distance = (a: MapPoint, b: MapPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

// Real neighbour adjacency: a minimum spanning tree (so the whole galaxy is
// reachable) plus each system's two nearest neighbours (so it reads as a mesh
// rather than a tree). Sparse by design -- roughly 2-3 links per system.
export const buildStarlanes = (nodes: ReadonlyArray<StrategicNode>): Starlane[] => {
  const lanes = new Map<string, Starlane>();
  const add = (a: number, b: number): void => {
    if (a !== b) lanes.set(edgeKey(a, b), a < b ? [a, b] : [b, a]);
  };

  if (nodes.length > 1) {
    const inTree = new Array<boolean>(nodes.length).fill(false);
    const best = new Array<number>(nodes.length).fill(Number.POSITIVE_INFINITY);
    const from = new Array<number>(nodes.length).fill(-1);
    best[0] = 0;
    for (let step = 0; step < nodes.length; step += 1) {
      let pick = -1;
      for (let i = 0; i < nodes.length; i += 1) {
        if (!inTree[i] && (pick === -1 || best[i]! < best[pick]!)) pick = i;
      }
      inTree[pick] = true;
      if (from[pick]! >= 0) add(from[pick]!, pick);
      for (let i = 0; i < nodes.length; i += 1) {
        if (inTree[i]) continue;
        const d = distance(nodes[pick]!.point, nodes[i]!.point);
        if (d < best[i]!) {
          best[i] = d;
          from[i] = pick;
        }
      }
    }
  }

  for (const node of nodes) {
    nodes
      .filter((other) => other.index !== node.index)
      .map((other) => ({ index: other.index, d: distance(node.point, other.point) }))
      .sort((a, b) => a.d - b.d || a.index - b.index)
      .slice(0, NEAREST_EXTRA_LINKS)
      .forEach((near) => add(node.index, near.index));
  }
  return [...lanes.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

// A territory patch is a connected component of same-owner systems over the
// starlane graph. Two adjacent holdings become one bigger patch; a system with
// no known owner never merges with anything.
export const computeTerritoryPatches = (nodes: ReadonlyArray<StrategicNode>, lanes: ReadonlyArray<Starlane>): TerritoryPatch[] => {
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (const [a, b] of lanes) {
    const ka = nodes[a]!.model.ownerKey;
    if (ka !== undefined && ka === nodes[b]!.model.ownerKey) parent[find(a)] = find(b);
  }
  const groups = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.model.ownerKey === undefined) continue;
    const root = find(node.index);
    groups.set(root, [...(groups.get(root) ?? []), node.index]);
  }
  return [...groups.values()].map((nodeIndices) => {
    const first = nodes[nodeIndices[0]!]!.model;
    return { ownerKey: first.ownerKey!, state: first.state, nodeIndices };
  });
};

// §22.2: only notable systems are labelled -- yours, contested, threatened.
// Everything else stays an unlabelled dot, so it scales to hundreds.
export const shouldLabelSystem = (model: SpacePlanetViewModel): boolean =>
  model.state === "owned" || model.state === "contested" || model.underThreat === true;

export const pickNodeAt = (
  nodes: ReadonlyArray<StrategicNode>,
  toScreen: (p: MapPoint) => MapPoint,
  screenX: number,
  screenY: number,
  maxDistancePx = 16
): StrategicNode | undefined => {
  let best: StrategicNode | undefined;
  let bestDistance = maxDistancePx;
  for (const node of nodes) {
    const p = toScreen(node.point);
    const d = Math.hypot(p.x - screenX, p.y - screenY);
    if (d <= bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
};

export const fitTransform = (width: number, height: number, paddingPx = 28): { scale: number; toScreen: (p: MapPoint) => MapPoint } => {
  const scale = Math.max(1, Math.min(width, height) / 2 - paddingPx);
  return { scale, toScreen: (p) => ({ x: width / 2 + p.x * scale, y: height / 2 + p.y * scale }) };
};
