// Wander helper shared by the 2D settle loader and the 3D ancillary figures
// (settle overlay, construction crew). Three-free on purpose so the 2D canvas
// path can import it without pulling in the 3D renderer.
//
// The hash is Murmur3-style: each input is folded through a prime multiply
// before combining, so a 1-bit change in any input propagates through all 32
// bits. The old 2D seed XORed small products of small tile coordinates, which
// left every settler dot of a tile within ~0.01 of [0,1] -- they all stacked
// in the tile's top-left pixel and barely moved.
const SETTLE_MOVE_MS = 1700;
const SETTLE_PAUSE_MS = 1000;
const SETTLE_CYCLE_MS = SETTLE_MOVE_MS + SETTLE_PAUSE_MS;

export const wanderHash01 = (wx: number, wy: number, i: number, salt: number): number => {
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
