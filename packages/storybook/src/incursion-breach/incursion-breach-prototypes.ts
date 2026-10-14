// Storybook-only prototypes for the incursion pocket edge (the dark/white
// outline around a rival's tiles inside my reach -- see
// client-reach-incursion.ts / client-map-3d-incursion-overlay.ts). Today that
// edge is a straight strip just inside the pocket; these are three candidate
// "breach" treatments for it, expressed as flat polygons in tile space so the
// exact same shapes can be drawn by the 3D story (triangulated meshes) and the
// 2D story (canvas paths). Nothing here is wired into the game yet.

export type BreachEdgeStyle = "current" | "spikes" | "jagged" | "shattered";

export const BREACH_EDGE_STYLES: readonly BreachEdgeStyle[] = ["current", "spikes", "jagged", "shattered"];

export const BREACH_EDGE_LABELS: Readonly<Record<BreachEdgeStyle, string>> = {
  current: "Current — straight strip",
  spikes: "Option 1 — spikes into my territory",
  jagged: "Option 2 — jagged torn line",
  shattered: "Option 3 — shattered wall + cracks"
};

export type Pt = { readonly x: number; readonly y: number };

/** One flat polygon in tile space; tile (tx, ty) spans [tx-0.5, tx+0.5] x [ty-0.5, ty+0.5]. */
export type BreachPolygon = {
  readonly points: readonly Pt[];
  /** "mark" = the contrasting outline colour (incursionMarkColor); "intruder" = the rival's own colour. */
  readonly paint: "mark" | "intruder";
  /** Draw order: lower layers first. */
  readonly layer: 0 | 1 | 2;
};

/** One side of a pocket tile, a -> b, with `n` the unit normal pointing OUT of the pocket. */
type PocketEdge = { readonly a: Pt; readonly b: Pt; readonly n: Pt; readonly facesMine: boolean; readonly seed: number };

export type BreachWorld = {
  /** Tile keys "x,y" the viewer owns. */
  readonly mine: ReadonlySet<string>;
  /** Tile keys "x,y" the intruder holds inside the viewer's reach. */
  readonly pocket: ReadonlySet<string>;
};

export const tileKey = (x: number, y: number): string => `${x},${y}`;
const parseKey = (key: string): Pt => {
  const [x, y] = key.split(",").map(Number);
  return { x: x!, y: y! };
};

// GLSL-style hash, same family as client-breach-border.ts's tornHash: stable
// per tile/side/index so the shapes never flicker frame to frame.
const hash = (a: number, b: number, c: number, d: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 269.5) * 43758.5453;
  return h - Math.floor(h);
};

const add = (p: Pt, q: Pt, s = 1): Pt => ({ x: p.x + q.x * s, y: p.y + q.y * s });
const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

const pocketEdges = (world: BreachWorld): PocketEdge[] => {
  const edges: PocketEdge[] = [];
  for (const key of world.pocket) {
    const { x, y } = parseKey(key);
    const sides = [
      { dx: 0, dy: -1, a: { x: x - 0.5, y: y - 0.5 }, b: { x: x + 0.5, y: y - 0.5 } },
      { dx: 1, dy: 0, a: { x: x + 0.5, y: y - 0.5 }, b: { x: x + 0.5, y: y + 0.5 } },
      { dx: 0, dy: 1, a: { x: x + 0.5, y: y + 0.5 }, b: { x: x - 0.5, y: y + 0.5 } },
      { dx: -1, dy: 0, a: { x: x - 0.5, y: y + 0.5 }, b: { x: x - 0.5, y: y - 0.5 } }
    ];
    sides.forEach((side, i) => {
      const neighbour = tileKey(x + side.dx, y + side.dy);
      if (world.pocket.has(neighbour)) return;
      edges.push({ a: side.a, b: side.b, n: { x: side.dx, y: side.dy }, facesMine: world.mine.has(neighbour), seed: x * 4 + y * 131 + i });
    });
  }
  return edges;
};

