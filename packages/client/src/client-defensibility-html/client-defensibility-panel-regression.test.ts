import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientHudSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../client-hud/client-hud.ts"), "utf8");
};

describe("defensibility panel weak-tile toggle regression guard", () => {
  it("binds weak-tile buttons after the defensibility panel markup is injected", () => {
    const source = clientHudSource();
    // Both panels' markup is injected by renderDefensibilityPanels (client-hud-defensibility-panel.ts).
    const panelsInsertAt = source.indexOf("renderDefensibilityPanels(state, dom,");
    const weakToggleBindAt = source.indexOf('const weakDefButtons = dom.hud.querySelectorAll("[data-toggle-weak-def]") as NodeListOf<HTMLButtonElement>;');

    expect(panelsInsertAt).toBeGreaterThan(-1);
    expect(weakToggleBindAt).toBeGreaterThan(panelsInsertAt);
  });
});
