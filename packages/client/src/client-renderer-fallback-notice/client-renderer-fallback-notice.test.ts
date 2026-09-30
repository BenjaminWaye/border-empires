// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetRendererFallbackNotice,
  showRendererFallbackNotice,
  showTwoDimensionalModeNotice
} from "./client-renderer-fallback-notice.js";

const noticeText = (): string => document.body.textContent ?? "";

describe("2D mode notice", () => {
  beforeEach(() => {
    resetRendererFallbackNotice();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
  });

  it("tells the player they are on 2D and where to switch back", () => {
    showTwoDimensionalModeNotice({ onSwitchTo3D: () => undefined });
    expect(noticeText()).toContain("You're playing on the 2D map");
    expect(noticeText()).toContain("Settings → Gameplay → Map Renderer");
  });

  it("its button switches to 3D", () => {
    const onSwitchTo3D = vi.fn();
    showTwoDimensionalModeNotice({ onSwitchTo3D });
    document.getElementById("be-renderer-fallback-notice-retry")?.click();
    expect(onSwitchTo3D).toHaveBeenCalledTimes(1);
  });

  it("shows once per tab session, even across page loads", () => {
    showTwoDimensionalModeNotice({ onSwitchTo3D: () => undefined });
    document.getElementById("be-renderer-fallback-notice-close")?.click();
    resetRendererFallbackNotice(); // a fresh page load resets the in-memory latch
    showTwoDimensionalModeNotice({ onSwitchTo3D: () => undefined });
    expect(document.getElementById("be-renderer-fallback-notice")).toBeNull();
  });

  it("is safe to call on every HUD render: later calls don't touch session storage", () => {
    showTwoDimensionalModeNotice({ onSwitchTo3D: () => undefined });
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    for (let i = 0; i < 50; i += 1) showTwoDimensionalModeNotice({ onSwitchTo3D: () => undefined });
    expect(getItem).not.toHaveBeenCalled();
    expect(document.querySelectorAll("#be-renderer-fallback-notice")).toHaveLength(1);
    getItem.mockRestore();
  });

  it("does not stack on top of a fallback banner", () => {
    showRendererFallbackNotice("webgl2 unavailable");
    showTwoDimensionalModeNotice({ onSwitchTo3D: () => undefined });
    expect(noticeText()).toContain("3D map unavailable");
    expect(noticeText()).not.toContain("You're playing on the 2D map");
  });
});

describe("fallback banner", () => {
  beforeEach(() => {
    resetRendererFallbackNotice();
    document.body.innerHTML = "";
  });

  it("points at the settings field even when it has no retry button", () => {
    showRendererFallbackNotice("webgl2 unavailable");
    expect(noticeText()).toContain("Settings → Gameplay → Map Renderer");
    expect(document.getElementById("be-renderer-fallback-notice-retry")).toBeNull();
  });
});
