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
// So the ratio is capped, and backed off to 1 on any device whose last 3D
// attempt didn't survive. A device that has already shown it is short on GPU
// memory keeps today's exact allocation; every healthy device gets the
// sharper buffer.

/** Beyond 2x the extra pixels cost 4x the fill rate for no visible gain. */
export const MAX_PIXEL_RATIO = 2;

export type PixelRatioInput = {
  readonly devicePixelRatio: number;
  /**
   * Whether the previous session's 3D attempt failed to reach "survived" —
   * the memory-exhaustion signature the breadcrumb records. Undefined when
   * there is no previous attempt to judge (a first run counts as healthy).
   */
  readonly previousAttemptSurvived: boolean | undefined;
};

export const pixelRatioFor = ({ devicePixelRatio, previousAttemptSurvived }: PixelRatioInput): number => {
  // A non-finite or nonsensical ratio means we can't trust the device's own
  // report; 1 is the value this renderer shipped with and is always safe.
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  // Stay at today's allocation on a device that already failed to get through
  // renderer construction. Sharpness is not worth re-entering the crash loop.
  if (previousAttemptSurvived === false) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
};
