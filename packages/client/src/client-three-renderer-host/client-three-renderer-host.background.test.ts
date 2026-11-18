// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreeRendererHost, type PageVisibilitySource } from "./client-three-renderer-host.js";
import { isTrue3DRendererActive, setTrue3DRendererActive } from "../client-renderer-mode.js";
import { rendererFailureSnapshot, resetRendererFailure } from "../client-webgl-probe/client-webgl-probe.js";
import { resetRendererFallbackNotice } from "../client-renderer-fallback-notice/client-renderer-fallback-notice.js";

// Regression: switching away from the tab on a phone made the browser reclaim
// the WebGL context, and the host retired 3D for the whole session with a
// "3D map unavailable — showing the 2D map" notice. A backgrounding loss must
// rebuild 3D when the tab comes back instead.

type FakeRenderer = { stop: () => void };

const fakeVisibility = () => {
  let hidden = false;
  const listeners: Array<() => void> = [];
  const source: PageVisibilitySource = { isHidden: () => hidden, onChange: (listener) => listeners.push(listener) };
  const set = (next: boolean): void => {
    hidden = next;
    for (const listener of listeners) listener();
  };
  return { source, hide: () => set(true), show: () => set(false) };
};

describe("3d renderer host — context lost while backgrounded", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetRendererFailure();
    resetRendererFallbackNotice();
    setTrue3DRendererActive(false);
    window.localStorage.clear();
  });

  const setup = (clock = { t: 0 }) => {
    const visibility = fakeVisibility();
    const losers: Array<(reason: string) => void> = [];
    const renderers: Array<FakeRenderer & { stop: ReturnType<typeof vi.fn> }> = [];
    const host = createThreeRendererHost<FakeRenderer>({
      enabled: true,
      isReady: () => true,
      resizeTwoDimensionalCanvas: () => undefined,
      visibility: visibility.source,
      now: () => clock.t,
      create: (onContextLost) => {
        losers.push(onContextLost);
        const created = { stop: vi.fn() };
        renderers.push(created);
        return created;
      }
    });
    return { host, visibility, losers, renderers, clock };
  };

  it("rebuilds 3d when the tab returns after losing the context in the background", () => {
    const { host, visibility, losers, renderers } = setup();
    host.ensure();
    visibility.hide();

    losers[0]?.("webglcontextlost");

    expect(renderers[0]?.stop).toHaveBeenCalledTimes(1);
    expect(host.current()).toBeUndefined();
    expect(isTrue3DRendererActive()).toBe(false);
    expect(rendererFailureSnapshot()).toBeUndefined();
    expect(document.body.textContent ?? "").not.toContain("3D map unavailable");

    host.ensure(); // a HUD render while still hidden must not rebuild
    expect(renderers).toHaveLength(1);

    visibility.show();
    vi.advanceTimersByTime(1);

    expect(renderers).toHaveLength(2);
    expect(host.current()).toBe(renderers[1]);
    expect(isTrue3DRendererActive()).toBe(true);
  });

  it("treats a loss that lands just after the tab is shown again as a backgrounding loss", () => {
    const { host, visibility, losers, renderers, clock } = setup();
    host.ensure();
    visibility.hide();
    clock.t = 10_000;
    visibility.show();
    clock.t = 11_000;

    losers[0]?.("webglcontextlost");
    vi.advanceTimersByTime(1);

    expect(rendererFailureSnapshot()).toBeUndefined();
    expect(renderers).toHaveLength(2);
    expect(isTrue3DRendererActive()).toBe(true);
  });

  it("still retires to 2d when the context is lost while the tab is in use", () => {
    const { host, losers } = setup();
    host.ensure();

    losers[0]?.("memory pressure");
    vi.advanceTimersByTime(1);

    expect(host.current()).toBeUndefined();
    expect(rendererFailureSnapshot()?.reason).toBe("WebGL context lost: memory pressure");
  });

  it("keeps rebuilding across many app switches in one session", () => {
    const { host, visibility, losers, renderers } = setup();
    host.ensure();
    for (let i = 0; i < 8; i += 1) {
      visibility.hide();
      losers[i]?.("webglcontextlost");
      visibility.show();
      vi.advanceTimersByTime(1);
    }
    expect(renderers).toHaveLength(9);
    expect(rendererFailureSnapshot()).toBeUndefined();
    expect(isTrue3DRendererActive()).toBe(true);
  });

  it("retires instead of rebuilding again when a rebuilt renderer loses its context while visible", () => {
    const { host, visibility, losers, renderers, clock } = setup();
    host.ensure();
    visibility.hide();
    losers[0]?.("webglcontextlost");
    clock.t = 1_000;
    visibility.show();
    vi.advanceTimersByTime(1);
    expect(renderers).toHaveLength(2);

    clock.t = 2_000; // inside the grace window, but this renderer was built after the tab was shown
    losers[1]?.("memory pressure");
    vi.advanceTimersByTime(1);

    expect(renderers).toHaveLength(2);
    expect(rendererFailureSnapshot()?.reason).toBe("WebGL context lost: memory pressure");
  });
});

