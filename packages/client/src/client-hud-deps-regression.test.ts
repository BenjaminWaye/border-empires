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

  it("wires domain detail overlays and clears the unused mobile tile guidance block", () => {
    const bootstrapSource = readFileSync(new URL("./client-bootstrap.ts", import.meta.url), "utf8");
    const techFlowSource = readFileSync(new URL("./client-tech-panel-flow.ts", import.meta.url), "utf8");
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");
    const detailSource = readFileSync(new URL("./client-tech-detail-ui.ts", import.meta.url), "utf8");

    expect(bootstrapSource).toContain("renderDomainDetailOverlay: techFlow.renderDomainDetailOverlay");
    expect(techFlowSource).toContain("const renderDomainDetailOverlay = (): string =>");
    expect(hudSource).toContain("state.domainDetailOpen");
    expect(hudSource).toContain("dom.techDetailOverlayEl.onclick = (event: MouseEvent) => {");
    expect(hudSource).toContain('const domainUnlockTrigger = target?.closest<HTMLButtonElement>("[data-domain-unlock]")');
    expect(detailSource).toContain("showInlineClose: false");
    expect(hudSource).toContain('dom.mobileCoreHelpEl.innerHTML = "";');
    expect(hudSource).toContain('dom.mobileCoreHelpEl.style.display = "none";');
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

  it("binds logout on every rendered domains panel copy instead of one global id lookup", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain('data-auth-logout');
    expect(hudSource).toContain('dom.hud.querySelectorAll("[data-auth-logout]")');
    expect(hudSource).not.toContain('document.querySelector("#auth-logout")');
  });
});
