// The channel a river mountain's river runs in (client-map-3d-river-cascade.ts):
// the mountain models are instanced and can't be cut, so instead each side of
// the water gets a low bank -- a lip a little above the water with an inner
// wall dropping to it, then sloping back down flush with the rock or ground --
// which reads, from the game camera, as a channel etched into stone (slate)
// or earth (tan, like the main rivers' banks) where it crosses the ground.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshLambertMaterial } from "three";

// Lip: this far out past the water's edge, and this far above the higher of
// the water's edge and the surface there.
const LIP_OUT = 0.02;
export const LIP_RISE = 0.013;
// Outer edge of the bank, flush with the surface.
const OUTER_OUT = 0.05;
// The inner wall reaches this far under the water's edge, so no gap shows.
const BED_DROP = 0.012;
const BED_IN = 0.006;
// Banks flatten out over the last stretch into the pool (fraction of the river).
const POOL_FADE = 0.08;

// Earth matches the main rivers' light tan banks; rock the mountains' slate.
const ROCK = { wall: new Color("#4d5560"), top: new Color("#66707c") };
const EARTH = { wall: new Color("#8a7a55"), top: new Color("#9c8c62") };

/** One side of the bank at one sample: heights of the bed, lip and outer edge, and what it cuts. */
export type CascadeBankSide = { readonly lipY: number; readonly outerY: number; readonly onRock: boolean };

export type CascadeBankInputs = {
  readonly x: number;
  readonly z: number;
  /** Unit normal across the flow (scene x/z). */
  readonly nx: number;
  readonly nz: number;
  readonly halfWidth: number;
  readonly edgeY: readonly [number, number];
  /** Position along the river, 0 at the spring, 1 at the pool. */
  readonly t: number;
  readonly surfaceAt: (x: number, z: number) => number;
  readonly isRockAt: (x: number, z: number) => boolean;
};

/** Both sides' bank profile at one river sample (left = -normal, right = +normal). */
export const cascadeBankAt = (input: CascadeBankInputs): readonly [CascadeBankSide, CascadeBankSide] => {
  const rise = LIP_RISE * Math.min(1, Math.max(0, (1 - input.t) / POOL_FADE));
  const side = (k: 0 | 1): CascadeBankSide => {
    const sign = k === 0 ? -1 : 1;
    const at = (out: number): readonly [number, number] => [
      input.x + input.nx * sign * (input.halfWidth + out),
      input.z + input.nz * sign * (input.halfWidth + out)
    ];
    const [lx, lz] = at(LIP_OUT);
    const [ox, oz] = at(OUTER_OUT);
    const edge = input.edgeY[k]!;
    return {
      lipY: Math.max(edge, input.surfaceAt(lx, lz)) + rise,
      outerY: Math.max(input.surfaceAt(ox, oz), edge - BED_DROP),
      onRock: input.isRockAt(lx, lz)
    };
  };
  return [side(0), side(1)];
};

/** The samples a bank mesh needs (a subset of CascadeSample). */
export type CascadeBankSample = {
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly edgeY: readonly [number, number];
  readonly bank: readonly [CascadeBankSide, CascadeBankSide];
};

type BankBuffers = { positions: number[]; colors: number[] };

const pushTri = (buffers: BankBuffers, verts: readonly (readonly [number, number, number])[], color: Color): void => {
  for (const v of verts) {
    buffers.positions.push(v[0], v[1], v[2]);
    buffers.colors.push(color.r, color.g, color.b);
  }
};

/** Appends one river's banks (unindexed, one flat colour per facet). */
export const appendCascadeBanks = (buffers: BankBuffers, samples: readonly CascadeBankSample[]): void => {
  // Cross-section per side, from under the water's edge outward: bed, lip, outer.
  const section = (i: number, k: 0 | 1): readonly (readonly [number, number, number])[] => {
    const p = samples[i]!;
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const sign = k === 0 ? -1 : 1;
    const nx = (-tz / len) * sign;
    const nz = (tx / len) * sign;
    const b = p.bank[k]!;
    const out = (d: number): readonly [number, number] => [p.x + nx * (p.halfWidth + d), p.z + nz * (p.halfWidth + d)];
    const [bx, bz] = out(-BED_IN);
    const [lx, lz] = out(LIP_OUT);
    const [ox, oz] = out(OUTER_OUT);
    return [
      [bx, p.edgeY[k]! - BED_DROP, bz],
      [lx, b.lipY, lz],
      [ox, b.outerY, oz]
    ];
  };
  for (let i = 0; i + 1 < samples.length; i += 1) {
    for (const k of [0, 1] as const) {
      const a = section(i, k);
      const c = section(i + 1, k);
      const palette = samples[i]!.bank[k]!.onRock ? ROCK : EARTH;
      // Inner wall (bed -> lip), then the outer slope (lip -> outer).
      pushTri(buffers, [a[0]!, c[0]!, a[1]!], palette.wall);
      pushTri(buffers, [a[1]!, c[0]!, c[1]!], palette.wall);
      pushTri(buffers, [a[1]!, c[1]!, a[2]!], palette.top);
      pushTri(buffers, [a[2]!, c[1]!, c[2]!], palette.top);
    }
  }
};

export const createCascadeBankGeometry = (buffers: BankBuffers): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 3));
  geometry.computeVertexNormals();
  return geometry;
};

/** Matte, flat-shaded stone/earth; double-sided so either winding shows. */
export const createCascadeBankMaterial = (): MeshLambertMaterial =>
  new MeshLambertMaterial({ color: "#ffffff", vertexColors: true, flatShading: true, side: DoubleSide });
