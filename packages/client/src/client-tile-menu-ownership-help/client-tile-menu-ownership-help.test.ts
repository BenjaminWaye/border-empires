import { describe, expect, it } from "vitest";
import { ownershipHelpSubtitleHtml, type OwnershipHelpKind } from "./client-tile-menu-ownership-help.js";

const paragraphs = (html: string): string[] => [...html.matchAll(/<p[^>]*><strong>([^<]+)\.<\/strong>/g)].map((m) => m[1] ?? "");

describe("ownershipHelpSubtitleHtml", () => {
  // Regression: tapping "Your frontier" opened an explainer that led with "Unclaimed".
  it.each<[OwnershipHelpKind, string]>([
    ["frontier", "Frontier"],
    ["unclaimed", "Unclaimed"],
    ["settled", "Garrisoned"]
  ])("leads with and highlights the tapped tile's own %s state", (kind, name) => {
    const html = ownershipHelpSubtitleHtml(kind, "Label");
    const order = paragraphs(html);
    expect(order[0]).toBe(name);
    expect(order).toHaveLength(3);
    expect(html.match(/class="is-current"/g)).toHaveLength(1);
    expect(html).toContain(`<p class="is-current"><strong>${name}.</strong>`);
  });

  it("keeps the label and region in the summary line", () => {
    const html = ownershipHelpSubtitleHtml("frontier", "Your frontier", "Forest");
    expect(html).toContain("<summary>Your frontier</summary>");
    expect(html).toContain(" · Forest");
  });
});
