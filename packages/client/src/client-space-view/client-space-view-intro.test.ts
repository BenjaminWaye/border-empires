import { describe, expect, it } from "vitest";
import { spaceViewIntroHtml, spaceViewIntroStyle, SPACE_VIEW_INTRO_TIP_ID } from "./client-space-view-intro.js";
import { spaceViewWelcomeStyle } from "./client-space-view-welcome-letter.js";
import { spaceCardsStyle } from "../client-space-cards/space-cards-style.js";
import { spaceViewStyle } from "./client-space-view-html.js";

const zIndexOf = (css: string, selector: string): number => {
  const block = css.slice(css.indexOf(selector));
  const match = /z-index:\s*(\d+)/.exec(block.slice(0, block.indexOf("}")));
  if (!match) throw new Error(`no z-index for ${selector}`);
  return Number(match[1]);
};

describe("spaceViewIntroHtml", () => {
  it("renders a dismiss button and the backdrop data attribute", () => {
    const html = spaceViewIntroHtml();
    expect(html).toContain("data-space-view-intro");
    expect(html).toContain("data-space-view-intro-dismiss");
  });

  it("covers every major galactic-layer concept a first-time visitor needs", () => {
    const html = spaceViewIntroHtml();
    for (const keyword of ["Influence", "Production", "Senate", "Fleet", "Garrison", "Sector"]) {
      expect(html).toContain(keyword);
    }
  });
});

describe("spaceViewIntroStyle stacking", () => {
  it("draws the briefing and welcome letter above the action cards", () => {
    const cards = zIndexOf(spaceCardsStyle, ".sc-root {");
    const intro = zIndexOf(spaceViewIntroStyle, ".sv-intro-backdrop{");
    expect(intro).toBeGreaterThan(cards);
    expect(zIndexOf(spaceViewWelcomeStyle, ".sv-welcome-backdrop{")).toBeGreaterThan(intro);
  });

  it("opens Settings, Senate and Duke panels above the cards but under the briefing", () => {
    const cards = zIndexOf(spaceCardsStyle, ".sc-root {");
    const intro = zIndexOf(spaceViewIntroStyle, ".sv-intro-backdrop{");
    const panel = zIndexOf(spaceViewStyle, ".sv-settings-panel{position");
    const close = zIndexOf(spaceViewStyle, ".sv-panel-close{position");
    expect(panel).toBeGreaterThan(cards);
    expect(close).toBeGreaterThan(panel);
    expect(intro).toBeGreaterThan(close);
  });
});

describe("SPACE_VIEW_INTRO_TIP_ID", () => {
  it("is a stable, distinct id from any DiscoveryTipId (never collides with a tile-discovery tip)", () => {
    expect(SPACE_VIEW_INTRO_TIP_ID).toBe("GALAXY_INTRO");
  });
});
