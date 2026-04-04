import { describe, expect, it } from "vitest";
import { rememberTileMenuScrollTop, restoreTileMenuScrollTop } from "./client-tile-menu-scroll.js";

describe("tile menu scroll memory", () => {
  it("stores and restores scroll position per tab", () => {
    const memory = {
      activeTab: "buildings" as const,
      scrollTopByTab: { overview: 18 }
    };
    const next = rememberTileMenuScrollTop(memory, 144);
    expect(next.overview).toBe(18);
    expect(next.buildings).toBe(144);
    expect(restoreTileMenuScrollTop(next, "buildings")).toBe(144);
    expect(restoreTileMenuScrollTop(next, "overview")).toBe(18);
  });

  it("clamps negative scroll offsets to zero", () => {
    const next = rememberTileMenuScrollTop({ activeTab: "actions", scrollTopByTab: {} }, -30);
    expect(next.actions).toBe(0);
    expect(restoreTileMenuScrollTop(next, "actions")).toBe(0);
  });
});
