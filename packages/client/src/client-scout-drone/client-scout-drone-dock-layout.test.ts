// Phone layout contract for the scout drone dock. The first version ran 392px wide on a 375px phone,
// cut Go off and covered the manpower gauge (owner, 2026-11-21). happy-dom does not lay out CSS, so,
// like client-hud-v2-compact-bottom-reserve.test.ts, the contract is checked in the sources.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const dockCss = read("./client-scout-drone-dock.css");
const compactCss = read("../client-hud-v2/client-hud-v2-compact.css");

const ruleBody = (css: string, selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

const px = (text: string, pattern: RegExp): number => Number(pattern.exec(text)?.[1] ?? Number.NaN);

describe("scout drone dock on a phone", () => {
  it("keeps clear of the manpower gauge and inside the safe areas", () => {
    const dock = ruleBody(dockCss, "body.hud-v2-compact #scout-drone-dock");
    const orbWidth = px(ruleBody(compactCss, "body.hud-v2-compact .hud-v2-orb"), /width:\s*(\d+)px/);
    const orbInset = px(ruleBody(compactCss, "body.hud-v2-compact .hud-v2-orb-slot"), /right:\s*calc\(var\(--v2c-safe-right\)\s*\+\s*(\d+)px\)/);
    const dockLeft = px(dock, /left:\s*calc\(var\(--v2c-safe-left\)\s*\+\s*(\d+)px\)/);
    const reserved = px(dock, /max-width:\s*calc\(100vw - var\(--v2c-safe-left\) - var\(--v2c-safe-right\) - (\d+)px\)/);
    expect(dock).toContain("transform: none");
    // Left gutter + the dock + a gap of at least 8px + the gauge + its inset fit the screen.
    expect(reserved - dockLeft - orbWidth - orbInset).toBeGreaterThanOrEqual(8);
  });

  it("hides the search lens only on a phone, where the dock, pill or report takes its corner", () => {
    expect(dockCss).toContain("body.hud-v2-compact.scout-focus .hud-v2-lens-btn");
    expect(dockCss).not.toMatch(/(^|\n)body\.scout-(planning|focus) \.hud-v2-lens-btn/);
  });
});
