import { getCurrentFps } from "../client-fps-monitor/client-fps-monitor.js";

const MEMORY_SAMPLE_INTERVAL_MS = 30_000;
const FPS_SAMPLE_INTERVAL_MS = 2_000;
// ~1-2 minutes of real frames at 25-42fps — long enough to still hold an
// earlier lag spike by the time a player notices and clicks Download
// Diagnostics, short enough to stay cheap (a few dozen KB) for the session.
const MAX_FRAME_PHASE_SAMPLES = 1_800;
const MAX_DRAW_FPS_SAMPLES = 1_800;
// A gap this large between rendered frames means the tab was backgrounded
// or the browser paused rAF entirely, not that the renderer is slow —
// without this cap one resumed-from-background frame poisons drawFps's
// min/p50 with a near-zero outlier for as long as it stays in the buffer.
const MAX_DRAW_FRAME_GAP_MS = 1_000;

const fpsSamples: number[] = [];
const MAX_FPS_SAMPLES = 3000;

export type FramePhaseSample = {
  frameSetupMs: number;
  tileRenderMs: number;
  overlayPostMs: number;
  totalFrameMs: number;
};

const framePhaseSamples: FramePhaseSample[] = [];
const drawFpsSamples: number[] = [];

let navTiming: Record<string, number | string | undefined> | undefined;
let connectionInfo: Record<string, unknown> | undefined;
let windowInfo: Record<string, number | string | undefined> | undefined;
let memorySamples: Array<{ at: number; usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }> = [];
let memoryTimer: ReturnType<typeof setInterval> | undefined;
let fpsTimer: ReturnType<typeof setInterval> | undefined;

const percentile = (sorted: number[], pct: number): number | undefined => {
  if (sorted.length === 0) return undefined;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
};

const captureNavTiming = (): Record<string, number | string | undefined> => {
  const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
  if (nav) {
    return {
      navigationType: nav.type,
      domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
      domContentLoadedEventStart: nav.domContentLoadedEventStart,
      domComplete: nav.domComplete,
      domInteractive: nav.domInteractive,
      loadEventEnd: nav.loadEventEnd,
      loadEventStart: nav.loadEventStart,
      requestStart: nav.requestStart,
      responseStart: nav.responseStart,
      responseEnd: nav.responseEnd,
      redirectEnd: nav.redirectEnd,
      redirectStart: nav.redirectStart,
      secureConnectionStart: nav.secureConnectionStart,
      domainLookupEnd: nav.domainLookupEnd,
      domainLookupStart: nav.domainLookupStart,
      connectEnd: nav.connectEnd,
      connectStart: nav.connectStart,
      fetchStart: nav.fetchStart,
      transferSize: nav.transferSize,
      encodedBodySize: nav.encodedBodySize,
      decodedBodySize: nav.decodedBodySize,
      duration: nav.duration,
      startTime: 0
    };
  }
  const legacy = performance.timing;
  if (legacy) {
    return {
      navigationStart: legacy.navigationStart,
      domContentLoadedEventEnd: legacy.domContentLoadedEventEnd,
      domContentLoadedEventStart: legacy.domContentLoadedEventStart,
      domComplete: legacy.domComplete,
      domInteractive: legacy.domInteractive,
      loadEventEnd: legacy.loadEventEnd,
      loadEventStart: legacy.loadEventStart,
      requestStart: legacy.requestStart,
      responseStart: legacy.responseStart,
      responseEnd: legacy.responseEnd,
      domLoading: legacy.domLoading,
      redirectEnd: legacy.redirectEnd,
      redirectStart: legacy.redirectStart,
      secureConnectionStart: legacy.secureConnectionStart,
      domainLookupEnd: legacy.domainLookupEnd,
      domainLookupStart: legacy.domainLookupStart,
      connectEnd: legacy.connectEnd,
      connectStart: legacy.connectStart,
      fetchStart: legacy.fetchStart
    };
  }
  return {};
};

const captureConnectionInfo = (): Record<string, unknown> | undefined => {
  const conn = (navigator as unknown as Record<string, unknown>).connection as Record<string, unknown> | undefined;
  if (!conn) return undefined;
  return {
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData,
    type: conn.type
  };
};

const captureWindowInfo = (): Record<string, number | string | undefined> => {
  if (typeof window === "undefined") return {};
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    colorDepth: window.screen?.colorDepth
  };
};

