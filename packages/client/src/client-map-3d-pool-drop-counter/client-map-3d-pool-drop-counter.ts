// Small reusable "how many times a fixed-size render pool ran out of room
// this frame" counter. Extracted out of client-map-3d-aether-survey-line.ts
// (over the repo's 500-line file cap) since the same shape -- reset once
// per frame, increment on drop, read back for diagnostics -- applies to any
// pooled overlay, not just the Aether Survey Line's pylons/segments.
//
// Was previously silent everywhere it would apply: a pool that ran out
// just dropped the excess addX() call with no signal, which is exactly how
// the pylon-pool-exhaustion bug (islands/rivals going unrendered) went
// unnoticed. A persistent nonzero read here after culling/fair-allocation
// upstream means the cap itself is too small for the current on-screen
// content, not a transient blip.
export type PoolDropCounter = {
  readonly recordDrop: () => void;
  readonly reset: () => void;
  readonly count: () => number;
};

export const createPoolDropCounter = (): PoolDropCounter => {
  let dropped = 0;
  return {
    recordDrop: () => { dropped += 1; },
    reset: () => { dropped = 0; },
    count: () => dropped
  };
};
