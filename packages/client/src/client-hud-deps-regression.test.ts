import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD dependency wiring", () => {
  it("passes renderMobilePanels into renderClientHud", () => {
    const source = readFileSync(new URL("./client-bootstrap.ts", import.meta.url), "utf8");
    const renderHudCallAt = source.indexOf("renderClientHud({");
    const renderMobilePanelsAt = source.indexOf("renderMobilePanels,", renderHudCallAt);

    expect(renderHudCallAt).toBeGreaterThan(-1);
    expect(renderMobilePanelsAt).toBeGreaterThan(renderHudCallAt);
  });

  it("wires domain detail overlays and removes the mobile tile guidance block", () => {
    const bootstrapSource = readFileSync(new URL("./client-bootstrap.ts", import.meta.url), "utf8");
    const techFlowSource = readFileSync(new URL("./client-tech-panel-flow.ts", import.meta.url), "utf8");
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(bootstrapSource).toContain("renderDomainDetailOverlay: techFlow.renderDomainDetailOverlay");
    expect(techFlowSource).toContain("const renderDomainDetailOverlay = (): string =>");
    expect(hudSource).toContain("state.domainDetailOpen");
    expect(hudSource).toContain('dom.mobileCoreHelpEl.innerHTML = mobile');
    expect(hudSource).toContain('dom.mobileCoreHelpEl.style.display = mobile ? "none" : "";');
  });

  it("keeps expanded desktop tech trees in split layout even when a detail card is open", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain('state.techDetailOpen && !deps.techDetailsUseOverlay() && !state.techTreeExpanded');
  });

  it("rerenders the economy panel immediately when opening it from a stat chip", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain('openEconomyPanel(focus ?? "ALL");');
    expect(hudSource).toContain("renderClientHud(deps);");
  });
});
