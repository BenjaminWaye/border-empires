import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD domain unlock regression", () => {
  // The "Choose Tier N" button on the desktop domain detail card is rendered
  // into panelDomainsContentEl.innerHTML, which is rewritten every render
  // inside renderClientHud. Per-button onclick handlers attached before that
  // rewrite were wiped before the user could click them, so the button looked
  // wired but did nothing. Delegation on the panel container itself survives
  // innerHTML rewrites; if the per-button pattern comes back, this test fails.
  it("delegates domain unlock and detail-close clicks on the panel container", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain('closest<HTMLButtonElement>("[data-domain-unlock]")');
    expect(hudSource).toContain('closest<HTMLElement>("[data-domain-detail-close]")');
    expect(hudSource).not.toMatch(/querySelectorAll\([^)]*#panel-domains \[data-domain-unlock\]/);
    expect(hudSource).not.toMatch(/querySelectorAll\([^)]*#panel-domains \[data-domain-detail-close\]/);
  });
});
