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
// So the ratio is capped — and the cap itself is no longer fixed. It is now
// supplied by the degradation ladder in client-map-3d-quality-tier.ts, which
// reads the crash breadcrumb and hands down a lower cap each time a device
// fails to keep 3D alive. This module's only remaining job is to reconcile
// that cap with what the device reports.
//
// The back-off decision used to live here, as a single boolean keyed on the
// previous attempt's phase being "init-started" (the tab-died-during-
// allocation shape). That was too narrow: it left every *other* kind of death
// — including "init-completed", the phase an iPhone actually reports before
// being killed — running at the full 2x ratio on every subsequent attempt,
// until the crash-loop brake gave up on 3D entirely. The ladder now owns that
// judgement across all the levers (ratio, MSAA, tile budget) instead of this
// module owning one of them in isolation.
//
// Worth preserving from that first version, because it is still a live trap
// for anyone extending the ladder: backing off on *any* phase other than
// "survived" is wrong. "init-completed" is the state a perfectly healthy
// session leaves behind if it's shorter than the breadcrumb's own 8s survival
// timer (SURVIVAL_MS in client-renderer-crash-breadcrumb.ts), or if the tab is
// backgrounded before that timer fires, which mobile does constantly. The
// ladder keys off `failedAttempts` rather than phase alone for exactly this
// reason.

/** Beyond 2x the extra pixels cost 4x the fill rate for no visible gain. */
export const MAX_PIXEL_RATIO = 2;

export type PixelRatioInput = {
  readonly devicePixelRatio: number;
  /**
   * Upper bound from the quality tier (see client-map-3d-quality-tier.ts).
   * Omitted means full quality, i.e. MAX_PIXEL_RATIO.
   */
  readonly maxPixelRatio?: number | undefined;
};

export const pixelRatioFor = ({ devicePixelRatio, maxPixelRatio }: PixelRatioInput): number => {
  // A non-finite or nonsensical ratio means we can't trust the device's own
  // report; 1 is the value this renderer shipped with and is always safe.
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  const cap =
    maxPixelRatio !== undefined && Number.isFinite(maxPixelRatio) && maxPixelRatio > 0
      ? Math.min(maxPixelRatio, MAX_PIXEL_RATIO)
      : MAX_PIXEL_RATIO;
  return Math.min(devicePixelRatio, cap);
};