/** Thick segment p->q as a quad, `width` total, centred on the segment. */
const segmentQuad = (p: Pt, q: Pt, width: number, widthEnd = width): Pt[] => {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  return [
    { x: p.x + (nx * width) / 2, y: p.y + (ny * width) / 2 },
    { x: q.x + (nx * widthEnd) / 2, y: q.y + (ny * widthEnd) / 2 },
    { x: q.x - (nx * widthEnd) / 2, y: q.y - (ny * widthEnd) / 2 },
    { x: p.x - (nx * width) / 2, y: p.y - (ny * width) / 2 }
  ];
};

/** Small octagon to round off polyline joints. */
const joint = (c: Pt, r: number): Pt[] =>
  Array.from({ length: 8 }, (_, i) => ({ x: c.x + Math.cos((i * Math.PI) / 4) * r, y: c.y + Math.sin((i * Math.PI) / 4) * r }));

const polyline = (pts: readonly Pt[], width: number, paint: BreachPolygon["paint"], layer: BreachPolygon["layer"], taperTo?: number): BreachPolygon[] => {
  const out: BreachPolygon[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const w0 = taperTo === undefined ? width : width + (taperTo - width) * (i / (pts.length - 1));
    const w1 = taperTo === undefined ? width : width + (taperTo - width) * ((i + 1) / (pts.length - 1));
    out.push({ points: segmentQuad(pts[i]!, pts[i + 1]!, w0, w1), paint, layer });
    if (i > 0) out.push({ points: joint(pts[i]!, w0 / 2), paint, layer });
  }
  return out;
};

// Mirrors the live EDGE_WIDTH (0.07 of a tile) in both incursion renderers.
const STRIP_WIDTH = 0.07;

/** The live treatment: a solid strip just inside the pocket on every exposed side. */
const insideStrip = (e: PocketEdge, width = STRIP_WIDTH): BreachPolygon => ({
  points: [e.a, e.b, add(e.b, e.n, -width), add(e.a, e.n, -width)],
  paint: "mark",
  layer: 2
});

// --- Option 1: spikes -------------------------------------------------------
// A row of teeth in the intruder's colour, base on the pocket edge, tips
// driven out into my neighbouring tile, each with a dark outline. Only sides
// that face MY land get teeth; sides facing unowned/other land keep the
// plain strip, so spikes always point at what's under threat.
const TEETH_PER_SIDE = 3;
const spikes = (e: PocketEdge): BreachPolygon[] => {
  const out: BreachPolygon[] = [insideStrip(e, 0.045)];
  for (let i = 0; i < TEETH_PER_SIDE; i += 1) {
    const t0 = (i + 0.08) / TEETH_PER_SIDE;
    const t1 = (i + 0.92) / TEETH_PER_SIDE;
    const height = 0.26 + hash(e.seed, i, 1, 0) * 0.16;
    const lean = (hash(e.seed, i, 2, 0) - 0.5) * 0.08;
    const baseA = add(lerp(e.a, e.b, t0), e.n, -0.03);
    const baseB = add(lerp(e.a, e.b, t1), e.n, -0.03);
    const tip = add(lerp(e.a, e.b, (t0 + t1) / 2 + lean), e.n, height);
    // Outline = the same tooth grown outward, drawn underneath the fill.
    const grow = 0.035;
    const along = { x: (e.b.x - e.a.x) * grow, y: (e.b.y - e.a.y) * grow };
    out.push({ points: [add(baseA, along, -1), add(baseB, along), add(tip, e.n, grow * 1.6)], paint: "mark", layer: 0 });
    out.push({ points: [baseA, baseB, tip], paint: "intruder", layer: 1 });
  }
  return out;
};

// --- Option 2: jagged torn line --------------------------------------------
// The edge itself becomes an irregular zig-zag, pinned to the tile corners so
// neighbouring tiles' lines join up -- same "torn paper" language as the
// Breakthrough Momentum breach edge (client-breach-border.ts).
const JAG_SEGMENTS = 7;
const jagged = (e: PocketEdge): BreachPolygon[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= JAG_SEGMENTS; i += 1) {
    const t = i / JAG_SEGMENTS;
    const pinned = i === 0 || i === JAG_SEGMENTS;
    const swing = pinned ? 0 : (i % 2 === 0 ? -1 : 1) * (0.04 + hash(e.seed, i, 3, 0) * 0.1);
    pts.push(add(add(lerp(e.a, e.b, t), e.n, -0.02), e.n, swing));
  }
  return polyline(pts, 0.07, "mark", 2);
};

