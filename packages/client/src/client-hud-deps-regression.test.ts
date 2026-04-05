import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD dependency wiring", () => {
  it("passes renderMobilePanels into renderClientHud", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const renderHudCallAt = source.indexOf("renderClientHud({");
    const renderMobilePanelsAt = source.indexOf("renderMobilePanels,", renderHudCallAt);

    expect(renderHudCallAt).toBeGreaterThan(-1);
    expect(renderMobilePanelsAt).toBeGreaterThan(renderHudCallAt);
  });

  it("wires domain detail overlays and removes the mobile tile guidance block", () => {
    const mainSource = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(mainSource).toContain("renderDomainDetailOverlay");
    expect(hudSource).toContain("state.domainDetailOpen");
    expect(hudSource).toContain('dom.mobileCoreHelpEl.innerHTML = mobile');
    expect(hudSource).toContain('dom.mobileCoreHelpEl.style.display = mobile ? "none" : "";');
  });
});
