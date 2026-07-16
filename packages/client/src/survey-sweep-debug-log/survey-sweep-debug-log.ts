import type { SurveySweepPing } from "../client-types.js";

// Temporary debug helpers for tracing whether survey sweep pings are
// created client-side and fed into the 3D render sync loop. Safe to remove
// once the floating-marker visibility issue is resolved.

export const logSurveySweepReceived = (rawPings: unknown, parsedPings: readonly { x: number; y: number; kind: SurveySweepPing["kind"] }[], stateLengthAfterPush: number): void => {
  console.log(
    `[survey-sweep-debug] client received SURVEY_SWEEP_RESULT rawPingsLength=${Array.isArray(rawPings) ? rawPings.length : "not-an-array"} parsedPingCount=${parsedPings.length} stateLengthAfterPush=${stateLengthAfterPush}`,
    parsedPings.slice(0, 5)
  );
};

let lastSurveySweepDebugLogAt = 0;

// Filters expired pings (mirrors the original inline filter) and, throttled
// to once per second, logs a snapshot of what would be fed into the
// overlay this frame, to trace whether pings ever reach the render sync
// step and where they'd be positioned in scene space.
export const filterAndLogSurveySweepPings = (
  pings: SurveySweepPing[],
  wallNowMs: number,
  camX: number,
  camY: number,
  sceneXYSurfaceYFor: (x: number, y: number) => { sceneX: number; sceneZ: number; surfaceY: number }
): SurveySweepPing[] => {
  const beforeFilterCount = pings.length;
  const filtered = pings.filter((ping) => ping.expiresAt > wallNowMs);
  if (beforeFilterCount > 0 && wallNowMs - lastSurveySweepDebugLogAt > 1000) {
    lastSurveySweepDebugLogAt = wallNowMs;
    const first = filtered[0];
    const position = first ? sceneXYSurfaceYFor(first.x, first.y) : undefined;
    console.log(
      `[survey-sweep-debug] client syncSurveySweepPings beforeFilter=${beforeFilterCount} afterFilter=${filtered.length} camX=${camX} camY=${camY} firstPing=${first ? `(${first.x},${first.y},${first.kind})` : "none"} sceneX=${position?.sceneX} sceneZ=${position?.sceneZ} surfaceY=${position?.surfaceY}`
    );
  }
  return filtered;
};
