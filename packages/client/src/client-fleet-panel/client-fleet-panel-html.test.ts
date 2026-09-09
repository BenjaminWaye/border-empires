import { describe, expect, it } from "vitest";
import {
  fleetBlueprintListHtml,
  fleetOrderListHtml,
  fleetBattleLogHtml,
  fleetThreatListHtml,
  fleetTargetOptionsHtml,
  fleetHullCardsHtml,
  fleetCompositionSummaryHtml,
  fleetPanelHtml,
  type FleetBlueprintView,
  type FleetOrderView,
  type FleetBattleLogEntryView,
  type FleetThreatView
} from "./client-fleet-panel-html.js";

describe("fleetBlueprintListHtml", () => {
  it("renders an empty state with no blueprints", () => {
    expect(fleetBlueprintListHtml([])).toContain("No saved blueprints yet.");
  });

  it("renders a blueprint's composition summary", () => {
    const blueprint: FleetBlueprintView = { id: "bp1", name: "Strike Force", composition: { RAIDER: 2, SCOUT: 1 }, weaponEmphasis: "KINETIC" };
    const html = fleetBlueprintListHtml([blueprint]);
    expect(html).toContain("Strike Force");
    expect(html).toContain("2× RAIDER");
    expect(html).toContain("1× SCOUT");
  });

  it("escapes a blueprint name containing HTML", () => {
    const blueprint: FleetBlueprintView = { id: "bp2", name: "<script>x</script>", composition: { SCOUT: 1 }, weaponEmphasis: "KINETIC" };
    const html = fleetBlueprintListHtml([blueprint]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("fleetOrderListHtml", () => {
  it("renders an empty state with no orders", () => {
    expect(fleetOrderListHtml([])).toContain("No fleets sent yet.");
  });

  it("shows the outcome summary once resolved", () => {
    const order: FleetOrderView = { id: "o1", targetLabel: "Aurelia", status: "RESOLVED", departsAt: 0, arrivesAt: 0, outcomeSummary: "Dealt 50 net damage, Stability now 50" };
    const html = fleetOrderListHtml([order]);
    expect(html).toContain("RESOLVED");
    expect(html).toContain("Dealt 50 net damage");
  });

  it("omits outcome text for a still-traveling order", () => {
    const order: FleetOrderView = { id: "o2", targetLabel: "Vex", status: "TRAVELING", departsAt: 0, arrivesAt: 0 };
    const html = fleetOrderListHtml([order]);
    expect(html).toContain("TRAVELING");
    expect(html).not.toContain("fl-order-outcome");
  });

  it("shows a BUILDING order distinctly from TRAVELING, with a departs-eta instead of an arrives-eta", () => {
    const order: FleetOrderView = { id: "o3", targetLabel: "Vex", status: "BUILDING", departsAt: Date.now() + 3_600_000, arrivesAt: Date.now() + 7_200_000 };
    const html = fleetOrderListHtml([order]);
    expect(html).toContain("BUILDING");
    expect(html).toContain("departs");
    expect(html).not.toContain("arrives");
  });

  it("marks a GARRISON order's target with a (home) suffix and a house icon", () => {
    const order: FleetOrderView = { id: "o4", targetLabel: "Aurelia", status: "TRAVELING", departsAt: 0, arrivesAt: 0, garrison: true };
    const html = fleetOrderListHtml([order]);
    expect(html).toContain("Aurelia (home)");
    expect(html).toContain("🏠");
  });
});

describe("fleetBattleLogHtml", () => {
  it("renders an empty state with no entries", () => {
    expect(fleetBattleLogHtml([])).toContain("No raids logged yet.");
  });

  it("renders attacker/defender/summary for a logged raid", () => {
    const entry: FleetBattleLogEntryView = { attackerLabel: "uid-1", defenderLabel: "uid-2", summary: "50 dmg -> Stability 50", resolvedAt: 0 };
    const html = fleetBattleLogHtml([entry]);
    expect(html).toContain("uid-1");
    expect(html).toContain("uid-2");
    expect(html).toContain("50 dmg -&gt; Stability 50");
  });
});

describe("fleetTargetOptionsHtml", () => {
  it("renders an option per target with the seasonId as the value", () => {
    const html = fleetTargetOptionsHtml([{ seasonId: "season-1", label: "Aurelia" }]);
    expect(html).toBe('<option value="season-1">Aurelia</option>');
  });
});

describe("fleetHullCardsHtml", () => {
  it("renders a card per hull class with its stepper starting at the given count", () => {
    const html = fleetHullCardsHtml({ RAIDER: 2 });
    expect(html).toContain('data-fleet-hull-card="RAIDER"');
    expect(html).toContain('value="2" class="fl-hull-count" data-fleet-hull-count="RAIDER"');
    expect(html).toContain("fl-hull-card-active");
  });

  it("marks a zero-count hull card as inactive", () => {
    const html = fleetHullCardsHtml({});
    expect(html).not.toContain("fl-hull-card-active");
  });
});

describe("fleetCompositionSummaryHtml", () => {
  it("shows a placeholder when nothing is selected", () => {
    expect(fleetCompositionSummaryHtml({})).toContain("Pick at least one hull");
  });

  it("computes total cost, damage, and travel time for a mixed composition", () => {
    const html = fleetCompositionSummaryHtml({ RAIDER: 2, SCOUT: 1 });
    expect(html).toContain("💰 185");
    expect(html).toContain("💥 100");
  });

  it("flags an all-recon composition as recon only with zero damage", () => {
    const html = fleetCompositionSummaryHtml({ SCOUT: 2 });
    expect(html).toContain("Recon only");
    expect(html).not.toContain("💥");
  });

  it("includes a Build time stat alongside cost/damage/travel", () => {
    const html = fleetCompositionSummaryHtml({ RAIDER: 1 });
    expect(html).toContain("Build");
    expect(html).toContain("🔧");
  });
});

describe("fleetPanelHtml", () => {
  it("shows a disabled placeholder target option so nothing is auto-selected", () => {
    const html = fleetPanelHtml('<option value="season-2">Rival</option>');
    expect(html).toContain('<option value="" disabled selected>Choose a target...</option>');
  });

  it("renders a hidden empty home optgroup when no home options are given", () => {
    const html = fleetPanelHtml('<option value="season-2">Rival</option>');
    expect(html).toContain("data-fleet-home-optgroup");
    expect(html).toMatch(/data-fleet-home-optgroup[^>]*hidden/);
  });

  it("renders a visible home optgroup with the given options when provided", () => {
    const html = fleetPanelHtml('<option value="season-2">Rival</option>', '<option value="season-1">Aurelia</option>');
    expect(html).not.toMatch(/data-fleet-home-optgroup[^>]*hidden/);
    expect(html).toContain('<option value="season-1">Aurelia</option>');
  });

  it("hides the threats section when there are no threats", () => {
    const html = fleetPanelHtml('<option value="season-2">Rival</option>');
    expect(html).toMatch(/data-fleet-threats-section[^>]*hidden/);
  });

  it("shows the threats section when threatsHtml is given", () => {
    const html = fleetPanelHtml('<option value="season-2">Rival</option>', "", '<li class="fl-threat">x</li>');
    expect(html).not.toMatch(/data-fleet-threats-section[^>]*hidden/);
  });
});

describe("fleetThreatListHtml", () => {
  it("renders an empty string when there are no threats", () => {
    expect(fleetThreatListHtml([])).toBe("");
  });

  it("renders the target label and an ETA per threat, with no attacker info at all", () => {
    const threat: FleetThreatView = { targetLabel: "Aurelia", arrivesAt: Date.now() + 3_600_000 };
    const html = fleetThreatListHtml([threat]);
    expect(html).toContain("Aurelia");
    expect(html).toContain("arrives");
    expect(html).toContain("⚠️");
  });

  it("escapes a target label containing HTML", () => {
    const html = fleetThreatListHtml([{ targetLabel: "<script>x</script>", arrivesAt: 0 }]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
