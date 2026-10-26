import { describe, expect, it } from "vitest";
import type { Tile, TileMenuView } from "../client-types.js";
import { actionBarHtml, hasDetails } from "./client-hud-v2-action-bar.js";
import { tileFactsFor, townGrowth, wonderName, type TileFact } from "./client-hud-v2-tile-facts.js";

const tile = (patch: Partial<Tile>): Tile => ({ x: 3, y: 4, terrain: "LAND", ...patch }) as Tile;
const noView: Pick<TileMenuView, "combatBreakdown" | "overviewLines"> = { overviewLines: [] };
const labels = (facts: TileFact[]): string[] => facts.map((f) => f.label);

describe("tile fact strip", () => {
  it("says what your building is, whether it runs, what it gives and costs", () => {
    const facts = tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "MINE", status: "active" } }), noView, "me");
    expect(facts[0]).toEqual({ label: "Building", value: "Mine" });
    expect(facts[1]).toEqual({ label: "State", value: "Active", tone: "good" });
    expect(labels(facts)).toContain("Gives");
    expect(labels(facts)).toContain("Upkeep");
  });

  it("flags a building shut down by upkeep and hides upkeep on someone else's", () => {
    const off = tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "MINE", status: "inactive", inactiveReason: "upkeep" } }), noView, "me");
    expect(off[1]).toEqual({ label: "State", value: "Off · no upkeep", tone: "warn" });
    const theirs = tileFactsFor(tile({ ownerId: "them", ownershipState: "SETTLED", economicStructure: { ownerId: "them", type: "MINE", status: "active" } }), noView, "me");
    expect(labels(theirs)).not.toContain("Upkeep");
  });

  it("gives a dock's coin and links", () => {
    const facts = tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", dockId: "d1", dock: { baseGoldPerMinute: 0.5, goldPerMinute: 1, connectedDockCount: 0 } }), noView, "me");
    expect(facts).toEqual([{ label: "Dock", value: "1440.0/day" }, { label: "Linked", value: "None", tone: "warn" }]);
  });

  it("gives a town's tier, coin and food", () => {
    const town = { populationTier: "TOWN", isFed: false } as NonNullable<Tile["town"]>;
    const facts = tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", town, yieldRate: { goldPerMinute: 0.01 } }), noView, "me");
    expect(labels(facts)).toEqual(["Town", "Coin", "Food"]);
    expect(facts[1]?.value).toBe("14.4/day");
    expect(facts[2]).toEqual({ label: "Food", value: "Unfed", tone: "warn" });
  });

  it("gives the odds and the muster an enemy fort demands", () => {
    const view = {
      combatBreakdown: { winChance: 0.42 } as TileMenuView["combatBreakdown"],
      overviewLines: [{ html: "Capturing requires 120 mustered manpower." }]
    };
    const facts = tileFactsFor(tile({ ownerId: "them", ownershipState: "SETTLED", fort: { ownerId: "them", status: "active" } }), view, "me");
    expect(facts).toContainEqual({ label: "Odds", value: "42%", tone: "warn" });
    expect(facts).toContainEqual({ label: "Needs", value: "120 manpower" });
  });

  // Regression: a Deepwater wonder tile showed only "Sand" with no sign it was a wonder.
  it("names a natural wonder and says what it gives", () => {
    const t = tile({ terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", naturalWonder: { type: "DEEPWATER_ENGINE" } });
    expect(wonderName(t)).toBe("Deepwater Engine");
    const facts = tileFactsFor(t, noView, "me");
    expect(facts.slice(0, 3)).toEqual([
      { label: "Wonder", value: "Deepwater Engine" },
      { label: "State", value: "Garrison to activate" },
      { label: "Gives", value: "dock coin income doubled; dock-launched attacks +15% ATK" }
    ]);
  });

  it("names a relic and keeps its benefit short", () => {
    const t = tile({ ownerId: "me", ownershipState: "SETTLED", naturalWonder: { type: "DEEPWATER_ENGINE", relicVersion: 1 } });
    expect(wonderName(t)).toBe("Antimatter Drive Works");
    expect(tileFactsFor(t, noView, "me")).toContainEqual({ label: "Gives", value: "Dock income ×2" });
  });

  // Regression: your town showed no growth rate.
  it("gives your town's growth rate, or that it is paused", () => {
    const growing = { populationTier: "TOWN", population: 20_000, isFed: true, populationGrowthPerMinute: 12.5 } as NonNullable<Tile["town"]>;
    expect(tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", town: growing }), noView, "me")).toContainEqual({ label: "Growth", value: "+12.5/m" });
    expect(townGrowth(growing, 0)?.eta).toMatch(/^City in ~/);
    const unfed = { ...growing, isFed: false };
    expect(townGrowth(unfed, 0)?.paused).toBe(true);
    expect(townGrowth({ ...growing, populationGrowthPerMinute: undefined } as unknown as NonNullable<Tile["town"]>, 0)).toBeUndefined();
  });

  it("caps the strip at four facts", () => {
    const town = { populationTier: "CITY", isFed: true } as NonNullable<Tile["town"]>;
    const facts = tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", town, economicStructure: { ownerId: "me", type: "MANUFACTORY", status: "active" } }), noView, "me");
    expect(facts.length).toBeLessThanOrEqual(4);
  });
});

describe("tile details", () => {
  const view = (overviewLines: TileMenuView["overviewLines"]): TileMenuView =>
    ({ title: "Dock (3, 4)", subtitle: "", tabs: [], overviewLines, actions: [], buildings: [], crystal: [] }) as TileMenuView;

  it("opens the full overview inside the panel, without the legacy info buttons", () => {
    const v = view([{ html: "Upkeep", kind: "section" }, { html: 'Fort: <button data-structure-info="FORT">Fort</button> 1 FOOD slot' }]);
    expect(hasDetails(v)).toBe(true);
    expect(actionBarHtml(v)).toContain('data-hud-v2-panel="details"');
    expect(actionBarHtml(v)).not.toContain("hud-v2-details");
    const open = actionBarHtml(v, "details");
    expect(open).toContain("hud-v2-details");
    expect(open).not.toContain("<button data-structure-info");
    expect(open).toContain("Fort: Fort 1 FOOD slot");
  });

  it("offers no Details while the overview is still loading", () => {
    expect(hasDetails(view([{ html: "<span>Loading</span>", kind: "loading" }]))).toBe(false);
  });
});
