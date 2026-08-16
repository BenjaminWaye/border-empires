// Bloom is a real extra cost on top of everything the renderer already
// allocates: two EffectComposers, each with its own pair of render targets,
// plus UnrealBloomPass's internal 5-level mip chain of blur buffers. Even
// with the memory-saving choices in client-map-3d-bloom-pipeline.ts
// (UnsignedByteType instead of the default HalfFloatType, and the bloom
// composer running at half the canvas resolution), this is tens of
// megabytes of additional GPU buffers on devices where the renderer's
// existing ~100MB overlay-buffer allocation is already, per
// client-map-3d-tile-budget.ts, "right at the edge of what Safari on a
// phone will hand a single tab."
//
// Same signal, same reasoning as client-map-3d-pixel-ratio.ts's guard:
// back off only on the breadcrumb's actual memory-exhaustion signature
// (the previous attempt died during "init-started", before it could even
// finish allocating), not on every phase that isn't "survived" — a session
// under the breadcrumb's 8s survival timer, or one backgrounded before it
// fires, is a healthy session, not a crash.

export type BloomEnabledInput = {
  /**
   * True only when the previous session's 3D attempt never got past
   * "init-started" — see client-map-3d-pixel-ratio.ts's identical field for
   * the full reasoning. False or undefined (no previous attempt to judge)
   * both count as healthy.
   */
  readonly previousAttemptDiedDuringAllocation: boolean | undefined;
};

export const bloomEnabledFor = ({ previousAttemptDiedDuringAllocation }: BloomEnabledInput): boolean =>
  previousAttemptDiedDuringAllocation !== true;
