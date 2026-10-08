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
      const inner = riverWaterHalfWidth(cur.halfWidth) * INNER_OVERLAP;
      const outer = cur.halfWidth + BANK_WIDTH;
      for (const [d, color] of [[inner, BANK_WET], [(inner + outer) / 2, BANK_MID], [outer, BANK_TOP]] as const) {
        const x = cur.x + nx * d;
        const z = cur.z + nz * d;
        const surface = surfaceYAt(x, z);
        const y = surface - riverTrenchDepth(d, cur.halfWidth) * riverDescentScale(surface, cur.descent ?? 0) + BANK_LIFT_Y;
        buffers.positions.push(x, y, z);
        buffers.colors.push(color[0], color[1], color[2], drawn ? color[3] * bankFade : 0);
      }
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
