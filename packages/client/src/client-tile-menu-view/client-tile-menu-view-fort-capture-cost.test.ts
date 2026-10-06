import { describe, expect, it } from "vitest";

import { requiredMusterForFort } from "@border-empires/shared";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

// The fort overview's "Capturing requires N mustered manpower" line replaced
// the old Garrison fill line when the fort-garrison mechanic was removed. It
// must report the same number the client's own attack gate enforces
// (findClosestMuster -> requiredMusterForTarget in client-muster-attack-gate.ts),
// not the fort tier's flat cost alone. Barbarian-held tiles use the same
// ladder as player-held ones (there are no raids).
const baseDeps = {
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
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button data-structure-info="${type}">${label ?? type}</button>`
};

const captureLine = (tile: Tile): string | undefined =>
  menuOverviewForTile(tile, baseDeps).find((line) => line.html.includes("Capturing requires"))?.html;

describe("menuOverviewForTile — fort capture cost line", () => {
  it("reports the fort tier's flat muster cost for an enemy-player fort", () => {
    const line = captureLine({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "enemy",
      ownershipState: "SETTLED",
      fort: { ownerId: "enemy", status: "active", variant: "FORT" }
    });
    expect(line).toContain(`Capturing requires ${requiredMusterForFort("FORT")} mustered manpower.`);
  });

  it("reports the normal fort-tier cost on a barbarian-held fort, same as a player-held one", () => {
    const line = captureLine({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "barbarian-1",
      ownershipState: "SETTLED",
      fort: { ownerId: "barbarian-1", status: "active", variant: "FORT" }
    });
    expect(line).toContain(`Capturing requires ${requiredMusterForFort("FORT")} mustered manpower.`);
  });

  it("omits the line entirely while the fort is still under construction", () => {
    const line = captureLine({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "enemy",
      ownershipState: "SETTLED",
      fort: { ownerId: "enemy", status: "under_construction" }
    });
    expect(line).toBeUndefined();
  });
});
