import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("defensibility panel weak-tile toggle regression guard", () => {
  it("binds weak-tile buttons after the defensibility panel markup is injected", () => {
    const source = clientMainSource();
    const weakToggleBindAt = source.indexOf('const weakDefButtons = hud.querySelectorAll<HTMLButtonElement>("[data-toggle-weak-def]");');
    const panelInsertAt = source.indexOf('panelDefensibilityEl.innerHTML = defensibilityPanelHtml;');
    const mobilePanelInsertAt = source.indexOf('mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml;');

    expect(weakToggleBindAt).toBeGreaterThan(-1);
    expect(panelInsertAt).toBeGreaterThan(-1);
    expect(mobilePanelInsertAt).toBeGreaterThan(panelInsertAt);
    expect(panelInsertAt).toBeGreaterThan(weakToggleBindAt);
  });
});
