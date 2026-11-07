import { describe, expect, it } from "vitest";
import type { Tile, TileMenuView } from "../client-types.js";
import { tileFactsFor, type DormantResourcesFor } from "./client-hud-v2-tile-facts.js";
import { townScreenRegions } from "./client-hud-v2-town.js";

// Regression: a Fort short of its Titanium upkeep slot floats a crossed-out
// Titanium badge on the map, but the HUD said "Active" (dormancy isn't a wire
// status) and the town screen didn't show a Fort on the town tile at all.
const view = (over: Partial<TileMenuView> = {}): TileMenuView => ({ title: "Halveth (5, 5)", subtitle: "", tabs: ["actions"], overviewLines: [], actions: [], buildings: [], crystal: [], ...over });
const fortTown = {
  x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: { name: "Halveth", type: "MARKET", population: 50, populationTier: "TOWN" },
  fort: { ownerId: "me", status: "active" }
} as unknown as Tile;
const titaniumShort: DormantResourcesFor = (tile, field) => (tile.x === 5 && tile.y === 5 && field === "fort" ? ["TITANIUM"] : undefined);

describe("dormant structures in the HUD", () => {
  it("tile strip calls a slot-short Fort dormant with no defense bonus", () => {
    const fortTile = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", fort: { ownerId: "me", status: "active" } } as Tile;
    const facts = tileFactsFor(fortTile, { overviewLines: [] }, "me", Date.now(), titaniumShort);
    expect(facts).toContainEqual({ label: "State", value: "Dormant · no Titanium slot", tone: "warn" });
    expect(facts).toContainEqual({ label: "Gives", value: "No Defense bonus", tone: "warn" });
    expect(facts.some((f) => f.value === "Active")).toBe(false);
    // Not dormant: unchanged.
    const live = tileFactsFor(fortTile, { overviewLines: [] }, "me", Date.now(), () => undefined);
    expect(live).toContainEqual({ label: "State", value: "Active", tone: "good" });
    expect(live).toContainEqual({ label: "Gives", value: "Defense 2.5x" });
  });

  it("town screen shows a Fort standing on the town tile, and that it's dormant", () => {
    const { build } = townScreenRegions({ town: fortTown, focus: fortTown, townView: view(), focusView: view(), townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined, dormantResourcesFor: titaniumShort });
    expect(build).toContain("Built here");
    expect(build).toContain("Fort");
    expect(build).toContain("Dormant · no Titanium slot");
    expect(build).toContain("No Defense bonus");
  });
});
