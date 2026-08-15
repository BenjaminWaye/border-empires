import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These guards used to live in client-domain-html/client-domain-panel-regression.test.ts
// (piggybacking on that file's source-grepping helper) but are about the
// Settings panel, not domains. Relocated here as part of the settings
// hub/sub-pages redesign — file targets updated to match, behavior unchanged.
const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("settings panel regression guard", () => {
  it("shows the client build version in the diagnostics page", () => {
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");
    const styleSource = sourceFor("../style.css");

    expect(settingsPanelSource).toContain("Client build ${CLIENT_BUILD_VERSION}");
    expect(styleSource).toContain(".client-build-version");
  });

  it("keeps auth investigation details and copy support reachable from the diagnostics page", () => {
    const hudSource = sourceFor("./client-hud.ts");
    const hudDebugSource = sourceFor("./client-hud-debug.ts");

    expect(hudDebugSource).toContain("export const authDebugHtml = (details: AuthDebugSnapshot): string => {");
    expect(hudDebugSource).toContain("Render FPS");
    expect(hudDebugSource).toContain("data-fps-readout");
    expect(hudDebugSource).toContain("data-zoom-readout");
    expect(hudDebugSource).toContain("data-copy-auth-debug");
    expect(hudDebugSource).toContain("Copy Auth Debug");
    expect(hudDebugSource).toContain("details.authUid");
    expect(hudDebugSource).toContain("details.playerId");
    expect(hudDebugSource).toContain("export const authDebugCopyPayload = (");
    expect(hudSource).toContain("const authDebugCopyButtons = dom.hud.querySelectorAll(\"[data-copy-auth-debug]\")");
  });

  it("binds every rendered logout button instead of only the first duplicated settings card control", () => {
    const hudSource = sourceFor("./client-hud.ts");

    expect(hudSource).toContain("data-auth-logout");
    expect(hudSource).toContain("const authLogoutButtons = dom.hud.querySelectorAll(\"[data-auth-logout]\")");
    expect(hudSource).toContain("authLogoutButtons.forEach((authLogoutBtn: HTMLButtonElement) => {");
    expect(hudSource).not.toContain("document.querySelector(\"#auth-logout\")");
    expect(hudSource).not.toContain("id=\"auth-logout\"");
  });

  it("keeps the map reveal button reachable from the gameplay page", () => {
    const hudSource = sourceFor("./client-hud.ts");
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");

    expect(settingsPanelSource).toContain("mapRevealCardHtml(state)");
    expect(settingsPanelSource).toContain("data-map-reveal");
    expect(settingsPanelSource).toContain("Reveal Full Map");
    expect(settingsPanelSource).toContain("Restore Fog");
    expect(hudSource).toContain("const mapRevealButtons = dom.hud.querySelectorAll(\"[data-map-reveal]\")");
    expect(hudSource).toContain('type: "REQUEST_REVEAL_MAP"');
    expect(hudSource).toContain('type: "SET_FOG_DISABLED"');
  });
});
