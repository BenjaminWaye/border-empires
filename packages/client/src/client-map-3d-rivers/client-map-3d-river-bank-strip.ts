// v9 river banks drawn over the territory colour (docs/rivers-remake-plan.md,
// option A after the 1a review). The ownership fill is a flat sheet at the
// un-carved ground height, so on owned land it painted the carved bank the
// same flat owner colour right up to the water -- no visible bank, and the
// water read as a strip stuck on top. This strip lies on the carved bank
// itself, drawn after the ownership fill and before the water: dark wet
// earth at the waterline fading out at the top of the bank, so territory
// colour shows up to the bank and the river reads as cut into the land.
import { Color, DoubleSide, MeshBasicMaterial } from "three";
import {
  BANK_WIDTH,
  riverDescentScale,
  riverTrenchDepth,
  riverWaterHalfWidth,
  type ChannelPathPoint,
  type WaterBuffers,
  type WaterSides
} from "./client-map-3d-rivers-channel.js";

// Wet earth, darkest at the waterline. RGBA.
const BANK_WET: readonly [number, number, number, number] = [0.17, 0.14, 0.09, 0.85];
const BANK_MID: readonly [number, number, number, number] = [0.24, 0.2, 0.13, 0.5];
const BANK_TOP: readonly [number, number, number, number] = [0.3, 0.26, 0.17, 0];
// Sits just above the carved surface it lies on.
const BANK_LIFT_Y = 0.006;
// The strip starts a little inside the water's edge so there is no seam.
const INNER_OVERLAP = 0.85;

/**
 * Appends the two bank strips (one per side) along `run`, each from just
 * inside the water's edge to the top of the bank, conforming to the carved
 * trench. Sides that `sides` marks undrawable are skipped; mouth (plume)
 * samples end the strip -- the plume lies over the sea.
 */
export const appendBank = (
  buffers: WaterBuffers,
  run: readonly ChannelPathPoint[],
  sides: readonly WaterSides[],
  surfaceYAt: (sceneX: number, sceneZ: number) => number
): void => {
  const indices = run.flatMap((p, i) => ((p.mouth ?? 0) > 0 ? [] : [i]));
  const samples = indices.map((i) => run[i]!);
  if (samples.length < 2) return;
  for (const sign of [-1, 1] as const) {
    const base = buffers.positions.length / 3;
    samples.forEach((cur, i) => {
      const prev = samples[Math.max(0, i - 1)]!;
      const next = samples[Math.min(samples.length - 1, i + 1)]!;
      const tlen = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
      const nx = (-(next.z - prev.z) / tlen) * sign;
      const nz = ((next.x - prev.x) / tlen) * sign;
      const side = sides[indices[i]!];
      const drawn = !side || (sign < 0 ? side.left : side.right);
      // The wet bank fades out over the descent to the sea instead of
      // ending square at the coast.
      const descent = cur.descent ?? 0;
      const bankFade = 1 - descent * descent;
      pushBankColumns(buffers, cur, nx, nz, surfaceYAt, drawn ? bankFade : 0);
    });
    for (let i = 0; i + 1 < samples.length; i += 1) {
      for (let k = 0; k < 2; k += 1) {
        const a = base + i * 3 + k;
        const b = a + 1;
        const c = a + 3;
        const d = c + 1;
        buffers.indices.push(a, c, b, b, c, d);
      }
    }
  }
  appendBankSourceCap(buffers, samples, sides[indices[0]!], surfaceYAt);
};

/** The bank's three columns (wet, mid, top) at `cur`, out along unit (nx, nz), conforming to the carved trench. */
const pushBankColumns = (
  buffers: WaterBuffers,
  cur: ChannelPathPoint,
  nx: number,
  nz: number,
  surfaceYAt: (sceneX: number, sceneZ: number) => number,
  alpha: number
): void => {
  const inner = riverWaterHalfWidth(cur.halfWidth) * INNER_OVERLAP;
  const outer = cur.halfWidth + BANK_WIDTH;
  for (const [d, color] of [[inner, BANK_WET], [(inner + outer) / 2, BANK_MID], [outer, BANK_TOP]] as const) {
    const x = cur.x + nx * d;
    const z = cur.z + nz * d;
    const surface = surfaceYAt(x, z);
    const y = surface - riverTrenchDepth(d, cur.halfWidth) * riverDescentScale(surface, cur.descent ?? 0) + BANK_LIFT_Y;
    buffers.positions.push(x, y, z);
    buffers.colors.push(color[0], color[1], color[2], color[3] * alpha);
  }
};

const CAP_SEGMENTS = 10;

/**
 * Rings the spring pool at a river's head (`samples[0].source`) with bank:
 * the two side strips' columns swept round the back of the first sample, so
 * the wet bank closes round the pool instead of ending square.
 */
const appendBankSourceCap = (
  buffers: WaterBuffers,
  samples: readonly ChannelPathPoint[],
  side: WaterSides | undefined,
  surfaceYAt: (sceneX: number, sceneZ: number) => number
): void => {
  const head = samples[0]!;
  const next = samples[1]!;
  if (!head.source || (side && (!side.left || !side.right))) return;
  const tlen = Math.hypot(next.x - head.x, next.z - head.z) || 1;
  const tx = (next.x - head.x) / tlen;
  const tz = (next.z - head.z) / tlen;
  const base = buffers.positions.length / 3;
  for (let k = 0; k <= CAP_SEGMENTS; k += 1) {
    const a = (k / CAP_SEGMENTS) * Math.PI;
    pushBankColumns(buffers, head, -tz * Math.cos(a) - tx * Math.sin(a), tx * Math.cos(a) - tz * Math.sin(a), surfaceYAt, 1);
  }
  for (let k = 0; k < CAP_SEGMENTS; k += 1) {
    for (let c = 0; c < 2; c += 1) {
      const a = base + k * 3 + c;
      const b = a + 1;
      const d = a + 3;
      const e = d + 1;
      buffers.indices.push(a, d, b, b, d, e);
    }
  }
};

export const createRiverBankMaterial = (): MeshBasicMaterial =>
  new MeshBasicMaterial({
    toneMapped: false,
    color: new Color(1, 1, 1),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: DoubleSide
  });
