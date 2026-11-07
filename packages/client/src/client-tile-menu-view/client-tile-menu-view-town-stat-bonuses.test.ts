import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: (ownerId?: string | null) => ownerId ?? undefined,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  currentManpower: 100,
  currentManpowerCap: 100,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button data-structure-info="${type}">${label ?? type}</button>`
};

const townTile = (town: Partial<NonNullable<Tile["town"]>>, extraState: Record<string, unknown> = {}) =>
  menuOverviewForTile(
    {
      x: 30, y: 30, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
      town: {
        name: "Bryn", type: "MARKET", baseGoldPerMinute: 2, supportCurrent: 2, supportMax: 4, goldPerMinute: 5, cap: 0,
        isFed: true, population: 20_000, maxPopulation: 50_000, populationTier: "TOWN",
        connectedTownCount: 1, connectedTownBonus: 0.5, tradeNexusTownNames: ["Avalon"],
        hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false,
        ...town
      }
    } as Tile,
    { ...deps, state: { ...deps.state, ...extraState } } as never
  );

describe("menuOverviewForTile — town stat bonuses", () => {
  // Regression: the connected-town and support coin lines were listed twice
  // (Coin card and Modifiers section) with different wording.
  it("lists coin bonuses once, inside the Coin card", () => {
    const lines = townTile({});
    const grid = lines.find((line) => line.kind === "statgrid")?.html ?? "";
    expect(grid).toContain("Trade Nexus in Avalon");
    expect(grid).toContain("Support 2/4");
    const others = lines.filter((line) => line.kind !== "statgrid").map((line) => line.html).join("\n");
    expect(others).not.toContain("connected town");
    expect(others).not.toContain("Support 2/4");
  });

  // Regression: a stale isFed:false with full food coverage showed
  // "coin production stopped" while the growth line said the town was fed.
  it("treats a stale unfed flag with full food coverage as fed", () => {
    const lines = townTile({ isFed: false }, { upkeepLastTick: { foodCoverage: 1 } });
    const grid = lines.find((line) => line.kind === "statgrid")?.html ?? "";
    expect(grid).not.toContain("coin production stopped");
    expect(grid).toContain("Trade Nexus in Avalon");
  });
});
