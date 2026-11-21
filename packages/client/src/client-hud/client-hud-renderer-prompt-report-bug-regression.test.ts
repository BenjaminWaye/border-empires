import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("renderer prompt overlay Report Bug button", () => {
  // The overlay markup/wiring lives in its own module (extracted from
  // client-hud.ts to keep the HUD under the file-line cap); the HUD just delegates.
  const hudSource = readFileSync(new URL("../client-renderer-prompt/client-renderer-prompt-overlay.ts", import.meta.url), "utf8");
  const clientHudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

  it("is still rendered by the HUD", () => {
    expect(clientHudSource).toContain("renderRendererPromptOverlay(");
  });

  it("renders a Report Bug button (not Download Diagnostics) inside the renderer prompt overlay", () => {
    expect(hudSource).toContain('id="renderer-prompt-report-bug"');
    expect(hudSource).toContain("renderer-prompt-report-bug-btn");
    expect(hudSource).toContain(">Report Bug</button>");
    expect(hudSource).not.toContain("Download Diagnostics</button>");
  });

  it("wires the button to open the bug report dialog", () => {
    const overlayBlockStart = hudSource.indexOf("overlayEl.innerHTML = `");
    const downloadBtnWiringAt = hudSource.indexOf('querySelector("#renderer-prompt-report-bug")', overlayBlockStart);

    expect(overlayBlockStart).toBeGreaterThan(-1);
    expect(downloadBtnWiringAt).toBeGreaterThan(overlayBlockStart);

    const wiringBlock = hudSource.slice(downloadBtnWiringAt, downloadBtnWiringAt + 300);
    expect(wiringBlock).toContain('openReportDialog({ kind: "bug"');
    expect(wiringBlock).not.toContain("downloadDiagnosticsBundle(");
  });

  it("does not reintroduce the removed Settings-tab low-FPS banner", () => {
    for (const source of [hudSource, clientHudSource]) {
      expect(source).not.toContain("settings-low-fps-banner");
      expect(source).not.toContain("data-settings-switch-2d");
    }
  });

  it("styles the report button via CSS rather than an inline style attribute", () => {
    expect(hudSource).not.toMatch(/id="renderer-prompt-report-bug"[^>]*style=/);
  });
});
