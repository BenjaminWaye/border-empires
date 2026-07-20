import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybeRefreshForCamera, maybeSaveCameraLocation, resetCameraSaveThrottleForTests, saveCameraLocation } from "./client-view-refresh.js";
import { CAMERA_LOCATION_STORAGE_KEY } from "./client-constants.js";
import type { RealtimeSocket } from "./client-socket-types.js";

const EMPTY_ACTION_QUEUE: Array<{ x: number; y: number; retries?: number; fromWaypoint?: boolean }> = [];

const fakeSocket = (readyState: number): RealtimeSocket => ({
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  readyState,
  send: () => {},
  close: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
});

// No `requestIdleCallback` in this test environment (matches real Safari and
// other browsers without it too), so maybeSaveCameraLocation() falls back to
// `setTimeout(task, 0)`. Flushing one macrotask is enough to observe the
// deferred write.
const flushDeferredSave = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Regression coverage for two real bug reports:
// 1. The last-viewed camera location appeared "stuck" and never updated
//    during ordinary play. Root cause: the save was piggybacked on
//    requestViewRefresh(), which only runs once the camera crosses a full
//    CHUNK_SIZE (64-tile) chunk boundary — an ordinary pan or a zoom-only
//    change routinely never does that. Fixed by decoupling the save into
//    its own time-throttled path (maybeSaveCameraLocation) that runs on
//    every maybeRefreshForCamera() call (every render frame and every
//    pan/zoom input event), independent of chunk-subscribe/auth/socket state.
// 2. After that fix, panning felt laggy/jumpy — maybeSaveCameraLocation()
//    was calling localStorage.setItem() synchronously inside the render
//    loop's requestAnimationFrame callback, extending that frame's render
//    time once per throttle window. Fixed by deferring the actual write via
//    requestIdleCallback (setTimeout fallback) so it never blocks a frame.
describe("camera location save", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    // The save throttle timer is module-local (not part of ClientState), so
    // it must be reset between tests to avoid one test's save suppressing
    // the next test's assertion.
    resetCameraSaveThrottleForTests();
  });

  const readSaved = (): { x: number; y: number; zoom: number } | undefined => {
    const raw = storage.get(CAMERA_LOCATION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { x: number; y: number; zoom: number }) : undefined;
  };

  it("does not write to localStorage synchronously (would block the render frame)", () => {
    const state = { camX: 5, camY: 5, zoom: 22 };
    maybeSaveCameraLocation(state);

    // The write is deferred off-frame — nothing landed in storage yet.
    expect(readSaved()).toBeUndefined();
  });

  it("saves via maybeRefreshForCamera even when the camera has NOT crossed a chunk boundary", async () => {
    const state = {
      authSessionReady: true,
      camX: 5,
      camY: 5,
      zoom: 22,
      lastSubCx: 0,
      lastSubCy: 0,
      actionInFlight: false,
      capture: undefined,
      actionQueue: EMPTY_ACTION_QUEUE
    };
    const ws = fakeSocket(1);
    const requestViewRefresh = vi.fn();

    // camX/camY moved a small amount well within the same 64-tile chunk as
    // lastSubCx/lastSubCy (both still 0) — before the fix, nothing saved here.
    maybeRefreshForCamera(state, { ws, requestViewRefresh });
    await flushDeferredSave();

    expect(readSaved()).toEqual({ x: 5, y: 5, zoom: 22 });
    // The chunk-subscribe path must NOT have fired — this proves the save is
    // decoupled from it, not just coincidentally triggered by it.
    expect(requestViewRefresh).not.toHaveBeenCalled();
  });

  it("saves on a zoom-only change (no pan at all)", async () => {
    const state = {
      authSessionReady: true,
      camX: 0,
      camY: 0,
      zoom: 22,
      lastSubCx: 0,
      lastSubCy: 0,
      actionInFlight: false,
      capture: undefined,
      actionQueue: EMPTY_ACTION_QUEUE
    };
    const ws = fakeSocket(1);

    maybeRefreshForCamera(state, { ws, requestViewRefresh: vi.fn() });
    await flushDeferredSave();
    expect(readSaved()?.zoom).toBe(22);

    state.zoom = 40;
    // Bypass the 1s throttle for this assertion the same way a real second
    // save a moment later would, once the throttle window has passed.
    resetCameraSaveThrottleForTests();
    maybeRefreshForCamera(state, { ws, requestViewRefresh: vi.fn() });
    await flushDeferredSave();
    expect(readSaved()?.zoom).toBe(40);
  });

  it("does not require the socket to be open or auth to be ready (pure local write)", async () => {
    const state = {
      authSessionReady: false,
      camX: 12,
      camY: 34,
      zoom: 22,
      lastSubCx: Number.NaN,
      lastSubCy: Number.NaN,
      actionInFlight: false,
      capture: undefined,
      actionQueue: EMPTY_ACTION_QUEUE
    };
    const ws = fakeSocket(3); // CLOSED

    maybeRefreshForCamera(state, { ws, requestViewRefresh: vi.fn() });
    await flushDeferredSave();

    expect(readSaved()).toEqual({ x: 12, y: 34, zoom: 22 });
  });

  it("throttles rapid repeated saves to once per second", async () => {
    const state = { camX: 1, camY: 1, zoom: 22 };
    maybeSaveCameraLocation(state);
    await flushDeferredSave();
    expect(readSaved()).toEqual({ x: 1, y: 1, zoom: 22 });

    // Immediately move again — within the throttle window, should NOT overwrite.
    state.camX = 999;
    maybeSaveCameraLocation(state);
    await flushDeferredSave();
    expect(readSaved()).toEqual({ x: 1, y: 1, zoom: 22 });
  });

  it("snapshots the camera at throttle-check time, not whatever it is when the deferred write runs", async () => {
    const state = { camX: 1, camY: 1, zoom: 22 };
    maybeSaveCameraLocation(state);
    // Camera keeps moving before the deferred write actually flushes.
    state.camX = 500;
    await flushDeferredSave();

    expect(readSaved()).toEqual({ x: 1, y: 1, zoom: 22 });
  });

  it("saveCameraLocation itself still writes unconditionally and synchronously (used directly where needed)", () => {
    saveCameraLocation({ camX: 7, camY: 8, zoom: 15 });
    expect(readSaved()).toEqual({ x: 7, y: 8, zoom: 15 });
  });
});