describe("3d renderer host — background loss during an async build", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

  type Build = {
    readonly lose: (reason: string) => void;
    readonly rebuild: boolean;
    readonly renderer: { stop: ReturnType<typeof vi.fn> };
    readonly resolve: () => void;
    readonly reject: (error: Error) => void;
  };

  const asyncSetup = () => {
    const visibility = fakeVisibility();
    const builds: Build[] = [];
    const host = createThreeRendererHost<FakeRenderer>({
      enabled: true,
      isReady: () => true,
      resizeTwoDimensionalCanvas: () => undefined,
      visibility: visibility.source,
      create: (onContextLost, { rebuild }) =>
        new Promise<FakeRenderer>((resolve, reject) => {
          const renderer = { stop: vi.fn() };
          builds.push({ lose: onContextLost, rebuild, renderer, resolve: () => resolve(renderer), reject });
        })
    });
    return { host, visibility, builds };
  };

  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  };

  it("never adopts a build whose context was reclaimed mid-build; builds afresh instead", async () => {
    const { host, visibility, builds } = asyncSetup();
    host.ensure();
    visibility.hide();
    builds[0]?.lose("webglcontextlost");
    visibility.show();
    await flush();
    expect(builds).toHaveLength(1); // still in flight: no second concurrent build

    builds[0]?.resolve();
    await flush();

    expect(builds[0]?.renderer.stop).toHaveBeenCalledTimes(1);
    expect(host.current()).toBeUndefined();
    expect(builds).toHaveLength(2);

    builds[1]?.resolve();
    await flush();
    expect(host.current()).toBe(builds[1]?.renderer);
    expect(isTrue3DRendererActive()).toBe(true);
  });

  it("does not retire 3d when a build reclaimed mid-build then rejects", async () => {
    const { host, visibility, builds } = asyncSetup();
    host.ensure();
    visibility.hide();
    builds[0]?.lose("webglcontextlost");
    visibility.show();
    builds[0]?.reject(new Error("shader compile failed on a lost context"));
    await flush();

    expect(rendererFailureSnapshot()).toBeUndefined();
    expect(document.body.textContent ?? "").not.toContain("3D map unavailable");
    expect(builds).toHaveLength(2);
  });

  it("marks builds after a backgrounding loss as rebuilds, so the map-prep overlay is skipped", async () => {
    const { host, visibility, builds } = asyncSetup();
    host.ensure();
    builds[0]?.resolve();
    await flush();
    visibility.hide();
    builds[0]?.lose("webglcontextlost");
    visibility.show();
    await flush();

    expect(builds.map((build) => build.rebuild)).toEqual([false, true]);
  });

  it("retires after repeated background losses with no renderer coming up in between", async () => {
    const { host, visibility, builds } = asyncSetup();
    host.ensure();
    for (let i = 0; i < 3; i += 1) {
      visibility.hide();
      builds[i]?.lose("webglcontextlost");
      visibility.show();
      builds[i]?.resolve();
      await flush();
    }
    expect(rendererFailureSnapshot()).toBeUndefined();
    expect(builds).toHaveLength(4);

    visibility.hide();
    builds[3]?.lose("webglcontextlost");

    expect(rendererFailureSnapshot()?.reason).toBe("WebGL context lost: webglcontextlost (repeated while backgrounded)");
  });
});
