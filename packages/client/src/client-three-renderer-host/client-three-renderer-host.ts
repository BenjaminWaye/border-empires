// Owns the 3D renderer's lifecycle for a session: lazily constructing it once
// auth is ready, and — the reason this module exists — retiring it for good
// when it can't run on this device.
//
// The 3D renderer has two ways to fail on hardware we can't reproduce on: its
// init throws (no webgl2, or a context the browser refuses), or the GPU takes
// the context away later, which Safari on iOS does under memory pressure.
// Before this, both paths ended the same way — a `console.error` and a blank
// canvas — which is exactly the reported "3D doesn't work on my iPhone but 2D
// does" experience, with nothing on screen or in any bundle to act on.
//
// Either failure now retires 3D for the session: the renderer is torn down,
// the frame goes back to the 2D renderer (which the runtime loop already falls
// back to whenever no 3D renderer is present and true-3D is inactive), the
// reason is recorded for the diagnostics bundle, and the player is told.

import { MIN_ZOOM } from "../client-constants.js";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { resolveTileBudget } from "../client-map-3d-tile-budget/client-map-3d-tile-budget.js";
import { recordRendererFailure } from "../client-webgl-probe/client-webgl-probe.js";
import { showRendererFallbackNotice } from "../client-renderer-fallback-notice/client-renderer-fallback-notice.js";
import { qualitySettingsFor } from "../client-map-3d-quality-tier/client-map-3d-quality-tier.js";
import {
  beginRendererAttempt,
  clearRendererCrashStreak,
  markRendererAttemptHandled,
  markRendererInitCompleted,
  previousRendererAttempt,
  previousSessionEndedUncleanly,
  recordRendererHeartbeat,
  shouldSkipThreeDAfterCrashes
} from "../client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";

// How often to refresh the crash breadcrumb's heartbeat while 3D is alive.
// Frequent enough that a death leaves a timestamp worth reading, infrequent
// enough not to be a meaningful localStorage-write burden over a long session.
const HEARTBEAT_INTERVAL_MS = 15000;

/** The slice of the 3D renderer this host needs; keeps three.js out of here. */
export type StoppableRenderer = { readonly stop: () => void };

export type ThreeRendererHostDeps<TRenderer extends StoppableRenderer> = {
  /** False when the session asked for `?renderer=2d`; 3D is never attempted. */
  readonly enabled: boolean;
  /** Construction is deferred until this returns true (auth session ready). */
  readonly isReady: () => boolean;
  readonly create: (onContextLost: (reason: string) => void) => TRenderer;
  /** Resizes the 2D canvas once the WebGL canvas is gone. */
  readonly resizeTwoDimensionalCanvas: () => void;
};

export type ThreeRendererHost<TRenderer extends StoppableRenderer> = {
  /** Constructs the renderer if it is wanted, ready, and hasn't already failed. */
  readonly ensure: () => void;
  /** The live 3D renderer, or undefined when the 2D renderer owns the frame. */
  readonly current: () => TRenderer | undefined;
};

