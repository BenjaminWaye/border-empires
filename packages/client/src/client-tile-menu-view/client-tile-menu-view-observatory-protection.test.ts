import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

const ownObservatoryTile = (cooldownUntil: number): Tile => ({
  x: 85,
  y: 164,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  observatory: { ownerId: "me", status: "active", cooldownUntil },
  upkeepEntries: [{ label: "Observatory", perMinute: { CRYSTAL: 0.03 } }]
});

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
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [] as TileOverviewModifier[],
  townPartialLoadingStartedAt: () => Date.now()
};

describe("menuOverviewForTile — Aether Tower cooldown vs. protection status", () => {
  it("says an on-cooldown Aether Tower is not currently blocking hostile crystal actions", () => {
    const lines = menuOverviewForTile(ownObservatoryTile(Date.now() + 90_000), deps);
    expect(
      lines.some((line) => line.html.includes("on cooldown") && line.html.includes("not blocking hostile crystal actions"))
    ).toBe(true);
    expect(lines.some((line) => line.html === "Aether Tower is active here and blocks hostile crystal actions nearby.")).toBe(false);
  });

  it("says a ready Aether Tower blocks hostile crystal actions nearby", () => {
    const lines = menuOverviewForTile(ownObservatoryTile(Date.now() - 1_000), deps);
    expect(lines.some((line) => line.html === "Aether Tower is active here and blocks hostile crystal actions nearby.")).toBe(true);
  });
});
