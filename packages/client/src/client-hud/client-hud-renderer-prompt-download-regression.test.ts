import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("renderer prompt overlay Download Diagnostics button", () => {
  const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

  it("renders a Download Diagnostics button inside the renderer prompt overlay", () => {
    expect(hudSource).toContain('id="renderer-prompt-download"');
    expect(hudSource).toContain("renderer-prompt-download-btn");
  });

  it("wires the download button to build and download a diagnostics bundle", () => {
    const overlayBlockStart = hudSource.indexOf("canShowRendererPrompt) {");
    const downloadBtnWiringAt = hudSource.indexOf('querySelector("#renderer-prompt-download")', overlayBlockStart);

    expect(overlayBlockStart).toBeGreaterThan(-1);
    expect(downloadBtnWiringAt).toBeGreaterThan(overlayBlockStart);

    const wiringBlock = hudSource.slice(downloadBtnWiringAt, downloadBtnWiringAt + 300);
    expect(wiringBlock).toContain("buildDiagnosticsBundle(state, wsUrl)");
    expect(wiringBlock).toContain("downloadDiagnosticsBundle(bundle)");
  });

  it("does not reintroduce the removed Settings-tab low-FPS banner", () => {
    expect(hudSource).not.toContain("settings-low-fps-banner");
    expect(hudSource).not.toContain("data-settings-switch-2d");
  });

  it("styles the download button via CSS rather than an inline style attribute", () => {
    expect(hudSource).not.toMatch(/id="renderer-prompt-download"[^>]*style=/);
  });
});
