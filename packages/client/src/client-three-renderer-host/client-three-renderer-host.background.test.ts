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

  it("gives up and retires after repeated backgrounding losses", () => {
    const { host, visibility, losers, renderers } = setup();
    host.ensure();
    for (let i = 0; i < 5; i += 1) {
      visibility.hide();
      losers[i]?.("webglcontextlost");
      visibility.show();
      vi.advanceTimersByTime(1);
    }
    expect(renderers).toHaveLength(6);
    expect(rendererFailureSnapshot()).toBeUndefined();

    visibility.hide();
    losers[5]?.("webglcontextlost");

    expect(rendererFailureSnapshot()?.reason).toBe("WebGL context lost: webglcontextlost");
  });
});
