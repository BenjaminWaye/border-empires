// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import type { TownListRow } from "../client-town-list/client-town-list.js";
import { navHtml } from "./client-hud-v2-nav.js";
import { townsBannerHtml, townsBodyHtml } from "./client-hud-v2-towns.js";

const row = (x: number, name: string, goldPerMinute: number, isFed = true): TownListRow => ({
  x,
  y: 2,
  name,
  tierLabel: "Town",
  goldPerMinute,
  population: 4200,
  maxPopulation: 8000,
  growthPerMinute: 1.25,
  isFed,
  openSlots: 3
});

describe("HUD v2 towns screen", () => {
  it("has a Towns bubble in the nav", () => {
    const html = navHtml({ name: "Me", color: "#fff", afcReady: 0, diplomacyRequests: 0, chronicleUnread: 0, active: "towns" });
    expect(html).toContain('data-hud-v2-open="towns"');
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelector('[data-hud-v2-open="towns"]')?.classList.contains("hud-v2-bubble-active")).toBe(true);
  });

  it("lists rows in the given order with gold per day and open targets", () => {
    const html = townsBodyHtml([row(1, "Brimvale", 0.5), row(4, "Ashford", 2)], { key: "gold", descending: false });
    expect(html.indexOf("Brimvale")).toBeLessThan(html.indexOf("Ashford"));
    expect(html).toContain("720.0");
    expect(html).toContain('data-v2-towns-open="4,2"');
    expect(html).toContain("4,200");
    expect(html).toContain("+1.3");
    expect(html).toContain("Coin/day ▲");
    expect(html).toContain('title="Open build slots">3<');
    expect(html).toContain(">Slots<");
  });

  // Playtest day 1 (four personas at 375px): the headers ran together as "Coin/day ▼PopulationGrowth/min".
  it("keeps column headers short enough for a phone, with the full meaning in their titles", () => {
    const host = document.createElement("div");
    host.innerHTML = townsBodyHtml([row(1, "A", 1)], { key: "gold", descending: true });
    const headers = Array.from(host.querySelectorAll<HTMLElement>("[data-v2-towns-sort]"));
    expect(headers.map((h) => h.textContent)).toEqual(["Coin/day ▼", "Pop", "Growth", "Slots"]);
    for (const h of headers) expect((h.textContent ?? "").replace(/\s[▼▲]$/u, "").length).toBeLessThanOrEqual(8);
    expect(headers.every((h) => (h.title ?? "").length > 0)).toBe(true);
    // The short "Growth" header keeps its unit visible in the cell.
    expect(host.querySelectorAll(".v2l-row .v2l-num")[2]?.textContent).toMatch(/\/min$/);
  });

  it("flags unfed towns and escapes names", () => {
    const html = townsBodyHtml([row(1, "<b>x</b>", 1, false)], { key: "gold", descending: true });
    expect(html).toContain("v2l-unfed");
    expect(html).toContain("Unfed");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("shows an empty state and the town count", () => {
    expect(townsBodyHtml([], { key: "gold", descending: true })).toContain("No towns yet");
    expect(townsBannerHtml([row(1, "A", 1), row(2, "B", 1)])).toContain("<b>2</b> towns");
  });
});
