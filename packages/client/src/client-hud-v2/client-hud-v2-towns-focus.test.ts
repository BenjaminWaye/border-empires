import { describe, expect, it } from "vitest";
import { townsFocusBarHtml, townsFocusCellHtml, type TownsFocusState } from "./client-hud-v2-towns-focus.js";

const s = (extra: Partial<TownsFocusState> = {}): TownsFocusState => ({ active: "BALANCED", growthPaused: false, lockedInMs: 0, ...extra });

describe("Towns list focus column", () => {
  it("shows ✓ to confirm a previewed focus on its row", () => {
    const html = townsFocusCellHtml("4,2", s({ selected: "COMMERCE" }));
    expect(html).toMatch(/v2lf-picked[^"]*" data-v2-towns-focus="4,2" data-focus="COMMERCE"/);
    expect(html).toContain('data-v2-towns-focus-confirm="4,2"');
  });

  // Owner, First-15 round 1: the ✓ committed a lock of hours without saying so.
  it("says on the row's confirm how long the change locks the town", () => {
    const html = townsFocusCellHtml("4,2", s({ selected: "COMMERCE" }), (3 * 60 + 58) * 60_000);
    expect(html).toContain('<span class="v2lf-confirm-lock">Lock 3h 58m</span>');
    expect(html).toContain("stays until your next refill, in 3h 58m");
  });

  it("says how long Set every town locks the towns on its confirming press", () => {
    const byKey = new Map([["1,0", s()], ["2,0", s()]]);
    expect(townsFocusBarHtml({ byKey, confirmAll: "LEVY", lockForMs: 37 * 60_000 }, 2)).toContain("Again: 2 → Levy · locks 37m");
  });

  it("disables a locked town's icons and says when it frees up", () => {
    const html = townsFocusCellHtml("4,2", s({ lockedInMs: 37 * 60_000 }));
    expect(html.match(/ disabled /g)).toHaveLength(4);
    expect(html).toContain("Locked until your next refill, in 37m");
    expect(html).not.toContain("data-v2-towns-focus-confirm");
  });

  it("leaves locked towns out of what Set every town would change", () => {
    const byKey = new Map([["1,0", s()], ["2,0", s({ lockedInMs: 1 })], ["3,0", s()]]);
    const html = townsFocusBarHtml({ byKey, confirmAll: "LEVY" }, 3);
    expect(html).toContain("Again: 2 → Levy");
    expect(html).toContain("1 locked until your next refill");
  });

  it("marks the chosen focus and leaves the rest idle", () => {
    const html = townsFocusCellHtml("4,2", s({ active: "LEVY" }));
    expect(html).toMatch(/v2lf-active[^"]*" data-v2-towns-focus="4,2" data-focus="LEVY"/);
    expect(html).toMatch(/v2lf-idle[^"]*" data-v2-towns-focus="4,2" data-focus="BALANCED"/);
    expect(html).toContain("Levy (active)");
  });

  it("dims Growth and says why on a town whose growth is paused", () => {
    const html = townsFocusCellHtml("4,2", s({ growthPaused: true }));
    expect(html).toMatch(/v2lf-paused" data-v2-towns-focus="4,2" data-focus="GROWTH"/);
    expect(html).toContain("Growth is paused here");
    expect(townsFocusCellHtml("4,2", s())).not.toContain("v2lf-paused");
  });

  it("renders an empty cell for a town it has no focus for", () => {
    expect(townsFocusCellHtml("4,2", undefined)).toBe('<span class="v2lf-cell"></span>');
  });

  it("counts each town under its focus and disables a no-op set-all", () => {
    const byKey = new Map([["1,0", s({ active: "LEVY" })], ["2,0", s({ active: "LEVY" })]]);
    const html = townsFocusBarHtml({ byKey }, 2);
    expect(html).toContain("2 Levy · a change locks until your next refill");
    expect(html).toMatch(/data-v2-towns-focus-all="LEVY" disabled/);
    expect(html).not.toMatch(/data-v2-towns-focus-all="GROWTH" disabled/);
  });

  it("shows how many towns a confirmed set-all changes, and hides itself for one town", () => {
    const byKey = new Map([["1,0", s()], ["2,0", s({ active: "LEVY" })], ["3,0", s()]]);
    expect(townsFocusBarHtml({ byKey, confirmAll: "LEVY" }, 3)).toContain("Again: 2 → Levy");
    expect(townsFocusBarHtml({ byKey: new Map([["1,0", s()]]) }, 1)).toBe("");
  });

  it("never promises more towns than one command sends", () => {
    const byKey = new Map(Array.from({ length: 150 }, (_, i) => [`${i},0`, s()] as [string, TownsFocusState]));
    expect(townsFocusBarHtml({ byKey, confirmAll: "LEVY" }, 150)).toContain("Again: 100 → Levy");
  });
});

