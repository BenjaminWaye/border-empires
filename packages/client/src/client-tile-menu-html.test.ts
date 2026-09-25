import { describe, expect, it } from "vitest";
import { tileActionMenuHtml } from "./client-tile-menu-html.js";
import type { TileMenuView } from "./client-types.js";

const baseView: TileMenuView = {
  title: "Testford (10, 10)",
  townCharacter: "Fertile Town",
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
  it("renders a town character between the town name and ownership subtitle", () => {
    const html = tileActionMenuHtml(baseView, "overview", false);
    expect(html).toContain('<div class="tile-action-town-character">Town character · <strong>Fertile Town</strong></div>');
  });

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

// docs/replenishment-update-plan.md D6: the commit-choice tab on a muster
// flag's own tile menu.
describe("tileActionMenuHtml commit tab rendering", () => {
  const commitView: TileMenuView = {
    ...baseView,
    tabs: ["commit"],
    commit: {
      mode: "MARCH",
      hasTarget: true,
      targetX: 11,
      targetY: 10,
      floor: 60,
      cap: 720,
      commitManpower: 120,
      winChancePercent: 74,
      baseWinChancePercent: 55,
      presets: [
        { key: "normal", label: "Normal", amount: 60 },
        { key: "extra", label: "Extra", amount: 90 },
        { key: "double", label: "Double", amount: 120 }
      ]
    }
  };

  it("renders the slider bounded by the floor and the manpower cap, at the current commitment", () => {
    const html = tileActionMenuHtml(commitView, "commit", false);
    expect(html).toContain('min="60"');
    expect(html).toContain('max="720"');
    expect(html).toContain('value="120"');
  });

  it("renders all three presets with their computed amounts", () => {
    const html = tileActionMenuHtml(commitView, "commit", false);
    expect(html).toContain("Normal (60)");
    expect(html).toContain("Extra (90)");
    expect(html).toContain("Double (120)");
  });

  it("shows the cached win chance when one is available", () => {
    const html = tileActionMenuHtml(commitView, "commit", false);
    expect(html).toContain("74% win chance");
  });

  it("prompts to preview odds when no preview is cached yet but a target is set", () => {
    const view: TileMenuView = { ...commitView, commit: { ...commitView.commit!, winChancePercent: undefined } };
    const html = tileActionMenuHtml(view, "commit", false);
    expect(html).toContain("open Launch Attack on the target tile once to preview odds");
  });

  it("prompts to set a march target when the flag has none", () => {
    const view: TileMenuView = { ...commitView, commit: { ...commitView.commit!, hasTarget: false, winChancePercent: undefined, targetX: undefined, targetY: undefined } };
    const html = tileActionMenuHtml(view, "commit", false);
    expect(html).toContain("Set a march target to preview odds");
  });

  it("shows an empty state when the tile has no muster flag at all", () => {
    const view: TileMenuView = { ...baseView, tabs: ["commit"], commit: undefined };
    const html = tileActionMenuHtml(view, "commit", false);
    expect(html).toContain("No muster flag here.");
  });
});
