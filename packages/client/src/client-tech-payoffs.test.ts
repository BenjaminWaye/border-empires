import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTechHighlightEffectKey, renderTechHighlightTagsHtml, techHighlightTags } from "./client-tech-payoffs.js";

const dataPath = (name: string): string =>
  fileURLToPath(new URL(`../../game-domain/data/${name}`, import.meta.url));
const techTreeData = JSON.parse(readFileSync(dataPath("tech-tree.json"), "utf8"));
const domainTreeData = JSON.parse(readFileSync(dataPath("domain-tree.json"), "utf8"));

// Regression coverage for a recurring bug class: an "unlockX" effect key
// gets added to a tech/domain in the data, but the two independent,
// hand-maintained label dictionaries that render it (this file's chip
// labels, and client-tech-html.ts's full-sentence formatter) don't get
// updated to match — silently rendering a blank chip / blank description
// line for that tech instead of failing loudly. This test catches the gap
// at the data layer so a missing label can't ship unnoticed again.
const allUnlockKeys = (): string[] => {
  const entries = [
    ...(techTreeData as { techs: Array<{ effects?: Record<string, unknown> }> }).techs,
    ...(domainTreeData as { domains: Array<{ effects?: Record<string, unknown> }> }).domains
  ];
  const keys = new Set<string>();
  for (const entry of entries) {
    for (const key of Object.keys(entry.effects ?? {})) {
      if (key.startsWith("unlock")) keys.add(key);
    }
  }
  return [...keys];
};

describe("tech/domain unlock effect keys have a highlight-chip label", () => {
  for (const key of allUnlockKeys()) {
    it(`covers "${key}"`, () => {
      expect(isTechHighlightEffectKey(key)).toBe(true);
    });
  }
});

// Regression coverage for a real bug: revealResource never got a highlight
// chip at all (unlike every unlockX effect), so "Reveals Crystal" showed up
// in the redundant yellow-text summary but nowhere in the tag chips on
// either the tech-tree card or the tech detail view.
describe("revealResource highlight tag", () => {
  it("renders a resource-tone tag for each reveal category", () => {
    const categories: Array<[string, string]> = [
      ["food", "Reveals Food"],
      ["titanium", "Reveals Titanium"],
      ["crystal", "Reveals Crystal"],
      ["umbrite", "Reveals Umbrite"]
    ];
    for (const [category, label] of categories) {
      const tags = techHighlightTags({ effects: { revealResource: category } });
      expect(tags).toContainEqual({ label, tone: "resource" });
    }
  });

  it("is included alongside structure/action tags, not just on its own", () => {
    const tags = techHighlightTags({
      effects: { unlockObservatory: true, unlockCrystalSynthesizer: true, unlockAetherLance: true, revealResource: "crystal" }
    });
    expect(tags.map((t) => t.label)).toEqual(["Aether Tower", "Aether Condenser", "Aether Purge", "Reveals Crystal"]);
  });

  it("is skipped for an unrecognized reveal category rather than rendering a blank tag", () => {
    const tags = techHighlightTags({ effects: { revealResource: "shard" } });
    expect(tags).toEqual([]);
  });
});

// Agrarian Works (unlockFarmstead) grants both the Farmstead structure and a
// separate +1 FOOD slot on every owned fish tile (AGRICULTURE_FISH_FOOD_SLOT_BONUS,
// client-tech-html.ts's full-sentence description already calls this out) --
// the chip row only showed "Farmstead" and silently dropped the fish bonus.
describe("unlockFarmstead highlight tags", () => {
  it("renders both the Farmstead chip and the fish-tile food-slot chip", () => {
    const tags = techHighlightTags({ effects: { unlockFarmstead: true } });
    expect(tags).toEqual([
      { label: "Farmstead", tone: "structure" },
      { label: "Fish Tiles +1 Food Slot", tone: "upgrade" }
    ]);
  });
});

// Regression coverage for a real bug: the tech-tree card capped highlight
// tags at 2 while the detail view showed up to 6 -- a tech with 3+ tags
// (e.g. 2 structures + 1 ability) showed a different tag set depending on
// which view you looked at. Both views now share the same default cap.
describe("renderTechHighlightTagsHtml default cap", () => {
  it("renders more than 2 tags by default, matching every call site", () => {
    const html = renderTechHighlightTagsHtml({
      effects: { unlockObservatory: true, unlockCrystalSynthesizer: true, unlockAetherLance: true }
    });
    expect(html).toContain("Aether Tower");
    expect(html).toContain("Aether Condenser");
    expect(html).toContain("Aether Purge");
  });
});
