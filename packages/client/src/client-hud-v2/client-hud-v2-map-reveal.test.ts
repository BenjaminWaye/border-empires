// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { centerCameraOnDiscoveryTarget, setDiscoveryTipCenterHandler } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { installDiscoveryTipCenterBinding } from "../client-discovery-tips/client-discovery-tip-center.js";
import { applyHudV2MapReveal, takeHudV2MapReveal } from "./client-hud-v2-map-reveal.js";

afterEach(() => {
  setDiscoveryTipCenterHandler(undefined);
  takeHudV2MapReveal();
});

const context = (overrides: Partial<Parameters<typeof applyHudV2MapReveal>[0]> = {}) => ({
  screenOpen: false,
  closeScreenKeepingView: vi.fn(),
  panelOpen: false,
  compact: false,
  closePanel: vi.fn(),
  ...overrides
});

// First-15 playtest 2026-11-28 (pt-achiever): the guide's "Show me" did nothing while Manifests was open --
// the camera moved behind the full-screen view.
describe("Show me uncovers the map", () => {
  it("closes a full-screen view that covers the map, keeping the new view", () => {
    const state = { camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined as { x: number; y: number } | undefined };
    installDiscoveryTipCenterBinding({ state, wrapX: (x) => x, wrapY: (y) => y, requestViewRefresh: vi.fn(), renderHud: vi.fn() });
    centerCameraOnDiscoveryTarget({ x: 12, y: 30 });
    const ctx = context({ screenOpen: true });
    expect(applyHudV2MapReveal(ctx)).toBe(true);
    expect(ctx.closeScreenKeepingView).toHaveBeenCalledOnce();
    // Read once: the next frame leaves screens alone.
    expect(applyHudV2MapReveal(context({ screenOpen: true }))).toBe(false);
  });

  it("closes a side panel on a phone only, where it covers the map", () => {
    const state = { camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined as { x: number; y: number } | undefined };
    installDiscoveryTipCenterBinding({ state, wrapX: (x) => x, wrapY: (y) => y, requestViewRefresh: vi.fn(), renderHud: vi.fn() });
    centerCameraOnDiscoveryTarget({ x: 1, y: 2 });
    const desktop = context({ panelOpen: true });
    applyHudV2MapReveal(desktop);
    expect(desktop.closePanel).not.toHaveBeenCalled();
    centerCameraOnDiscoveryTarget({ x: 1, y: 2 });
    const phone = context({ panelOpen: true, compact: true });
    applyHudV2MapReveal(phone);
    expect(phone.closePanel).toHaveBeenCalledOnce();
  });
});
