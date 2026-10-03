// Decides whether decorative map units (the Planetary Defense patrol — see
// client-map-3d-planetary-defense-overlay.ts) animate, or stand still in a
// pose that is computed once and then left alone.
//
// Two reasons to stand still:
//
//   1. The player asked the OS for reduced motion (prefers-reduced-motion).
//      Read live, so toggling the OS setting takes effect without a reload.
//   2. The device is slow. The quality-tier ladder
//      (client-map-3d-quality-tier.ts) is driven by crash history, so a phone
//      that renders slowly but never crashes stays at tier 0 forever; it
//      can't answer "is this device struggling right now". Instead this
//      watches the 3D render loop's own frame times: once the smoothed frame
//      time stays above SLOW_FRAME_MS for SLOW_SUSTAIN_MS, it latches still
//      for the rest of the session.
//
// Why latch instead of resuming when frames speed up again: standing the
// units still is itself what makes the frames faster (no per-frame skeleton
// and mixer work), so un-latching on recovery would flap between the two
// states every few seconds.
//
// The first WARMUP_MS of frames are ignored (asset loading and the first
// terrain rebuild make startup frames slow on every device), and single
// gaps longer than MAX_COUNTED_FRAME_MS are skipped: a backgrounded tab or a
// one-off stall says nothing about the device's steady frame rate. Note that
// a browser that caps rAF at 30fps (iOS Low Power Mode) reads as slow and
// latches still, which is the intended outcome for a battery-saving device.

export const SLOW_FRAME_MS = 25; // ~40fps
export const SLOW_SUSTAIN_MS = 3_000;
export const WARMUP_MS = 5_000;
export const MAX_COUNTED_FRAME_MS = 250;
const SMOOTHING = 0.1;

export type UnitMotionGate = {
  /** Feed the render loop's per-frame clock (performance.now() ms). */
  readonly recordFrame: (nowMs: number) => void;
  /** True when units should animate this frame. */
  readonly shouldAnimate: () => boolean;
};

export type UnitMotionGateDeps = {
  readonly prefersReducedMotion: () => boolean;
  /** Called once, when the slow-device latch trips. */
  readonly onSlowDeviceLatched?: (smoothedFrameMs: number) => void;
};

const browserPrefersReducedMotion = (): (() => boolean) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => false;
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  return () => query.matches;
};

const browserGateDeps = (): UnitMotionGateDeps => ({
  prefersReducedMotion: browserPrefersReducedMotion(),
  // One line per session, so a "why are the soldiers standing still" report
  // can be answered from the console / debug log.
  onSlowDeviceLatched: (smoothedFrameMs) =>
    console.info(`[unit-motion] slow device (~${Math.round(smoothedFrameMs)}ms/frame): map units now stand still`)
});

export const createUnitMotionGate = (deps: UnitMotionGateDeps = browserGateDeps()): UnitMotionGate => {
  let firstFrameAt: number | undefined;
  let lastFrameAt: number | undefined;
  let smoothedFrameMs: number | undefined;
  let slowSince: number | undefined;
  let slowDeviceLatched = false;

  const recordFrame = (nowMs: number): void => {
    if (slowDeviceLatched) return;
    const previous = lastFrameAt;
    lastFrameAt = nowMs;
    if (firstFrameAt === undefined) firstFrameAt = nowMs;
    if (previous === undefined || nowMs - firstFrameAt < WARMUP_MS) return;
    const frameMs = nowMs - previous;
    if (frameMs <= 0 || frameMs > MAX_COUNTED_FRAME_MS) return;
    smoothedFrameMs = smoothedFrameMs === undefined ? frameMs : smoothedFrameMs + (frameMs - smoothedFrameMs) * SMOOTHING;
    if (smoothedFrameMs <= SLOW_FRAME_MS) {
      slowSince = undefined;
      return;
    }
    if (slowSince === undefined) slowSince = nowMs;
    if (nowMs - slowSince < SLOW_SUSTAIN_MS) return;
    slowDeviceLatched = true;
    deps.onSlowDeviceLatched?.(smoothedFrameMs);
  };

  const shouldAnimate = (): boolean => !slowDeviceLatched && !deps.prefersReducedMotion();

  return { recordFrame, shouldAnimate };
};