// --- Option 3: shattered wall + cracks -------------------------------------
// The outline breaks into offset, slightly rotated wall chunks with gaps, and
// from each gap a tapering crack (with a side branch) runs out into my tile.
const CHUNKS_PER_SIDE = 3;
const shattered = (e: PocketEdge): BreachPolygon[] => {
  const out: BreachPolygon[] = [];
  const gap = 0.1;
  for (let i = 0; i < CHUNKS_PER_SIDE; i += 1) {
    const t0 = i / CHUNKS_PER_SIDE + (i === 0 ? 0 : gap / 2);
    const t1 = (i + 1) / CHUNKS_PER_SIDE - (i === CHUNKS_PER_SIDE - 1 ? 0 : gap / 2);
    const shift = (hash(e.seed, i, 4, 0) - 0.5) * 0.09;
    const tilt = (hash(e.seed, i, 5, 0) - 0.5) * 0.1;
    const p = add(add(lerp(e.a, e.b, t0), e.n, -0.04 + shift), e.n, tilt);
    const q = add(add(lerp(e.a, e.b, t1), e.n, -0.04 + shift), e.n, -tilt);
    out.push({ points: segmentQuad(p, q, 0.095), paint: "mark", layer: 2 });
  }
  for (let g = 1; g < CHUNKS_PER_SIDE; g += 1) {
    const start = lerp(e.a, e.b, g / CHUNKS_PER_SIDE);
    const along = { x: e.b.x - e.a.x, y: e.b.y - e.a.y };
    const length = 0.34 + hash(e.seed, g, 6, 0) * 0.2;
    const crack: Pt[] = [start];
    for (let k = 1; k <= 3; k += 1) {
      const wobble = (hash(e.seed, g, 7, k) - 0.5) * 0.12;
      crack.push(add(add(start, e.n, (length * k) / 3), along, wobble));
    }
    out.push(...polyline(crack, 0.075, "mark", 2, 0.015));
    const fork = crack[1]!;
    const forkDir = hash(e.seed, g, 8, 0) > 0.5 ? 1 : -1;
    const forkEnd = add(add(fork, e.n, length * 0.35), along, forkDir * 0.14);
    out.push(...polyline([fork, forkEnd], 0.045, "mark", 2, 0.01));
  }
  return out;
};

/** All edge polygons for the given style. Sides that don't face my land always use the plain strip. */
export const buildBreachEdgePolygons = (world: BreachWorld, style: BreachEdgeStyle): BreachPolygon[] => {
  const out: BreachPolygon[] = [];
  for (const e of pocketEdges(world)) {
    if (style === "current" || !e.facesMine) out.push(insideStrip(e));
    else if (style === "spikes") out.push(...spikes(e));
    else if (style === "jagged") out.push(...jagged(e));
    else out.push(...shattered(e));
  }
  return out.sort((p, q) => p.layer - q.layer);
};

// --- Shared demo world ------------------------------------------------------
// My empire is an 11x7 block. Inside it: an L-shaped pocket, a single-tile
// pocket (like the screenshot), and a pocket on my outer border whose east
// side faces unowned land -- that side keeps the plain strip in every option.
export const MINE_HALF_WIDTH = 5;
export const MINE_HALF_HEIGHT = 3;

export const buildBreachDemoWorld = (): BreachWorld => {
  const pocketTiles = [
    [-3, -1],
    [-2, -1],
    [-2, 0],
    [1, 1],
    [5, -1],
    [5, 0]
  ];
  const pocket = new Set(pocketTiles.map(([x, y]) => tileKey(x!, y!)));
  const mine = new Set<string>();
  for (let y = -MINE_HALF_HEIGHT; y <= MINE_HALF_HEIGHT; y += 1) {
    for (let x = -MINE_HALF_WIDTH; x <= MINE_HALF_WIDTH; x += 1) {
      if (!pocket.has(tileKey(x, y))) mine.add(tileKey(x, y));
    }
  }
  return { mine, pocket };
};

export const parseTileKey = parseKey;
