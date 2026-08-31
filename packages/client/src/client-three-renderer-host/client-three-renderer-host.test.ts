// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreeRendererHost } from "./client-three-renderer-host.js";
import { isTrue3DRendererActive, setTrue3DRendererActive } from "../client-renderer-mode.js";
import { rendererFailureSnapshot, resetRendererFailure } from "../client-webgl-probe/client-webgl-probe.js";
import { resetRendererFallbackNotice } from "../client-renderer-fallback-notice/client-renderer-fallback-notice.js";

type FakeRenderer = { stop: () => void };

const BREADCRUMB_KEY = "border-empires-renderer-breadcrumb-v1";

const noticeText = (): string => document.body.textContent ?? "";

describe("3d renderer host", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
    window.localStorage.clear();
  });

  const hostWith = (overrides: Partial<Parameters<typeof createThreeRendererHost<FakeRenderer>>[0]>) =>
    createThreeRendererHost<FakeRenderer>({
      enabled: true,
      isReady: () => true,
      create: () => ({ stop: () => undefined }),
      resizeTwoDimensionalCanvas: () => undefined,
      ...overrides
    });

  it("constructs the renderer and marks true-3d active on a healthy device", () => {
    const renderer: FakeRenderer = { stop: vi.fn() };
    const host = hostWith({ create: () => renderer });

    host.ensure();

    expect(host.current()).toBe(renderer);
    expect(isTrue3DRendererActive()).toBe(true);
  });

  it("does not require gpuStats — a renderer that omits it still constructs fine", () => {
    const host = hostWith({ create: () => ({ stop: () => undefined }) });

    expect(() => host.ensure()).not.toThrow();
    expect(isTrue3DRendererActive()).toBe(true);
  });

  it("does not read gpuStats synchronously — three.js's counts aren't populated until the first render", () => {
    // Regression: renderer.info.memory/programs only increment inside an
    // actual renderer.render() call, which client-map-3d.ts schedules via
    // requestAnimationFrame at the end of construction. Reading gpuStats
    // synchronously here would only ever record zeros.
    const gpuStats = vi.fn(() => ({ geometries: 12, textures: 8, programs: 3 }));
    const host = hostWith({ create: () => ({ stop: () => undefined, gpuStats }) });

    host.ensure();

    expect(gpuStats).not.toHaveBeenCalled();
  });

  it("records renderer.info counts onto the breadcrumb one frame after construction", async () => {
    const gpuStats = vi.fn(() => ({ geometries: 12, textures: 8, programs: 3 }));
    const host = hostWith({ create: () => ({ stop: () => undefined, gpuStats }) });

    host.ensure();
    // Flush the requestAnimationFrame the capture is deferred through.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(gpuStats).toHaveBeenCalledTimes(1);
    // previousRendererAttempt() is frozen at module import, so it can't see
    // this session's own write — read storage directly instead.
    const raw = window.localStorage.getItem(BREADCRUMB_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ gpuGeometries: 12, gpuTextures: 8, gpuPrograms: 3 });
  });

  it("waits for readiness before constructing", () => {
    const create = vi.fn(() => ({ stop: () => undefined }));
    let ready = false;
    const host = hostWith({ create, isReady: () => ready });

    host.ensure();
    expect(create).not.toHaveBeenCalled();

    ready = true;
    host.ensure();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never constructs when 3d is disabled, and reports 2d as active", () => {
    const create = vi.fn(() => ({ stop: () => undefined }));
    setTrue3DRendererActive(true);

    const host = hostWith({ enabled: false, create });
    host.ensure();

    expect(create).not.toHaveBeenCalled();
    expect(isTrue3DRendererActive()).toBe(false);
  });

  it("falls back to 2d when init throws, keeping the reason for diagnostics", () => {
    const resize = vi.fn();
    const host = hostWith({
      create: () => {
        throw new Error("3d renderer unavailable: webgl2 unavailable (webgl)");
      },
      resizeTwoDimensionalCanvas: resize
    });

    host.ensure();

    expect(host.current()).toBeUndefined();
    expect(isTrue3DRendererActive()).toBe(false);
    expect(rendererFailureSnapshot()?.reason).toContain("webgl2 unavailable");
    expect(resize).toHaveBeenCalledTimes(1);
    expect(noticeText()).toContain("webgl2 unavailable");
  });

  it("does not retry a doomed init on every frame", () => {
    const create = vi.fn(() => {
      throw new Error("nope");
    });
    const host = hostWith({ create });

    host.ensure();
    host.ensure();
    host.ensure();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retires the renderer and falls back to 2d when the gpu drops the context", () => {
    const stop = vi.fn();
    let lose: ((reason: string) => void) | undefined;
    const host = hostWith({
      create: (onContextLost) => {
        lose = onContextLost;
        return { stop };
      }
    });

    host.ensure();
    expect(isTrue3DRendererActive()).toBe(true);

    lose?.("memory pressure");

    expect(host.current()).toBeUndefined();
    expect(isTrue3DRendererActive()).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(rendererFailureSnapshot()?.reason).toContain("memory pressure");
    expect(noticeText()).toContain("2D map");
  });

  it("still falls back to 2d when the failed renderer's own teardown throws", () => {
    let lose: ((reason: string) => void) | undefined;
    const resize = vi.fn();
    const host = hostWith({
      create: (onContextLost) => {
        lose = onContextLost;
        return {
          stop: () => {
            throw new Error("dispose blew up");
          }
        };
      },
      resizeTwoDimensionalCanvas: resize
    });

    host.ensure();
    lose?.("context lost");

    expect(host.current()).toBeUndefined();
    expect(isTrue3DRendererActive()).toBe(false);
    expect(resize).toHaveBeenCalledTimes(1);
  });

  // The brake reads a snapshot taken when the breadcrumb module loads, so it
  // can only be exercised through a freshly imported host.
  const brakedHost = async (create: () => FakeRenderer) => {
    window.localStorage.setItem(
      BREADCRUMB_KEY,
      JSON.stringify({ atMs: 1, phase: "init-started", tileBudget: 14000, failedAttempts: 3 })
    );
    vi.resetModules();
    const { createThreeRendererHost: freshHost } = await import("./client-three-renderer-host.js");
    return freshHost<FakeRenderer>({
      enabled: true,
      isReady: () => true,
      create,
      resizeTwoDimensionalCanvas: () => undefined
    });
  };

  it("refuses to attempt 3d again after it crashed the browser at the bottom rung", async () => {
    // A killed tab runs no JS, so nothing can catch it — declining to repeat
    // the attempt is the only handling available, and it's what turns a
    // crash loop into a playable 2D game.
    const create = vi.fn(() => ({ stop: () => undefined }));

    const host = await brakedHost(create);
    host.ensure();

    expect(create).not.toHaveBeenCalled();
    expect(host.current()).toBeUndefined();
    expect(noticeText()).toContain("crashed this browser");
  });

  it("clears the crash streak and reloads with ?renderer=3d when 'Try 3D again' is clicked", async () => {
    // Regression: a reload mid-construction (a player just refreshing while
    // the game loaded) leaves the same on-disk shape as a real hard crash, so
    // the brake trips permanently with no in-app way back into 3D. The button
    // is the escape hatch.
    const host = await brakedHost(() => ({ stop: () => undefined }));
    host.ensure();

    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "https://example.test/play", assign }
    });

    try {
      const retryBtn = document.getElementById("be-renderer-fallback-notice-retry");
      expect(retryBtn).not.toBeNull();
      retryBtn?.dispatchEvent(new Event("click", { bubbles: true }));

      expect(window.localStorage.getItem(BREADCRUMB_KEY)).toBeNull();
      expect(assign).toHaveBeenCalledTimes(1);
      const [target] = assign.mock.calls[0] as [string];
      expect(new URL(target).searchParams.get("renderer")).toBe("3d");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }
  });

  it("keeps the crash streak when the brake fires, so it holds on every later load", async () => {
    // Regression: the brake used to route through the same "handled failure"
    // bookkeeping as a caught error, which zeroed the streak — so 3D re-armed
    // on the next load and the crash loop resumed, with the brake holding only
    // every other time.
    const host = await brakedHost(() => ({ stop: () => undefined }));

    host.ensure();

    const breadcrumb = JSON.parse(window.localStorage.getItem(BREADCRUMB_KEY) ?? "{}");
    expect(breadcrumb.failedAttempts).toBeGreaterThanOrEqual(3);
    expect(breadcrumb.phase).not.toBe("survived");
  });

  it("keeps writing a heartbeat while 3d stays alive, so a later crash leaves a recent timestamp", () => {
    vi.useFakeTimers();
    try {
      const host = hostWith({ create: () => ({ stop: () => undefined }) });

      host.ensure();
      vi.advanceTimersByTime(15000 * 3);

      const breadcrumb = JSON.parse(window.localStorage.getItem(BREADCRUMB_KEY) ?? "{}");
      expect(breadcrumb.heartbeatCount).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the heartbeat once the renderer retires", () => {
    vi.useFakeTimers();
    try {
      let lose: ((reason: string) => void) | undefined;
      const host = hostWith({
        create: (onContextLost) => {
          lose = onContextLost;
          return { stop: () => undefined };
        }
      });

      host.ensure();
      vi.advanceTimersByTime(15000);
      lose?.("context lost");
      const afterRetire = JSON.parse(window.localStorage.getItem(BREADCRUMB_KEY) ?? "{}").heartbeatCount;

      vi.advanceTimersByTime(15000 * 5);

      expect(JSON.parse(window.localStorage.getItem(BREADCRUMB_KEY) ?? "{}").heartbeatCount).toBe(afterRetire);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not resurrect 3d when the context is lost during construction", () => {
    // The over-subscribed-GPU case: the context goes away before `create`
    // has even returned, so the host has no renderer handle when it retires.
    const stop = vi.fn();
    const create = vi.fn((onContextLost: (reason: string) => void) => {
      onContextLost("gone");
      return { stop };
    });
    const host = hostWith({ create });

    host.ensure();
    host.ensure();

    expect(create).toHaveBeenCalledTimes(1);
    expect(host.current()).toBeUndefined();
    expect(isTrue3DRendererActive()).toBe(false);
    // The half-built renderer still has to be torn down, or its WebGL context
    // stays alive and keeps occupying one of Safari's few context slots.
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
