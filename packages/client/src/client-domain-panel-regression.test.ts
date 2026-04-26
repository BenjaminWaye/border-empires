import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("domain panel detail layout regression guard", () => {
  it("keeps desktop domain detail open as a fixed-width cover and shifts the minimap instead of the panel", () => {
    const styleSource = sourceFor("./style.css");
    const hudSource = sourceFor("./client-hud.ts");

    expect(styleSource).toContain("#hud.desktop-side-panel-open #mini-map-wrap");
    expect(styleSource).toContain("right: 456px;");
    expect(styleSource).not.toContain("#side-panel.domain-panel-active #panel-domains-content");
    expect(hudSource).toContain("const bindDomainPanelInteraction = (panel: HTMLElement): void => {");
    expect(hudSource).toContain("bindDomainPanelInteraction(dom.panelDomainsContentEl);");
  });

  it("shows the client build version in the settings card", () => {
    const hudSource = sourceFor("./client-hud.ts");
    const styleSource = sourceFor("./style.css");

    expect(hudSource).toContain("Client build ${CLIENT_BUILD_VERSION}");
    expect(styleSource).toContain(".client-build-version");
  });

  it("keeps auth investigation details and copy support in the settings card", () => {
    const hudSource = sourceFor("./client-hud.ts");

    expect(hudSource).toContain("const authDebugHtml = (): string => {");
    expect(hudSource).toContain("data-copy-auth-debug");
    expect(hudSource).toContain("Copy Auth Debug");
    expect(hudSource).toContain("Auth uid ${authUid}");
    expect(hudSource).toContain("Game playerId ${playerId}");
    expect(hudSource).toContain("const authDebugCopyButtons = dom.hud.querySelectorAll(\"[data-copy-auth-debug]\")");
  });
});
