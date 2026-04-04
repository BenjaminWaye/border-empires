import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientHudSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-hud.ts"), "utf8");
};

describe("defensibility panel weak-tile toggle regression guard", () => {
  it("binds weak-tile buttons after the defensibility panel markup is injected", () => {
    const source = clientHudSource();
    const panelInsertAt = source.indexOf('panelDefensibilityEl.innerHTML = defensibilityPanelHtml;');
    const mobilePanelInsertAt = source.indexOf('mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml;');
    const weakToggleBindAt = source.indexOf('const weakDefButtons = dom.hud.querySelectorAll("[data-toggle-weak-def]") as NodeListOf<HTMLButtonElement>;');

    expect(panelInsertAt).toBeGreaterThan(-1);
    expect(mobilePanelInsertAt).toBeGreaterThan(panelInsertAt);
    expect(weakToggleBindAt).toBeGreaterThan(mobilePanelInsertAt);
  });
});
