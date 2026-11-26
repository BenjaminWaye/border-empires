import { describe, expect, it } from "vitest";
import { townsFocusBarHtml, townsFocusCellHtml, type TownsFocusState } from "./client-hud-v2-towns-focus.js";

const s = (extra: Partial<TownsFocusState> = {}): TownsFocusState => ({ active: "BALANCED", growthPaused: false, ...extra });

describe("Towns list focus column", () => {
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
    expect(html).toContain("2 Levy · free, switches now");
    expect(html).toMatch(/data-v2-towns-focus-all="LEVY" disabled/);
    expect(html).not.toMatch(/data-v2-towns-focus-all="GROWTH" disabled/);
  });

  it("shows how many towns a confirmed set-all changes, and hides itself for one town", () => {
    const byKey = new Map([["1,0", s()], ["2,0", s({ active: "LEVY" })], ["3,0", s()]]);
    expect(townsFocusBarHtml({ byKey, confirmAll: "LEVY" }, 3)).toContain("Again: 2 → Levy");
    expect(townsFocusBarHtml({ byKey: new Map([["1,0", s()]]) }, 1)).toBe("");
  });
});
