// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreeRendererHost } from "./client-three-renderer-host.js";
import { isTrue3DRendererActive, setTrue3DRendererActive } from "../client-renderer-mode.js";
import { resetRendererFailure, rendererFailureSnapshot } from "../client-webgl-probe/client-webgl-probe.js";
import { resetRendererFallbackNotice } from "../client-renderer-fallback-notice/client-renderer-fallback-notice.js";

// The 3D renderer is now built in announced stages (an async factory) so the
// login overlay can show progress; the host must adopt it when the build
// resolves, never start a second build meanwhile, and always report settling
// so the overlay's map-prep view can close.

type FakeRenderer = { stop: () => void };

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("3d renderer host with an async build", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setTrue3DRendererActive(false);
    window.localStorage.clear();
  });

  it("adopts the renderer when the build resolves and starts only one build", async () => {
    const build = deferred<FakeRenderer>();
    const create = vi.fn(() => build.promise);
    const onSettled = vi.fn();
    const host = createThreeRendererHost<FakeRenderer>({ enabled: true, isReady: () => true, create, onSettled, resizeTwoDimensionalCanvas: () => undefined });

    host.ensure();
    host.ensure(); // e.g. another HUD render while the build is running
    expect(create).toHaveBeenCalledTimes(1);
    expect(host.current()).toBeUndefined();

    const renderer: FakeRenderer = { stop: vi.fn() };
    build.resolve(renderer);
    await build.promise;
    await Promise.resolve();
    expect(host.current()).toBe(renderer);
    expect(isTrue3DRendererActive()).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("retires 3D and still settles when the build rejects", async () => {
    const build = deferred<FakeRenderer>();
    const onSettled = vi.fn();
    const host = createThreeRendererHost<FakeRenderer>({
      enabled: true,
      isReady: () => true,
      create: () => build.promise,
      onSettled,
      resizeTwoDimensionalCanvas: () => undefined
    });
    host.ensure();
    build.reject(new Error("webgl2 unavailable"));
    await build.promise.catch(() => undefined);
    await Promise.resolve();
    expect(host.current()).toBeUndefined();
    expect(rendererFailureSnapshot()?.reason).toContain("webgl2 unavailable");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("stops a renderer whose context was lost mid-build, and settles", async () => {
    const build = deferred<FakeRenderer>();
    let loseContext: ((reason: string) => void) | undefined;
    const onSettled = vi.fn();
    const host = createThreeRendererHost<FakeRenderer>({
      enabled: true,
      isReady: () => true,
      create: (onContextLost) => {
        loseContext = onContextLost;
        return build.promise;
      },
      onSettled,
      resizeTwoDimensionalCanvas: () => undefined
    });
    host.ensure();
    loseContext?.("gpu reset");
    const renderer: FakeRenderer = { stop: vi.fn() };
    build.resolve(renderer);
    await build.promise;
    await Promise.resolve();
    expect(renderer.stop).toHaveBeenCalled();
    expect(host.current()).toBeUndefined();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
