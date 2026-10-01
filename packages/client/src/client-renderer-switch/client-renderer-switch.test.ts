// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rendererKindFor, rendererSwitchUrl, switchRenderer } from "./client-renderer-switch.js";
import { bindRendererSettingsControls, rendererSettingsFieldHtml } from "./client-renderer-settings-ui.js";
import { settingsGameplayPageHtml } from "../client-hud/client-hud-settings-panel.js";

const BREADCRUMB_KEY = "border-empires-renderer-breadcrumb-v1";

describe("renderer kind", () => {
  it("is 3d whenever the true-3D renderer is running", () => {
    expect(rendererKindFor({ prefers2D: false, true3DActive: true, failed: false })).toBe("3d");
  });
  it("is 2d-chosen when the session asked for ?renderer=2d", () => {
    expect(rendererKindFor({ prefers2D: true, true3DActive: false, failed: false })).toBe("2d-chosen");
  });
  it("is 2d-fallback only once 3D has actually failed", () => {
    expect(rendererKindFor({ prefers2D: false, true3DActive: false, failed: true })).toBe("2d-fallback");
  });
  it("still reads as 3d while 3D is starting and nothing has failed", () => {
    expect(rendererKindFor({ prefers2D: false, true3DActive: false, failed: false })).toBe("3d");
  });
});

describe("rendererSwitchUrl", () => {
  it("sets the renderer param and keeps the rest of the URL", () => {
    expect(rendererSwitchUrl("https://game.test/play?season=4#map", "2d")).toBe("https://game.test/play?season=4&renderer=2d#map");
  });
  it("overwrites an existing renderer param instead of duplicating it", () => {
    expect(rendererSwitchUrl("https://game.test/?renderer=2d", "3d")).toBe("https://game.test/?renderer=3d");
  });
});

describe("renderer settings field", () => {
  it("offers 2D while 3D is running", () => {
    const html = rendererSettingsFieldHtml("3d");
    expect(html).toContain("Currently: 3D map.");
    expect(html).toContain('data-renderer-switch="2d"');
  });
  it("offers 3D after a chosen 2D session", () => {
    const html = rendererSettingsFieldHtml("2d-chosen");
    expect(html).toContain("Currently: 2D map.");
    expect(html).toContain('data-renderer-switch="3d"');
  });
  it("explains a failed-3D fallback and offers a retry", () => {
    const html = rendererSettingsFieldHtml("2d-fallback");
    expect(html).toContain("couldn't start");
    expect(html).toContain('data-renderer-switch="3d"');
    expect(html).toContain("Try 3D map again");
  });
  it("is part of the Gameplay settings page", () => {
    const html = settingsGameplayPageHtml({
      mapRevealEligible: false,
      authSessionReady: false,
      mapRevealEnabled: false,
      fogDisabled: false,
      authEmail: "",
      photoModeActive: false
    });
    expect(html).toContain("Map Renderer");
    expect(html).toContain("data-renderer-switch");
  });
});

describe("switching", () => {
  const replace = vi.fn();
  let originalLocation: Location;

  beforeEach(() => {
    replace.mockReset();
    window.localStorage.clear();
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "https://game.test/?renderer=2d", replace }
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    document.body.innerHTML = "";
  });

  it("reloads into 3D and clears the crash brake so the reload can't re-trip it", () => {
    window.localStorage.setItem(BREADCRUMB_KEY, JSON.stringify({ failedAttempts: 3 }));
    switchRenderer("3d");
    expect(replace).toHaveBeenCalledWith("https://game.test/?renderer=3d");
    expect(window.localStorage.getItem(BREADCRUMB_KEY)).toBeNull();
  });

  it("reloads into 2D without touching the crash streak", () => {
    window.localStorage.setItem(BREADCRUMB_KEY, JSON.stringify({ failedAttempts: 1 }));
    switchRenderer("2d");
    expect(replace).toHaveBeenCalledWith("https://game.test/?renderer=2d");
    expect(window.localStorage.getItem(BREADCRUMB_KEY)).not.toBeNull();
  });

  it("the settings button switches to the renderer it advertises", () => {
    document.body.innerHTML = rendererSettingsFieldHtml("2d-chosen");
    bindRendererSettingsControls(document.body);
    (document.querySelector("[data-renderer-switch]") as HTMLButtonElement).click();
    expect(replace).toHaveBeenCalledWith("https://game.test/?renderer=3d");
  });
});
