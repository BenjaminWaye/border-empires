// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreeRendererHost } from "./client-three-renderer-host.js";
import { isTrue3DRendererActive, setTrue3DRendererActive } from "../client-renderer-mode.js";
import { rendererFailureSnapshot, resetRendererFailure } from "../client-webgl-probe/client-webgl-probe.js";
import { resetRendererFallbackNotice } from "../client-renderer-fallback-notice/client-renderer-fallback-notice.js";

type FakeRenderer = { stop: () => void };

const noticeText = (): string => document.body.textContent ?? "";

describe("3d renderer host", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
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

  it("refuses to attempt 3d again after it crashed the browser twice", () => {
    // A killed tab runs no JS, so nothing can catch it — declining to repeat
    // the attempt is the only handling available, and it's what turns a
    // crash loop into a playable 2D game.
    window.localStorage.setItem(
      "border-empires-renderer-breadcrumb-v1",
      JSON.stringify({ atMs: 1, phase: "init-started", tileBudget: 14000, failedAttempts: 2 })
    );
    return import("./client-three-renderer-host.js").then(() => {
      // The brake reads a module-load snapshot, so exercise it through a
      // freshly imported host.
      vi.resetModules();
      return import("./client-three-renderer-host.js").then(({ createThreeRendererHost: freshHost }) => {
        const create = vi.fn(() => ({ stop: () => undefined }));
        const host = freshHost<FakeRenderer>({
          enabled: true,
          isReady: () => true,
          create,
          resizeTwoDimensionalCanvas: () => undefined
        });

        host.ensure();

        expect(create).not.toHaveBeenCalled();
        expect(host.current()).toBeUndefined();
        expect(noticeText()).toContain("crashed this browser");
      });
    });
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
