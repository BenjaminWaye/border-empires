// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { createInitialState } from "../client-state/client-state.js";
import { authDebugCopyPayload, authDebugHtml, authDebugSnapshot, type AuthDebugState } from "./client-hud-debug.js";

const buildAuthDebugState = (zoom: number): AuthDebugState => {
  const state = createInitialState();
  state.zoom = zoom;
  return state as unknown as AuthDebugState;
};

describe("authDebugSnapshot zoom reporting", () => {
  it("reports the current zoom and the min/max zoom range so an optimal mobile zoom can be tuned from settings", () => {
    const state = buildAuthDebugState(44);
    const snapshot = authDebugSnapshot(state, "wss://example.test/ws", undefined);

    expect(snapshot.zoomLabel).toBe("44");
    expect(snapshot.zoomRangeLabel).toBe(`${MIN_ZOOM}–${MAX_ZOOM}`);
  });

  it("rounds a fractional zoom (e.g. mid-pinch) to a whole number for display", () => {
    const state = buildAuthDebugState(63.7);
    const snapshot = authDebugSnapshot(state, "wss://example.test/ws", undefined);

    expect(snapshot.zoomLabel).toBe("64");
  });

  it("renders a live-updatable zoom readout element in the debug card", () => {
    const state = buildAuthDebugState(22);
    const html = authDebugHtml(authDebugSnapshot(state, "wss://example.test/ws", undefined));

    expect(html).toContain('<span data-zoom-readout>22</span>');
    expect(html).toContain(`range ${MIN_ZOOM}–${MAX_ZOOM}`);
  });

  it("includes the zoom line in the copyable debug payload", () => {
    const state = buildAuthDebugState(80);
    const snapshot = authDebugSnapshot(state, "wss://example.test/ws", undefined);
    const payload = decodeURIComponent(authDebugCopyPayload(state, snapshot));

    expect(payload).toContain(`Zoom 80 (range ${MIN_ZOOM}–${MAX_ZOOM})`);
  });
});
