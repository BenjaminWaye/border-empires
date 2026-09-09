import { describe, expect, it } from "vitest";
import { spaceViewIntroHtml, SPACE_VIEW_INTRO_TIP_ID } from "./client-space-view-intro.js";

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

describe("SPACE_VIEW_INTRO_TIP_ID", () => {
  it("is a stable, distinct id from any DiscoveryTipId (never collides with a tile-discovery tip)", () => {
    expect(SPACE_VIEW_INTRO_TIP_ID).toBe("GALAXY_INTRO");
  });
});
