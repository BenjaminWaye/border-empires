import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "./client-types.js";

const settledSupportTile = (status: NonNullable<Tile["economicStructure"]>["status"], disabledUntil?: number): Tile => ({
  x: 90,
  y: 329,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  economicStructure: {
    ownerId: "me",
    type: "FUR_SYNTHESIZER",
    status,
    ...(disabledUntil !== undefined ? { disabledUntil } : {})
  }
});

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  growthModifierPercentLabel: () => "0%"
};

describe("menuOverviewForTile", () => {
  it("calls out active synth structures explicitly", () => {
    const lines = menuOverviewForTile(settledSupportTile("active"), deps);
    expect(lines.some((line) => line.html.includes("currently contributing output and upkeep"))).toBe(true);
  });

  it("calls out inactive support structures", () => {
    const lines = menuOverviewForTile(settledSupportTile("inactive"), deps);
    expect(lines.some((line) => line.html.includes("currently contributes no output or upkeep"))).toBe(true);
  });

  it("distinguishes overloaded recovery from generic inactivity", () => {
    const lines = menuOverviewForTile(settledSupportTile("inactive", Date.now() + 60_000), deps);
    expect(lines.some((line) => line.html.includes("disabled while recovering from overload"))).toBe(true);
  });
});
