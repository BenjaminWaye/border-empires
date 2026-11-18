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

const menuOverviewWith = (patch: Partial<Tile>) =>
  menuOverviewForTile(
    {
      x: 30, y: 30, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...patch,
      town: {
        name: "Bryn", type: "MARKET", baseGoldPerMinute: 2, supportCurrent: 4, supportMax: 4, goldPerMinute: 0.01, cap: 0,
        isFed: true, population: 20_000, maxPopulation: 50_000, populationTier: "TOWN",
        connectedTownCount: 0, connectedTownBonus: 0,
        hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false
      }
    } as Tile,
    deps as never
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

  // Playtest 2026-11-18: full food coverage forced an unfed town to read fed, so its 0 coin had no reason.
  // The sim's isFed is used as-is (as in HUD v2), and the grid and growth line agree on it.
  it("keeps the sim's unfed state with full food coverage, coin card and growth line agreeing", () => {
    const lines = townTile({ isFed: false, goldPerMinute: 0 }, { upkeepLastTick: { foodCoverage: 1 } });
    const grid = lines.find((line) => line.kind === "statgrid")?.html ?? "";
    expect(grid).toContain("no coin · garrison grain or fish in reach");
    expect(grid).toContain("Growth paused — town is unfed");
  });

  // A zero-coin cause the bonus lines don't name (sabotage) is named the same way as on HUD v2.
  it("names sabotage as the reason a fed town earns no coin", () => {
    const lines = townTile({ goldPerMinute: 0.01, supportCurrent: 4 });
    const sabotaged = menuOverviewWith({ sabotage: { ownerId: "rival", endsAt: Date.now() + 60_000, outputMultiplier: 0 } });
    expect(lines.find((line) => line.kind === "statgrid")?.html).not.toContain("Sabotaged");
    expect(sabotaged.find((line) => line.kind === "statgrid")?.html).toContain("<strong>Sabotaged</strong> · no coin");
  });
});
