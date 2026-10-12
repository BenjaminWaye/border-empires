// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceDiscoveryTip, setDiscoveryTipCenterHandler } from "./client-discovery-tip-overlay.js";
import { installDiscoveryTipCenterBinding } from "./client-discovery-tip-center.js";

afterEach(() => {
  setDiscoveryTipCenterHandler(undefined);
  document.body.innerHTML = "";
});

describe("installDiscoveryTipCenterBinding", () => {
  it("centers the camera on the tip's tile, selects it, and refreshes the view when Center is clicked", () => {
    window.localStorage.clear();
    const state = { camX: 0, camY: 0, camSubX: 5, camSubY: 5, selected: undefined as { x: number; y: number } | undefined };
    const requestViewRefresh = vi.fn();
    const renderHud = vi.fn();
    installDiscoveryTipCenterBinding({ state, wrapX: (x) => x % 100, wrapY: (y) => y % 100, requestViewRefresh, renderHud });

    announceDiscoveryTip([], "FIRST_MUSTER", "center@example.com", vi.fn(), undefined, false, { x: 107, y: 42 });
    (document.getElementById("discovery-tip-center") as HTMLButtonElement).click();

    expect(state).toMatchObject({ camX: 7, camY: 42, camSubX: 0, camSubY: 0, selected: { x: 7, y: 42 } });
    expect(requestViewRefresh).toHaveBeenCalledTimes(1);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });
});
