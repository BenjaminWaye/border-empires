import { describe, expect, it } from "vitest";
import type { TileMenuView } from "../client-types.js";
import { actionBarHtml } from "./client-hud-v2-action-bar.js";
import { detailLinesBeyondFacts } from "./client-hud-v2-tile-details.js";
import type { TileFact } from "./client-hud-v2-tile-facts.js";

const BEACON_FACTS: TileFact[] = [
  { label: "Building", value: "Relay Beacon" },
  { label: "State", value: "Active", tone: "good" },
  { label: "Gives", value: "Local vision +5" }
];

const BEACON_LINES: TileMenuView["overviewLines"] = [
  { html: "Built: Relay Beacon" },
  { html: "Upkeep", kind: "section" },
  { html: "Relay Beacon: 1 FOOD slot" },
  { html: "Modifiers", kind: "section" },
  { html: "<strong>Local vision:</strong> <span>+5</span>", kind: "effect" }
];

const view = (overviewLines: TileMenuView["overviewLines"]): TileMenuView =>
  ({ title: "Sand (110, 176)", subtitle: "", tabs: [], overviewLines, actions: [], buildings: [], crystal: [] }) as TileMenuView;

describe("Details beyond the fact strip", () => {
  // Regression: Details repeated "Built: Relay Beacon" and the Local vision modifier already shown as Building and Gives.
  it("drops lines the strip already shows, and headings left empty", () => {
    const html = detailLinesBeyondFacts(BEACON_LINES, BEACON_FACTS).map((l) => l.html);
    expect(html).toEqual(["Upkeep", "Relay Beacon: 1 FOOD slot"]);
  });

  it("keeps grouped lines and their heading while any survive", () => {
    const lines: TileMenuView["overviewLines"] = [
      { html: "Production", kind: "section" },
      { html: "2 Manufactories", kind: "group" },
      { html: "Local vision: +5", kind: "effect", nested: true },
      { html: "Output: +2 iron", kind: "effect", nested: true },
      { html: "3 Farms", kind: "group" },
      { html: "Local vision: +5", kind: "effect", nested: true }
    ];
    expect(detailLinesBeyondFacts(lines, BEACON_FACTS).map((l) => l.html)).toEqual(["Production", "2 Manufactories", "Output: +2 iron"]);
  });

  it("hides Details when the strip already says everything", () => {
    const lines: TileMenuView["overviewLines"] = [{ html: "Built: Relay Beacon" }, { html: "Modifiers", kind: "section" }, { html: "Local vision: +5", kind: "effect" }];
    expect(actionBarHtml(view(lines), undefined, BEACON_FACTS)).not.toContain('data-hud-v2-panel="details"');
    expect(actionBarHtml(view(BEACON_LINES), "details", BEACON_FACTS)).not.toContain("Built: Relay Beacon");
  });

  // Review: a numeric fact hid an unrelated line that ended in the same number.
  it("does not drop a line just because its number matches a fact", () => {
    const lines: TileMenuView["overviewLines"] = [{ html: "Garrison: 2" }, { html: "Built: Fort" }];
    const facts: TileFact[] = [{ label: "Defense", value: "2" }, { label: "Building", value: "Fort" }];
    expect(detailLinesBeyondFacts(lines, facts).map((l) => l.html)).toEqual(["Garrison: 2"]);
  });
});
