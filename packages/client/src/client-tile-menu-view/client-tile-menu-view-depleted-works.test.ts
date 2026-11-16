// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { tileFactsFor } from "../client-hud-v2/client-hud-v2-tile-facts.js";
import { menuOverviewForTile } from "../client-tile-menu-view/client-tile-menu-view.js";
import { tileMenuTitleForTile } from "../client-tile-menu-view/client-tile-menu-title.js";
import type { Tile } from "../client-types.js";
const deps = {
  state: { me: "me" }, prettyToken: (v: string) => v, terrainLabel: (_x: number, _y: number, t: Tile["terrain"]) => t,
  displayTownGoldPerMinute: () => 0, populationPerMinuteLabel: () => "0/m", townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[], connectedDockCountForTile: () => 0, hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "", tileHistoryLines: () => [] as string[], isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [], townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `[${label ?? type}]`
};
describe("a depleted Reclamation Works in the tile panels", () => {
  it.each(["me", "ai-1"])("reads as depleted to its owner and to others (owner %s)", (owner) => {
    const tile: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: owner, ownershipState: "SETTLED", detailLevel: "full",
      economicStructure: { ownerId: owner, type: "RECLAMATION_WORKS", status: "active", salvageLoadsShipped: 3 } } as Tile;
    expect(tileMenuTitleForTile(tile, deps.prettyToken, deps.terrainLabel).titleLabel).toBe("Depleted Reclamation Works");
    // Regression: the panel called it an Active "Reclamation Works".
    expect(tileFactsFor(tile, { combatBreakdown: undefined, overviewLines: [] } as never, "me")).toEqual([
      { label: "Building", value: "Depleted Reclamation Works" }, { label: "State", value: "Depleted · no salvage left", tone: "warn" }
    ]);
    const overview = menuOverviewForTile(tile, deps as never).map(l => l.html);
    expect(overview).toContain("Built: [Depleted Reclamation Works]");
    expect(overview.some(line => line.startsWith("Depleted:"))).toBe(true);
    expect(overview.some(line => line.includes("Dismantle"))).toBe(owner === "me");
  });
  it("still shows a depleted Works being dismantled as Removing", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RECLAMATION_WORKS", status: "removing", salvageLoadsShipped: 3 } } as Tile;
    expect(tileFactsFor(tile, { combatBreakdown: undefined, overviewLines: [] } as never, "me")[1]).toMatchObject({ label: "State", value: "Removing" });
  });
});