export const createThreeRendererHost = <TRenderer extends StoppableRenderer>(
  deps: ThreeRendererHostDeps<TRenderer>
): ThreeRendererHost<TRenderer> => {
  let renderer: TRenderer | undefined;
  // Latched once 3D has failed, so a per-frame `ensure()` doesn't retry a
  // doomed init — and re-probe, and re-log — on every HUD render.
  let failed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const stopHeartbeat = (): void => {
    if (heartbeatTimer === undefined) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  };

  if (!deps.enabled) setTrue3DRendererActive(false);

  // Render caches (terrain colors, minimap base, dock routes) are deliberately
  // left alone here: they are renderer-agnostic and stay valid across the swap,
  // and clearing them would drop the minimap base with nothing scheduled to
  // rebuild it until the next world-seed message.
  const retire = (
    reason: string,
    options?: { readonly preserveCrashStreak?: boolean; readonly onRetry?: () => void }
  ): void => {
    failed = true;
    const dead = renderer;
    renderer = undefined;
    stopHeartbeat();
    setTrue3DRendererActive(false);
    recordRendererFailure(reason);
    // A failure we caught and handled is not a crash, and must not count
    // toward the crash-loop brake. The brake's *own* path is the exception:
    // clearing the streak there would re-arm 3D on the next load and resume
    // the crash loop, so the brake would only hold every other time.
    if (!options?.preserveCrashStreak) markRendererAttemptHandled();
    try {
      dead?.stop();
    } catch (stopError) {
      console.error("[renderer-3d-teardown-failed]", stopError);
    }
    showRendererFallbackNotice(reason, options?.onRetry ? { onRetry: options.onRetry } : undefined);
    try {
      deps.resizeTwoDimensionalCanvas();
    } catch (resizeError) {
      console.error("[renderer-2d-fallback-resize-failed]", resizeError);
    }
  };

  const ensure = (): void => {
    if (!deps.enabled || failed || renderer) return;
    if (!deps.isReady()) return;
    // A device that died again at the *bottom* of the degradation ladder
    // (client-map-3d-quality-tier.ts) gets 2D without another try: it has now
    // failed at minimum pixel ratio, no MSAA, and a screen-sized tile budget,
    // so there is nothing cheaper left to offer it. Nothing here can catch
    // that death, so refusing to repeat it is the only available handling —
    // see the breadcrumb module.
    if (shouldSkipThreeDAfterCrashes()) {
      retire("3D crashed this browser on the last attempts — using the 2D map.", {
        preserveCrashStreak: true,
        onRetry: () => {
          // A reload alone isn't enough: shouldSkipThreeDAfterCrashes() reads
          // the streak straight from storage, so without this the very next
          // load would trip the brake again and show this exact banner.
          clearRendererCrashStreak();
          if (typeof window === "undefined") return;
          const url = new URL(window.location.href);
          url.searchParams.set("renderer", "3d");
          window.location.assign(url.toString());
        }
      });
      return;
    }
    // Same ladder the render target reads for pixel ratio and MSAA, so a given
    // attempt is consistently sized: at the bottom tier the floor drops and
    // the budget is whatever the screen genuinely shows.
    const quality = qualitySettingsFor({
      previousAttempt: previousRendererAttempt(),
      previousSessionEndedUncleanly: previousSessionEndedUncleanly()
    });
    const tileBudget = resolveTileBudget(MIN_ZOOM, quality.tileBudgetFloor);
    try {
      // On disk before a byte is allocated: if the tab is killed during
      // construction, the next load reads this and knows where it died.
      beginRendererAttempt(tileBudget);
      const created = deps.create((reason) => {
        console.error("[renderer-3d-context-lost]", reason);
        retire(`WebGL context lost: ${reason}`);
      });
      // A context can be lost *during* construction — the over-subscribed-GPU
      // case this whole path exists for. `retire` already ran, with no handle
      // to the half-built renderer, so stopping it is on us; assigning it here
      // would silently resurrect a renderer with a dead context.
      if (failed) {
        try {
          created.stop();
        } catch (stopError) {
          console.error("[renderer-3d-teardown-failed]", stopError);
        }
        return;
      }
      renderer = created;
      markRendererInitCompleted(tileBudget);
      setTrue3DRendererActive(true);
      // Keep the breadcrumb's heartbeat fresh for as long as this attempt
      // lives — a crash long after startup (the iOS memory-pressure shape)
      // otherwise looks identical to "survived" forever.
      stopHeartbeat();
      heartbeatTimer = setInterval(() => recordRendererHeartbeat(tileBudget), HEARTBEAT_INTERVAL_MS);
    } catch (error) {
      console.error("[renderer-3d-init-failed]", error);
      retire(error instanceof Error ? error.message : String(error));
    }
  };

  return { ensure, current: () => renderer };
};
