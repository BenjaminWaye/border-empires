import { Color } from "three";
import { describe, expect, it, vi } from "vitest";
import { createBarbarianFrontierTintTracker } from "./client-map-3d-barbarian-frontier-tint.js";
import type { OwnershipOverlay } from "./client-map-3d-ownership-overlay.js";

const makeOverlayStub = (): OwnershipOverlay & { setColorCalls: Array<{ index: number; color: Color }> } => {
  const setColorCalls: Array<{ index: number; color: Color }> = [];
  return {
    settledMesh: {} as never,
    frontierMesh: {} as never,
    clear: vi.fn(),
    addTile: vi.fn(() => 0),
    addHillTile: vi.fn(() => 0),
    beginFrontierColorUpdates: vi.fn(),
    setFrontierTileColor: (index: number, color: Color) => setColorCalls.push({ index, color: color.clone() }),
    setFrontierHillTileColor: (index: number, color: Color) => setColorCalls.push({ index, color: color.clone() }),
    commit: vi.fn(),
    dispose: vi.fn(),
    setColorCalls
  };
};

describe("createBarbarianFrontierTintTracker", () => {
  it("starts a fade-in the first time a tile is observed, and renders an interpolated color", () => {
    const tracker = createBarbarianFrontierTintTracker();
    const overlay = makeOverlayStub();
    const ownerColor = new Color("#6a3fa0");

    tracker.reset(0);
    const transition = tracker.observeTile("0,0", ownerColor, 0);
    expect(transition).toBeDefined();
    tracker.track(3, false, transition!);
    tracker.render(0, overlay);

    expect(overlay.setColorCalls).toHaveLength(1);
    expect(overlay.setColorCalls[0]!.index).toBe(3);
    // At t=0 the color should be the neutral base, not yet the owner color.
    expect(overlay.setColorCalls[0]!.color.getHex()).not.toBe(ownerColor.getHex());
  });

  it("reaches the owner color once the fade window elapses, then stops tracking it", () => {
    const tracker = createBarbarianFrontierTintTracker();
    const overlay = makeOverlayStub();
    const ownerColor = new Color("#6a3fa0");

    tracker.reset(0);
    tracker.observeTile("0,0", ownerColor, 0);

    // Re-observe every frame as the fade plays out, same as the real
    // per-tile scan would every rebuild.
    tracker.reset(800);
    let transition = tracker.observeTile("0,0", ownerColor, 800);
    expect(transition).toBeDefined();
    tracker.track(0, false, transition!);
    tracker.render(800, overlay);
    const midColor = overlay.setColorCalls.at(-1)!.color;

    tracker.reset(1499);
    transition = tracker.observeTile("0,0", ownerColor, 1499);
    expect(transition).toBeDefined();
    tracker.track(0, false, transition!);
    tracker.render(1499, overlay);
    const lateColor = overlay.setColorCalls.at(-1)!.color;

    // Should be visibly closer to the owner color later in the window.
    const distTo = (c: Color): number => Math.hypot(c.r - ownerColor.r, c.g - ownerColor.g, c.b - ownerColor.b);
    expect(distTo(lateColor)).toBeLessThan(distTo(midColor));

    // Past the window: no longer an active transition.
    tracker.reset(1600);
    transition = tracker.observeTile("0,0", ownerColor, 1600);
    expect(transition).toBeUndefined();
  });

  it("does not leak an entry for a tile that stops being observed mid-fade", () => {
    const tracker = createBarbarianFrontierTintTracker();
    const ownerColor = new Color("#6a3fa0");

    tracker.reset(0);
    tracker.observeTile("0,0", ownerColor, 0);

    // Tile is recaptured by a player (or promoted to settled): the next
    // rebuild never calls observeTile for it again. reset() re-arms an
    // entry for one more frame if it was reconfirmed on the immediately
    // PRECEDING frame (it was, at t=0), but the frame after THAT has
    // nothing to reconfirm it, and must evict it rather than holding it
    // forever.
    tracker.reset(500);
    tracker.reset(600);
    const transition = tracker.observeTile("0,0", ownerColor, 600);
    // A fresh observeTile after eviction starts a BRAND NEW transition
    // (startAt=600), not a leaked stale one -- confirm via a distinct
    // signal: were this the original (startAt=0) entry surviving, it
    // would already be at t=600 of a 1500ms window; a fresh one restarts
    // the fade from t=0 of the window, which render() alone can't
    // distinguish, so assert directly on the returned transition's
    // startAt instead.
    expect(transition?.startAt).toBe(600);
  });
});
