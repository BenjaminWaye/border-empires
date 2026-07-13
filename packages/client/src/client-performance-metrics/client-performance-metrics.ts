import { getCurrentFps } from "../client-fps-monitor/client-fps-monitor.js";

const MEMORY_SAMPLE_INTERVAL_MS = 30_000;
const FPS_SAMPLE_INTERVAL_MS = 2_000;

const fpsSamples: number[] = [];
const MAX_FPS_SAMPLES = 3000;

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

export const markPhase = (name: string): void => {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(name);
  }
};

export const measurePhase = (name: string, startMark: string, endMark: string): number | undefined => {
  if (typeof performance !== "undefined" && typeof performance.measure === "function") {
    try {
      const m = performance.measure(name, startMark, endMark);
      return m.duration;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const snapshotFramePhases = (): Record<string, number | undefined> | undefined => {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return undefined;
  const marks = performance.getEntriesByType("mark") as PerformanceMark[];
  if (marks.length === 0) return undefined;

  let frameStart = 0;
  let tileStart = 0;
  let tileEnd = 0;

  for (let i = marks.length - 1; i >= 0; i--) {
    const e = marks[i]!;
    if (!tileEnd && e.name === "tile-end") tileEnd = e.startTime;
    if (!tileStart && e.name === "tile-start") tileStart = e.startTime;
    if (!frameStart && e.name === "frame-start") frameStart = e.startTime;
    if (frameStart && tileStart && tileEnd) break;
  }

  const now = performance.now();
  return {
    frameSetupMs: tileStart > 0 && frameStart > 0 ? tileStart - frameStart : undefined,
    tileRenderMs: tileEnd > 0 && tileStart > 0 ? tileEnd - tileStart : undefined,
    overlayPostMs: tileEnd > 0 ? now - tileEnd : undefined,
    totalFrameMs: frameStart > 0 ? now - frameStart : undefined
  };
};

export const clearFramePhaseMarks = (): void => {
  try { performance.clearMarks("frame-start"); } catch {}
  try { performance.clearMarks("tile-start"); } catch {}
  try { performance.clearMarks("tile-end"); } catch {}
  try { performance.clearMeasures(); } catch {}
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
  const sorted = [...fpsSamples].sort((a, b) => a - b);

  const mem = (performance as unknown as Record<string, unknown>).memory as
    | { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    | undefined;

  return {
    fps: {
      count: sorted.length,
      min: sorted[0] ?? undefined,
      max: sorted[sorted.length - 1] ?? undefined,
      avg: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : undefined,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99)
    },
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
  navTiming = undefined;
  connectionInfo = undefined;
  windowInfo = undefined;
  memorySamples = [];
  clearFramePhaseMarks();
  if (memoryTimer !== undefined) {
    clearInterval(memoryTimer);
    memoryTimer = undefined;
  }
  if (fpsTimer !== undefined) {
    clearInterval(fpsTimer);
    fpsTimer = undefined;
  }
};
