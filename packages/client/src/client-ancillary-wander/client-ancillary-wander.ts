// The ancillaries' pause-and-walk wander: each figure picks a random spot in the unit
// square, walks there, pauses, and repeats. Shared by the 3D settle overlay, the 3D
// construction crew and the 2D construction crew, so all of them move the same way.
// Deliberately free of any `three` import so the 2D renderer can use it too.

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
