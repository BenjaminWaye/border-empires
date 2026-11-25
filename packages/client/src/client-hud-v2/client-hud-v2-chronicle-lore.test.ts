import { describe, expect, it } from "vitest";
import { LORE_ENTRIES, LORE_GROUPS, loreEntryById, requestLoreEntry, takeRequestedLoreEntry } from "../client-lore-catalogue/lore-catalogue-entries.js";
import { loreTabHtml, toggledLoreEntry } from "./client-hud-v2-chronicle-lore.js";
import { chronicleTabsHtml } from "./client-hud-v2-chronicle-tabs.js";

describe("lore catalogue", () => {
  it("has unique ids and an entry in every group", () => {
    expect(new Set(LORE_ENTRIES.map((e) => e.id)).size).toBe(LORE_ENTRIES.length);
    for (const group of LORE_GROUPS) expect(LORE_ENTRIES.some((e) => e.group === group)).toBe(true);
  });
  it("has the entries the relic card's \"?\" links to", () => {
    expect(loreEntryById("relics")?.title).toBe("Concordance relics");
    expect(loreEntryById("aether-wake")).toBeDefined();
  });
  it("hands a requested entry to the HUD once", () => {
    requestLoreEntry("relics");
    expect(takeRequestedLoreEntry()).toBe("relics");
    expect(takeRequestedLoreEntry()).toBeUndefined();
  });
});

describe("Lore tab", () => {
  it("lists every entry under its group and shows only the open one's text", () => {
    const html = loreTabHtml("relics");
    for (const group of LORE_GROUPS) expect(html).toContain(group);
    expect(html.match(/data-v2-lore=/g)?.length).toBe(LORE_ENTRIES.length);
    expect(html).toContain("ziggurat access structure");
    expect(html).not.toContain("World Engine, which focused");
  });
  it("toggles an entry open and closed", () => {
    expect(toggledLoreEntry(undefined, "relics")).toBe("relics");
    expect(toggledLoreEntry("relics", "relics")).toBeUndefined();
    expect(toggledLoreEntry("relics", "coin")).toBe("coin");
  });
  it("adds a Lore tab to the Chronicle", () => {
    expect(chronicleTabsHtml({ tab: "lore", unreadActivity: 0, unseenUpdates: 0 })).toContain('data-v2-chronicle-tab="lore"');
  });
});
