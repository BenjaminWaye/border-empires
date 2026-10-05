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

describe("tileActionMenuHtml building category squares", () => {
  const building = (id: TileMenuView["buildings"][number]["id"], label: string): TileMenuView["buildings"][number] => ({ id, label });
  const sevenBuildings = [
    building("build_fortification", "Build Thunder Bastion"),
    building("build_siege_camp", "Build Dread Tower"),
    building("build_observatory", "Build Aether Tower"),
    building("build_airport", "Build Sky Dock"),
    building("build_radar_system", "Build Resonance Grid"),
    building("build_waterworks", "Build Waterworks"),
    building("build_relay_beacon", "Build Relay Beacon")
  ];
  const viewWith = (buildings: TileMenuView["buildings"]): TileMenuView => ({ ...baseView, tabs: ["buildings"], buildings });

  it("omits the Monuments square entirely when no monument action is available", () => {
    const html = tileActionMenuHtml(viewWith(sevenBuildings), "buildings", false);
    expect(html).not.toContain("cat-monument");
    expect(html).toContain("repeat(4,");
  });

  it("shows the Monuments square once a monument action is available", () => {
    const html = tileActionMenuHtml(viewWith([...sevenBuildings, building("build_world_engine_part_1", "Build The Long Barrel")]), "buildings", false);
    expect(html).toContain("cat-monument");
    expect(html).toContain("repeat(5,");
  });

  it("still shows other empty categories as disabled rather than hiding them", () => {
    const html = tileActionMenuHtml(viewWith(sevenBuildings), "buildings", false);
    expect(html).toContain("tile-building-category-square cat-resource is-empty");
    expect(html).toContain("tile-building-category-square cat-town_support is-empty");
  });
});

describe("recommended actions", () => {
  it("lists a recommended action first, highlights it, and puts its auto-settle checkbox right under its button", () => {
    const view: TileMenuView = {
      ...baseView,
      tabs: ["actions"],
      actions: [
        { id: "build_relay_beacon", label: "Relay Beacon" },
        { id: "settle_land", label: "Settle Land", recommended: true, autoSettleOption: { category: "food", checked: false, label: "Settle farms and fish automatically from now on" } }
      ]
    };
    const html = tileActionMenuHtml(view, "actions", false);
    expect(html.indexOf('data-action="settle_land"')).toBeLessThan(html.indexOf('data-action="build_relay_beacon"'));
    expect(html).toContain('class="tile-action-btn is-recommended"');
    expect(html).toContain("★ Recommended");
    expect(html.indexOf("data-tile-auto-settle")).toBeGreaterThan(html.indexOf('data-action="settle_land"'));
    expect(html.indexOf("data-tile-auto-settle")).toBeLessThan(html.indexOf('data-action="build_relay_beacon"'));
  });
});

describe("tileActionMenuHtml battle progress card", () => {
  const battleView = (): TileMenuView => ({
    ...baseView,
    tabs: ["overview", "progress"],
    progress: {
      title: "Under attack",
      detail: "Chance of holding this tile: 30% you, 70% <img src=x onerror=alert(1)>.",
      remainingLabel: "0:02",
      progress: 0.5,
      note: "note",
      battle: { attackerColor: "#f00", defenderColor: "#0f0", attackerShare: 0.7, attackerLabel: "<b>Evil</b>", defenderLabel: "You" }
    }
  });

  it("shows each side's percentage on the versus bar", () => {
    const html = tileActionMenuHtml(battleView(), "progress", false);
    expect(html).toContain("You 30%");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt; 70%");
  });

  it("escapes player names in the progress detail and bar labels", () => {
    const html = tileActionMenuHtml(battleView(), "progress", false);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
