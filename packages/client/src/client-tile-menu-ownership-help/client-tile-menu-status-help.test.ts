import { describe, expect, it } from "vitest";
import { statusWithHelpHtml } from "./client-tile-menu-ownership-help.js";

describe("statusWithHelpHtml", () => {
  it("returns the bare status when there is no explainer", () => {
    expect(statusWithHelpHtml("Fogged")).toBe("Fogged");
  });

  it("wraps the status in an expandable that reveals the explainer", () => {
    const html = statusWithHelpHtml("Inside Ravenwood Reach", "Protected by anchors.");
    expect(html).toContain("<summary>Inside Ravenwood Reach</summary>");
    expect(html).toContain("<p>Protected by anchors.</p>");
  });
});
