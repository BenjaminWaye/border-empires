import { describe, expect, it } from "vitest";
import { tileActionMenuHtml } from "./client-tile-menu-html.js";
import type { TileMenuView } from "./client-types.js";

const baseView: TileMenuView = {
  title: "Testford (10, 10)",
  subtitle: "Your settled land",
  tabs: ["overview"],
  overviewLines: [
    { html: "Modifiers", kind: "section" },
    { html: "6 Mintworks", kind: "group" },
    { html: "<span>Gold production</span>", kind: "effect", nested: true },
    { html: "<span>6 connected towns</span>", kind: "effect" }
  ],
  actions: [],
  buildings: [],
  crystal: []
};

describe("tileActionMenuHtml overview line rendering", () => {
  it("renders a 'group' kind line with the group heading class", () => {
    const html = tileActionMenuHtml(baseView, "overview", false);
    expect(html).toContain('<div class="tile-overview-line tile-overview-line-group">6 Mintworks</div>');
  });

  it("renders a nested effect line with both the effect and nested classes", () => {
    const html = tileActionMenuHtml(baseView, "overview", false);
    expect(html).toContain('<div class="tile-overview-line tile-overview-line-effect tile-overview-line-nested"><span>Gold production</span></div>');
  });

  it("does not add the nested class to a non-nested effect line", () => {
    const html = tileActionMenuHtml(baseView, "overview", false);
    expect(html).toContain('<div class="tile-overview-line tile-overview-line-effect"><span>6 connected towns</span></div>');
  });
});
