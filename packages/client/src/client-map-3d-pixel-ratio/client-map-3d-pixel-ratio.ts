// The 3D renderer used to hardcode `setPixelRatio(1)`, which draws one GL
// pixel per CSS pixel. On a phone reporting devicePixelRatio 3 that throws
// away ~89% of the panel's actual resolution, and is most of why the map reads
// as soft next to the crisp DOM HUD sitting on top of it.
//
// Rendering at the device ratio instead is the single cheapest sharpness win
// available, but it is not free: the drawing buffer (color + depth + the
// antialias resolve target) scales with the *square* of the ratio, so 2x costs
// 4x the pixels and 4x that buffer's memory.
//
// That cost lands on exactly the devices least able to pay it. The renderer
// already preallocates ~100MB of overlay buffers at the tile budget (see
// client-map-3d-tile-budget.ts) and still dies during construction on some
// phones — which is the entire reason the crash breadcrumb exists. Asking one
// of those devices for a 4x drawing buffer on top of that is how a sharpness
// change turns into a crash-loop regression.
//
// So the ratio is capped, and backed off to 1 only when the breadcrumb shows
// the *specific* memory-exhaustion signature: the previous attempt's phase is
// still "init-started" — the tab died while allocating buffers, before it
// could even record "init-completed". Every other phase backs off to nothing:
// "init-completed" means allocation itself was fine last time, and
// "survived" obviously was. A device that has shown it is short on GPU memory
// keeps today's exact allocation; every other device gets the sharper buffer.
//
// This module's first version backed off on *any* phase other than
// "survived" — which includes "init-completed", the state a perfectly healthy
// session leaves behind if it's shorter than the breadcrumb's own 8s
// survival timer (SURVIVAL_MS in client-renderer-crash-breadcrumb.ts), or if
// the tab is backgrounded before that timer fires, which mobile does
// constantly. That treated routine short/backgrounded sessions as crashes and
// silently capped pixel ratio back to 1 on devices that never had a problem.

/** Beyond 2x the extra pixels cost 4x the fill rate for no visible gain. */
export const MAX_PIXEL_RATIO = 2;

export type PixelRatioInput = {
  readonly devicePixelRatio: number;
  /**
   * True only when the previous session's 3D attempt never got past
   * "init-started" — the breadcrumb phase recorded immediately before
   * allocation, and the one a tab killed mid-allocation leaves behind. False
   * (or undefined, when there's no previous attempt to judge) covers every
   * other case, including "init-completed", and counts as healthy.
   */
  readonly previousAttemptDiedDuringAllocation: boolean | undefined;
};

export const pixelRatioFor = ({ devicePixelRatio, previousAttemptDiedDuringAllocation }: PixelRatioInput): number => {
  // A non-finite or nonsensical ratio means we can't trust the device's own
  // report; 1 is the value this renderer shipped with and is always safe.
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  // Stay at today's allocation on a device that showed the actual
  // memory-exhaustion signature. Sharpness is not worth re-entering that.
  if (previousAttemptDiedDuringAllocation === true) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
};
