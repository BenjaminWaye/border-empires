import { describe, expect, it } from "vitest";

import { spaceViewWelcomeLetterStepHtml } from "./client-space-view-welcome-letter.js";

describe("spaceViewWelcomeLetterStepHtml", () => {
  it("names the real Sector number when the gateway has sent one", () => {
    const html = spaceViewWelcomeLetterStepHtml("Argenta", 7);
    expect(html).toContain("Sector 007");
  });

  it("falls back to unnumbered copy when sectorNumber is absent (gateway not yet redeployed)", () => {
    const html = spaceViewWelcomeLetterStepHtml("Argenta");
    expect(html).toContain("the Frontier");
    expect(html).not.toContain("Sector");
  });

  it("escapes HTML in the planet name", () => {
    const html = spaceViewWelcomeLetterStepHtml("<script>alert(1)</script>", 1);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
