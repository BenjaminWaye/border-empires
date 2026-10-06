import { BoxGeometry, MeshStandardMaterial } from "three";

// Ancillaries: the small dark bodies the AFC's AI drives. Shared by the 3D
// settle overlay (settlers wandering a tile) and the construction crew layer
// (docs/construction-animation-plan.md), so both read as the same "people".

// Local wander helper. Replaces the shared `settlePixelWanderPoint` for
// the 3D path because the shared seed (in client-capture-effects.ts)
// XORs small wx/wy/salt products that dominate the high bits — the `i`
// term only flips low bits, so different settlers cluster within ~0.003
// of [0,1] and visually stack on a single pixel. The 2D loader hides
// this because each pixel-dot already snaps to integer coordinates;
// for 3D we need genuine spread per `i`. Using xmur3-style mixing.
const SETTLE_MOVE_MS = 1700;
const SETTLE_PAUSE_MS = 1000;
const SETTLE_CYCLE_MS = SETTLE_MOVE_MS + SETTLE_PAUSE_MS;

export const wanderHash01 = (wx: number, wy: number, i: number, salt: number): number => {
  // Murmur3-style mixing. Each input is folded through a prime multiply
  // before combining, so a 1-bit change in any input propagates through
  // all 32 bits of the result. Prior implementation used small XORs of
  // small products, which left the i-term in the low bits only and
  // produced visually stacked dots.
  let h = Math.imul(wx | 0, 374761393);
  h = Math.imul(h + ((wy | 0) ^ 0x5bd1e995), -1640531535);
  h = Math.imul(h + (i | 0), -549389765);
  h = Math.imul(h + (salt | 0), 1597334677);
  h = Math.imul(h ^ (h >>> 16), -2048144789);
  h = Math.imul(h ^ (h >>> 13), -1028477387);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
};

export const wanderPoint = (
  nowMs: number,
  wx: number,
  wy: number,
  i: number
): { x: number; y: number } => {
  const offsetMs = wanderHash01(wx, wy, i, 11) * SETTLE_CYCLE_MS;
  const localTime = nowMs + offsetMs;
  const segment = Math.floor(localTime / SETTLE_CYCLE_MS);
  const segmentTime = localTime - segment * SETTLE_CYCLE_MS;
  const fromX = wanderHash01(wx, wy, i, 41 + segment * 13);
  const fromY = wanderHash01(wx, wy, i, 83 + segment * 17);
  const toX = wanderHash01(wx, wy, i, 41 + (segment + 1) * 13);
  const toY = wanderHash01(wx, wy, i, 83 + (segment + 1) * 17);
  const t = segmentTime >= SETTLE_MOVE_MS ? 1 : segmentTime / SETTLE_MOVE_MS;
  return { x: fromX + (toX - fromX) * t, y: fromY + (toY - fromY) * t };
};

// Pinprick figures. Floor at ~0.022 width: anything smaller is sub-pixel
// at typical zoom and the whole swarm rasterises into one pixel — looks
// like a single static settler. Height stays taller than width so they
// read as standing figures, not flat dots.
export const PERSON_W = 0.022;
export const PERSON_H = 0.05;
export const PERSON_D = 0.022;
export const PERSON_Y = PERSON_H * 0.5 + 0.005;

export const createAncillaryFigureAssets = (): { geometry: BoxGeometry; material: MeshStandardMaterial } => ({
  geometry: new BoxGeometry(PERSON_W, PERSON_H, PERSON_D),
  material: new MeshStandardMaterial({
    // Slight emissive lifts the dots out of shadow so they read as
    // distinct points rather than blending into the dark plate.
    color: "#0a0d12",
    emissive: "#1a1d22",
    emissiveIntensity: 0.6,
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  })
});
