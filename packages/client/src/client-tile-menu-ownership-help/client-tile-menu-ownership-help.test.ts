import { describe, expect, it } from "vitest";
import { ownershipHelpSubtitleHtml } from "./client-tile-menu-ownership-help.js";

describe("ownershipHelpSubtitleHtml", () => {
  // Regression: tapping "Your frontier" opened an explainer that led with "Unclaimed".
  it("explains only the tapped tile's own ownership state", () => {
    const html = ownershipHelpSubtitleHtml("frontier", "Your frontier");
    expect(html).toContain("<summary>Your frontier</summary>");
    expect(html).toContain("<strong>Frontier.</strong>");
    expect(html).not.toContain("Unclaimed");
    expect(html).not.toContain("Garrisoned.");
  });

  it("explains unclaimed land on unclaimed tiles", () => {
    const html = ownershipHelpSubtitleHtml("unclaimed", "Unclaimed", "Forest");
    expect(html).toContain("<strong>Unclaimed.</strong>");
    expect(html).not.toContain("<strong>Frontier.</strong>");
    expect(html).toContain(" · Forest");
  });
});