const sampleMemory = (): void => {
  const mem = (performance as unknown as Record<string, unknown>).memory as
    | { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    | undefined;
  if (!mem) return;
  memorySamples.push({
    at: Date.now(),
    usedJSHeapSize: mem.usedJSHeapSize,
    totalJSHeapSize: mem.totalJSHeapSize,
    jsHeapSizeLimit: mem.jsHeapSizeLimit
  });
  if (memorySamples.length > 60) memorySamples.splice(0, memorySamples.length - 60);
};

const sampleFps = (): void => {
  const fps = getCurrentFps();
  if (fps !== undefined) {
    fpsSamples.push(fps);
    if (fpsSamples.length > MAX_FPS_SAMPLES) fpsSamples.shift();
  }
};

// Records one completed render loop's phase timings, keyed to the same
// frame (as opposed to the old performance.mark-based approach, which
// paired marks from whichever frame happened to be most recent when the
// snapshot was taken — including the idle gap since the last frame if a
// snapshot was requested between frames).
export const recordFramePhaseSample = (sample: FramePhaseSample): void => {
  framePhaseSamples.push(sample);
  if (framePhaseSamples.length > MAX_FRAME_PHASE_SAMPLES) framePhaseSamples.shift();
};

// Distinct from client-fps-monitor's getCurrentFps(), which samples on
// every requestAnimationFrame tick (including ticks the mobile frame-gap
// throttle bails out of) and drives the low-fps renderer-downgrade prompt.
// This tracks the cadence of frames that actually rendered, so a reading
// pinned near the mobile throttle's cap (25fps) reads as "hitting the
// intentional cap," not "renderer is struggling." Takes the previous draw's
// timestamp from the caller (which already tracks it for the throttle gate)
// rather than duplicating that bookkeeping here.
export const recordDrawFrame = (previousDrawAt: number, nowMs: number): void => {
  if (previousDrawAt > 0) {
    const deltaMs = nowMs - previousDrawAt;
    if (deltaMs > 0 && deltaMs < MAX_DRAW_FRAME_GAP_MS) {
      drawFpsSamples.push(1000 / deltaMs);
      if (drawFpsSamples.length > MAX_DRAW_FPS_SAMPLES) drawFpsSamples.shift();
    }
  }
};

const numericStats = (
  values: number[]
): { count: number; min: number; max: number; avg: number; p50: number; p95: number; p99: number } | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: percentile(sorted, 50)!,
    p95: percentile(sorted, 95)!,
    p99: percentile(sorted, 99)!
  };
};

export const snapshotFramePhases = (): Record<string, ReturnType<typeof numericStats>> | undefined => {
  if (framePhaseSamples.length === 0) return undefined;
  return {
    frameSetupMs: numericStats(framePhaseSamples.map((s) => s.frameSetupMs)),
    tileRenderMs: numericStats(framePhaseSamples.map((s) => s.tileRenderMs)),
    overlayPostMs: numericStats(framePhaseSamples.map((s) => s.overlayPostMs)),
    totalFrameMs: numericStats(framePhaseSamples.map((s) => s.totalFrameMs))
  };
};

export const initPerformanceMetrics = (): void => {
  if (navTiming) return;
  navTiming = captureNavTiming();
  connectionInfo = captureConnectionInfo();
  windowInfo = captureWindowInfo();
  sampleMemory();
  sampleFps();
  if (typeof setInterval !== "undefined") {
    memoryTimer = setInterval(sampleMemory, MEMORY_SAMPLE_INTERVAL_MS);
    fpsTimer = setInterval(sampleFps, FPS_SAMPLE_INTERVAL_MS);
  }
};

export const snapshotPerformanceMetrics = (): Record<string, unknown> => {
  const mem = (performance as unknown as Record<string, unknown>).memory as
    | { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    | undefined;

  return {
    fps: numericStats(fpsSamples),
    fpsNote:
      "Sampled on every requestAnimationFrame tick, including ticks the mobile frame-gap throttle skips before rendering. Reflects main-thread responsiveness/jank, not visual update rate.",
    drawFps: numericStats(drawFpsSamples),
    drawFpsNote:
      "Sampled once per frame that actually rendered (post-throttle). A reading pinned near the mobile cap (25fps) means the renderer is hitting its intentional cap, not struggling.",
    framePhases: snapshotFramePhases(),
    navigationTiming: navTiming,
    connection: connectionInfo,
    window: windowInfo,
    memory: mem
      ? {
          usedJSHeapSize: mem.usedJSHeapSize,
          totalJSHeapSize: mem.totalJSHeapSize,
          jsHeapSizeLimit: mem.jsHeapSizeLimit,
          samples: memorySamples.slice(-20)
        }
      : undefined
  };
};

export const resetPerformanceMetricsForTests = (): void => {
  fpsSamples.length = 0;
  framePhaseSamples.length = 0;
  drawFpsSamples.length = 0;
  navTiming = undefined;
  connectionInfo = undefined;
  windowInfo = undefined;
  memorySamples = [];
  if (memoryTimer !== undefined) {
    clearInterval(memoryTimer);
    memoryTimer = undefined;
  }
  if (fpsTimer !== undefined) {
    clearInterval(fpsTimer);
    fpsTimer = undefined;
  }
};
