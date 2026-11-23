// The Chronicle's Ahead tab: what happens while the player is away, and when to come back.
import { describe, expect, it } from "vitest";
import { aheadTabHtml } from "./client-hud-v2-chronicle-ahead.js";
import { chronicleTabsHtml } from "./client-hud-v2-chronicle-tabs.js";

describe("Chronicle Ahead tab", () => {
  it("sits between Yours and World", () => {
    const tabs = chronicleTabsHtml({ tab: "ahead", unreadActivity: 2, unseenUpdates: 0 });
    expect([...tabs.matchAll(/data-v2-chronicle-tab="(\w+)"/g)].map((m) => m[1])).toEqual(["yours", "ahead", "world", "updates"]);
    expect(tabs).toContain(`class="v2c-tab v2c-tab-on" aria-selected="true" data-v2-chronicle-tab="ahead">Ahead</button>`);
  });

  it("opens with the time to come back, then the rows with a way to the place", () => {
    const html = aheadTabHtml({
      returnIn: { inMs: 7 * 3_600_000 + 40 * 60_000, reason: "manpower is full" },
      items: [
        { kind: "builds", text: "Fort at (3, 4) finishes in 40s", inMs: 40_000, focus: { x: 3, y: 4 } },
        { kind: "queue", text: "6 more queued: each starts when a slot is free" },
        { kind: "hold_rival", text: "K<b>'s Town Control hold wins the Sector Contest in 6h unless it is broken", inMs: 1, open: "ranks" }
      ]
    });
    expect(html.indexOf("Good moment to come back")).toBeLessThan(html.indexOf("WHILE YOU ARE AWAY"));
    expect(html).toContain("In about <b>7h 40m</b>, when manpower is full.");
    expect(html).toContain(`data-v2-ahead-focus data-x="3" data-y="4">Show</button>`);
    expect(html).toContain(`data-hud-v2-open="ranks">Ranks</button>`);
    expect(html).toContain("K&lt;b&gt;'s Town Control");
    expect(html).toContain(`class="v2c-ahead-row v2c-ahead-queue"><span class="v2c-ahead-text">6 more queued: each starts when a slot is free</span></div>`);
    expect(html).not.toMatch(/\bturns?\b/i);
  });

  it("says so when nothing is underway", () => {
    const html = aheadTabHtml({ items: [] });
    expect(html).toContain("Nothing is underway.");
    expect(html).not.toContain("v2c-return");
  });
});
