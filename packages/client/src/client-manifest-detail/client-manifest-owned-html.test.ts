import { describe, expect, it } from "vitest";
import type { TechInfo } from "../client-types.js";
import { techOwnedHtml } from "./client-manifest-owned-html.js";

const make = (id: string, name: string, branch: string, effects: Record<string, unknown>): TechInfo => ({
  id,
  name,
  branch,
  tier: 1,
  manifestCategory: "AFC_MODULE",
  description: "Long lore text that should not be repeated in the list.",
  mods: {},
  effects,
  requirements: { gold: 0, resources: {} }
});

const catalog = [make("masonry", "Titanium Forge Module", "war", { unlockForts: true }), make("trade", "Trade Clearance Grant", "economy", { unlockMintworks: true })];

// The old list was a stack of full-description cards you could not click.
describe("techOwnedHtml (Your Manifests)", () => {
  it("renders each owned Manifest as a clickable button grouped by branch", () => {
    const html = techOwnedHtml(catalog, ["trade", "masonry"]);
    expect(html).toContain("Your Manifests (2)");
    expect(html).toContain('data-tech-card="masonry"');
    expect(html).toContain('data-tech-card="trade"');
    expect(html.indexOf(">War<")).toBeLessThan(html.indexOf(">Economy<"));
    expect(html).not.toContain("Long lore text");
  });

  it("explains the empty state", () => {
    expect(techOwnedHtml(catalog, [])).toContain("You haven't taken any Manifests yet.");
  });
});
