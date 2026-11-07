import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD dependency wiring", () => {
  it("passes renderMobilePanels into renderClientHud", () => {
    const source = readFileSync(new URL("../client-bootstrap/client-bootstrap.ts", import.meta.url), "utf8");
    const renderHudCallAt = source.indexOf("renderClientHud({");
    const renderMobilePanelsAt = source.indexOf("renderMobilePanels,", renderHudCallAt);

    expect(renderHudCallAt).toBeGreaterThan(-1);
    expect(renderMobilePanelsAt).toBeGreaterThan(renderHudCallAt);
  });


  it("keeps expanded desktop tech trees in split layout even when a detail card is open", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain('state.techDetailOpen && !state.techTreeExpanded');
  });

});
