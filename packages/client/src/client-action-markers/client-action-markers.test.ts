import { afterEach, describe, expect, it } from "vitest";
import {
  ACTION_MARKER_CAP, ACTION_MARKER_MS, ACTION_MARKER_WAIT_MS,
  actionMarkerOpacity, liveActionMarkers, pendingActionMarkers, resetActionMarkers, showActionMarker
} from "./client-action-markers.js";

afterEach(() => resetActionMarkers());

describe("action markers", () => {
  it("start their clock when shown and are gone once they have faded", () => {
    showActionMarker(3, 4, "+1 tile", 0);
    const [marker] = liveActionMarkers(100, false);
    expect(marker).toMatchObject({ x: 3, y: 4, label: "+1 tile", startedAt: 100 });
    expect(liveActionMarkers(100 + ACTION_MARKER_MS - 1, false)).toHaveLength(1);
    expect(liveActionMarkers(100 + ACTION_MARKER_MS, false)).toHaveLength(0);
    expect(pendingActionMarkers()).toHaveLength(0);
  });

  // Notice gate (#3070): a deal agreed while Diplomacy is open must not fade out unseen behind it.
  it("wait while the notice gate holds, then start from when it opens", () => {
    showActionMarker(3, 4, "Trade agreed", 0);
    expect(liveActionMarkers(5_000, true)).toHaveLength(0);
    const [marker] = liveActionMarkers(9_000, false);
    expect(marker?.startedAt).toBe(9_000);
  });

  it("drop a marker the gate held back too long", () => {
    showActionMarker(3, 4, "Trade agreed", 0);
    expect(liveActionMarkers(ACTION_MARKER_WAIT_MS + 1, true)).toHaveLength(0);
    expect(liveActionMarkers(ACTION_MARKER_WAIT_MS + 2, false)).toHaveLength(0);
  });

  it("keep one marker per tile and at most the cap", () => {
    showActionMarker(3, 4, "+1 tile", 0);
    showActionMarker(3, 4, "Hydrogarden started", 1);
    expect(pendingActionMarkers().map((m) => m.label)).toEqual(["Hydrogarden started"]);
    for (let i = 0; i < ACTION_MARKER_CAP + 2; i += 1) showActionMarker(10 + i, 0, "+1 tile", 2);
    expect(pendingActionMarkers()).toHaveLength(ACTION_MARKER_CAP);
    expect(pendingActionMarkers()[0]?.x).toBe(12);
  });

  it("ignore an empty label or a bad tile", () => {
    showActionMarker(3, 4, "  ");
    showActionMarker(Number.NaN, 4, "+1 tile");
    expect(pendingActionMarkers()).toHaveLength(0);
  });

  it("fade in, hold, then fade out to nothing", () => {
    showActionMarker(3, 4, "+1 tile", 0);
    const [marker] = liveActionMarkers(0, false);
    if (!marker) throw new Error("no marker");
    expect(actionMarkerOpacity(marker, 0)).toBe(0);
    expect(actionMarkerOpacity(marker, ACTION_MARKER_MS / 2)).toBe(1);
    const late = actionMarkerOpacity(marker, ACTION_MARKER_MS * 0.9);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(0.5);
    expect(actionMarkerOpacity(marker, ACTION_MARKER_MS)).toBe(0);
  });
});
